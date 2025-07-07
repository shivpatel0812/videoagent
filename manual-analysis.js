require('dotenv').config({ path: './ai-agent/.env' });
const tf = require('@tensorflow/tfjs-node');
const cocoSsd = require('@tensorflow-models/coco-ssd');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

class PersonTracker {
  constructor() {
    this.tracks = [];
    this.nextTrackId = 1;
  }

  calculateDistance(box1, box2) {
    const center1 = {
      x: box1.x + box1.width / 2,
      y: box1.y + box1.height / 2
    };
    const center2 = {
      x: box2.x + box2.width / 2,
      y: box2.y + box2.height / 2
    };
    
    return Math.sqrt(
      Math.pow(center1.x - center2.x, 2) + 
      Math.pow(center1.y - center2.y, 2)
    );
  }

  calculateIoU(box1, box2) {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);
    
    if (x2 <= x1 || y2 <= y1) return 0;
    
    const intersection = (x2 - x1) * (y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;
    
    return intersection / union;
  }

  updateTracks(detections, timestamp) {
    const matchedTracks = new Set();
    const newDetections = [];

    for (const detection of detections) {
      let bestMatch = null;
      let bestScore = 0;

      for (let i = 0; i < this.tracks.length; i++) {
        if (matchedTracks.has(i)) continue;
        
        const track = this.tracks[i];
        const lastDetection = track.detections[track.detections.length - 1];
        
        const timeDiff = timestamp - lastDetection.timestamp;
        if (timeDiff > 10) continue;
        
        const distance = this.calculateDistance(detection.bbox, lastDetection.bbox);
        const iou = this.calculateIoU(detection.bbox, lastDetection.bbox);
        
        const score = iou * 0.7 + (1.0 / (1 + distance / 100)) * 0.3;
        
        if (score > bestScore && score > 0.3) {
          bestScore = score;
          bestMatch = i;
        }
      }

      if (bestMatch !== null) {
        this.tracks[bestMatch].detections.push({
          timestamp,
          bbox: detection.bbox,
          confidence: detection.confidence
        });
        this.tracks[bestMatch].lastSeen = timestamp;
        matchedTracks.add(bestMatch);
      } else {
        newDetections.push(detection);
      }
    }

    for (const detection of newDetections) {
      this.tracks.push({
        id: this.nextTrackId++,
        detections: [{
          timestamp,
          bbox: detection.bbox,
          confidence: detection.confidence
        }],
        firstSeen: timestamp,
        lastSeen: timestamp
      });
    }
  }

  getActiveTracks(minDuration = 2) {
    return this.tracks.filter(track => 
      (track.lastSeen - track.firstSeen) >= minDuration && 
      track.detections.length >= 2
    );
  }

  getTrackSummary() {
    const activeTracks = this.getActiveTracks();
    
    return {
      totalTracks: this.tracks.length,
      activeTracks: activeTracks.length,
      shortTracks: this.tracks.length - activeTracks.length,
      tracks: activeTracks.map(track => ({
        id: track.id,
        duration: track.lastSeen - track.firstSeen,
        detections: track.detections.length,
        avgConfidence: track.detections.reduce((sum, d) => sum + d.confidence, 0) / track.detections.length,
        firstSeen: track.firstSeen,
        lastSeen: track.lastSeen
      }))
    };
  }
}

class VideoRAGProcessor {
  constructor() {
    this.documents = [];
  }

  addFrameAnalysis(frameNumber, timestamp, detections, tracks) {
    if (detections.length > 0) {
      this.documents.push({
        type: 'frame',
        frameNumber,
        timestamp,
        content: `Frame ${frameNumber} at ${timestamp}s: ${detections.length} people detected`,
        metadata: {
          peopleCount: detections.length,
          avgConfidence: detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length
        }
      });
    }

    if (tracks.length > 0) {
      this.documents.push({
        type: 'tracking',
        frameNumber,
        timestamp,
        content: `Tracking update at ${timestamp}s: ${tracks.length} active tracks`,
        metadata: {
          activeTracksCount: tracks.length
        }
      });
    }
  }

  addSummary(summary) {
    this.documents.push({
      type: 'summary',
      content: `Video analysis complete: ${summary.activeTracks} unique people identified over ${summary.totalTracks} total tracks`,
      metadata: summary
    });
  }

  query(queryType) {
    switch (queryType) {
      case 'people_count':
        const summaryDoc = this.documents.find(d => d.type === 'summary');
        return summaryDoc ? summaryDoc.metadata : null;
      
      case 'timeline':
        return this.documents
          .filter(d => d.type === 'frame')
          .map(d => ({
            timestamp: d.timestamp,
            peopleCount: d.metadata.peopleCount,
            confidence: d.metadata.avgConfidence
          }));
      
      case 'peak_activity':
        const frameData = this.documents.filter(d => d.type === 'frame');
        return frameData.reduce((max, curr) => 
          curr.metadata.peopleCount > max.peopleCount ? 
          { timestamp: curr.timestamp, peopleCount: curr.metadata.peopleCount } : max,
          { timestamp: 0, peopleCount: 0 }
        );
      
      default:
        return this.documents.filter(d => d.content.toLowerCase().includes(queryType.toLowerCase()));
    }
  }
}

async function manualVideoAnalysis() {
  const videoPath = '/Users/shivpatel/Downloads/18361966-uhd_3840_2160_60fps.mp4';
  const outputDir = './analysis-output';
  
  console.log('🎥 Loading AI models...');
  const model = await cocoSsd.load();
  const tracker = new PersonTracker();
  const ragProcessor = new VideoRAGProcessor();
  
  console.log('📹 Extracting frames...');
  await fs.mkdir(outputDir, { recursive: true });
  
  const framePattern = path.join(outputDir, 'frame_%04d.jpg');
  
  await new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .fps(0.5)
      .output(framePattern)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
  
  console.log('🔍 Manual analysis with tracking...');
  const frameFiles = await fs.readdir(outputDir);
  const sortedFrames = frameFiles
    .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort();
  
  for (let i = 0; i < sortedFrames.length; i++) {
    const frameFile = sortedFrames[i];
    const framePath = path.join(outputDir, frameFile);
    const timestamp = i * 2;
    
    try {
      const imageBuffer = await fs.readFile(framePath);
      const { data, info } = await sharp(imageBuffer)
        .resize(640, 480)
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      const tensor = tf.tensor3d(data, [info.height, info.width, info.channels]);
      const predictions = await model.detect(tensor);
      tensor.dispose();
      
      const people = predictions
        .filter(p => p.class === 'person' && p.score > 0.5)
        .map(p => ({
          bbox: {
            x: p.bbox[0],
            y: p.bbox[1], 
            width: p.bbox[2],
            height: p.bbox[3]
          },
          confidence: p.score
        }));
      
      tracker.updateTracks(people, timestamp);
      const activeTracks = tracker.getActiveTracks();
      
      ragProcessor.addFrameAnalysis(i + 1, timestamp, people, activeTracks);
      
      console.log(`Frame ${i + 1}/${sortedFrames.length}: ${people.length} detected, ${activeTracks.length} tracked`);
      
    } catch (error) {
      console.log(`Frame ${i + 1}: Error - ${error.message}`);
    }
  }
  
  const trackSummary = tracker.getTrackSummary();
  ragProcessor.addSummary(trackSummary);
  
  console.log('\n📊 MANUAL ANALYSIS RESULTS:');
  console.log('============================');
  console.log(`Unique people identified: ${trackSummary.activeTracks}`);
  console.log(`Total detection tracks: ${trackSummary.totalTracks}`);
  console.log(`Short-lived tracks (noise): ${trackSummary.shortTracks}`);
  
  console.log('\n👥 Individual Track Details:');
  trackSummary.tracks.forEach(track => {
    console.log(`Person ${track.id}: ${track.duration}s duration, ${track.detections} detections, ${(track.avgConfidence * 100).toFixed(1)}% avg confidence`);
  });
  
  console.log('\n🔍 RAG Query Results:');
  console.log('People Count:', ragProcessor.query('people_count'));
  console.log('Peak Activity:', ragProcessor.query('peak_activity'));
  
  const timeline = ragProcessor.query('timeline');
  console.log('Timeline Summary:');
  timeline.slice(0, 5).forEach(t => {
    console.log(`  ${t.timestamp}s: ${t.peopleCount} people (${(t.confidence * 100).toFixed(1)}% confidence)`);
  });
  
  console.log('\n✅ Manual analysis complete!');
  
  await fs.rm(outputDir, { recursive: true, force: true });
}

manualVideoAnalysis().catch(console.error);
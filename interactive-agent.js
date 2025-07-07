require('dotenv').config({ path: './ai-agent/.env' });
const { ChatAnthropic } = require('@langchain/anthropic');
const tf = require('@tensorflow/tfjs-node');
const cocoSsd = require('@tensorflow-models/coco-ssd');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

class VideoDataExtractor {
  constructor() {
    this.model = null;
    this.extractedData = {
      objects: [],
      movements: [],
      interactions: [],
      zones: [],
      temporal: [],
      attributes: []
    };
  }

  async initialize() {
    this.model = await cocoSsd.load();
  }

  extractObjectData(predictions, frameNumber, timestamp) {
    const objects = predictions.map((pred, idx) => ({
      id: `${frameNumber}_${idx}`,
      type: pred.class,
      confidence: pred.score,
      bbox: {
        x: pred.bbox[0],
        y: pred.bbox[1],
        width: pred.bbox[2],
        height: pred.bbox[3],
        centerX: pred.bbox[0] + pred.bbox[2] / 2,
        centerY: pred.bbox[1] + pred.bbox[3] / 2
      },
      frameNumber,
      timestamp,
      size: pred.bbox[2] * pred.bbox[3],
      aspectRatio: pred.bbox[2] / pred.bbox[3]
    }));

    this.extractedData.objects.push(...objects);
    return objects;
  }

  extractMovementData(currentObjects, previousObjects, timestamp) {
    if (!previousObjects || previousObjects.length === 0) return [];

    const movements = [];
    
    for (const current of currentObjects) {
      for (const previous of previousObjects) {
        if (current.type === previous.type) {
          const distance = Math.sqrt(
            Math.pow(current.bbox.centerX - previous.bbox.centerX, 2) + 
            Math.pow(current.bbox.centerY - previous.bbox.centerY, 2)
          );
          
          if (distance > 20 && distance < 300) {
            const movement = {
              objectType: current.type,
              distance,
              direction: this.calculateDirection(previous.bbox, current.bbox),
              speed: distance / 2,
              timestamp,
              startPoint: { x: previous.bbox.centerX, y: previous.bbox.centerY },
              endPoint: { x: current.bbox.centerX, y: current.bbox.centerY }
            };
            
            movements.push(movement);
          }
        }
      }
    }

    this.extractedData.movements.push(...movements);
    return movements;
  }

  calculateDirection(from, to) {
    const dx = to.centerX - from.centerX;
    const dy = to.centerY - from.centerY;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
    if (angle >= -45 && angle < 45) return 'right';
    if (angle >= 45 && angle < 135) return 'down';
    if (angle >= 135 || angle < -135) return 'left';
    return 'up';
  }

  defineZones(frameWidth, frameHeight) {
    return {
      zones: [
        { name: 'top', bounds: { x: 0, y: 0, width: frameWidth, height: frameHeight * 0.3 }},
        { name: 'middle', bounds: { x: 0, y: frameHeight * 0.3, width: frameWidth, height: frameHeight * 0.4 }},
        { name: 'bottom', bounds: { x: 0, y: frameHeight * 0.7, width: frameWidth, height: frameHeight * 0.3 }},
        { name: 'left', bounds: { x: 0, y: 0, width: frameWidth * 0.3, height: frameHeight }},
        { name: 'center', bounds: { x: frameWidth * 0.3, y: 0, width: frameWidth * 0.4, height: frameHeight }},
        { name: 'right', bounds: { x: frameWidth * 0.7, y: 0, width: frameWidth * 0.3, height: frameHeight }},
        { name: 'door_area', bounds: { x: frameWidth * 0.4, y: frameHeight * 0.1, width: frameWidth * 0.2, height: frameHeight * 0.8 }}
      ]
    };
  }

  extractZoneData(objects, zones, timestamp) {
    const zoneData = [];
    
    for (const obj of objects) {
      for (const zone of zones.zones) {
        if (this.isInZone(obj.bbox, zone.bounds)) {
          zoneData.push({
            objectType: obj.type,
            zoneName: zone.name,
            timestamp,
            confidence: obj.confidence,
            objectId: obj.id
          });
        }
      }
    }

    this.extractedData.zones.push(...zoneData);
    return zoneData;
  }

  isInZone(bbox, zone) {
    const objCenterX = bbox.centerX;
    const objCenterY = bbox.centerY;
    
    return objCenterX >= zone.x && 
           objCenterX <= zone.x + zone.width &&
           objCenterY >= zone.y && 
           objCenterY <= zone.y + zone.height;
  }

  extractAttributeData(objects, timestamp) {
    const attributes = objects.map(obj => ({
      objectId: obj.id,
      type: obj.type,
      size: obj.size > 10000 ? 'large' : obj.size > 5000 ? 'medium' : 'small',
      position: obj.bbox.centerY < 200 ? 'top' : obj.bbox.centerY > 400 ? 'bottom' : 'center',
      timestamp,
      estimatedGender: obj.type === 'person' ? this.estimateGender(obj) : null,
      estimatedAge: obj.type === 'person' ? this.estimateAge(obj) : null
    }));

    this.extractedData.attributes.push(...attributes);
    return attributes;
  }

  estimateGender(personObj) {
    return personObj.aspectRatio > 0.4 ? 'likely_male' : 'likely_female';
  }

  estimateAge(personObj) {
    return personObj.size > 8000 ? 'adult' : 'child';
  }

  extractTemporalData(timestamp, objects, movements) {
    const temporal = {
      timestamp,
      totalObjects: objects.length,
      objectTypes: [...new Set(objects.map(o => o.type))],
      avgConfidence: objects.reduce((sum, o) => sum + o.confidence, 0) / objects.length,
      totalMovements: movements.length,
      activeZones: [...new Set(this.extractedData.zones
        .filter(z => z.timestamp === timestamp)
        .map(z => z.zoneName))]
    };

    this.extractedData.temporal.push(temporal);
    return temporal;
  }
}

class VideoRAGSystem {
  constructor() {
    this.documents = [];
  }

  indexVideoData(extractedData) {
    this.indexObjects(extractedData.objects);
    this.indexMovements(extractedData.movements);
    this.indexZones(extractedData.zones);
    this.indexTemporal(extractedData.temporal);
    this.indexAttributes(extractedData.attributes);
  }

  indexObjects(objects) {
    const objectSummary = this.groupBy(objects, 'type');
    
    for (const [type, items] of Object.entries(objectSummary)) {
      this.documents.push({
        type: 'object_summary',
        content: `${type}: appeared ${items.length} times, avg confidence ${(items.reduce((s, i) => s + i.confidence, 0) / items.length * 100).toFixed(1)}%`,
        metadata: {
          objectType: type,
          count: items.length,
          avgConfidence: items.reduce((s, i) => s + i.confidence, 0) / items.length,
          timestamps: items.map(i => i.timestamp),
          sizes: items.map(i => i.size)
        }
      });
    }
  }

  indexMovements(movements) {
    const movementSummary = this.groupBy(movements, 'objectType');
    
    for (const [type, items] of Object.entries(movementSummary)) {
      const directions = this.groupBy(items, 'direction');
      
      this.documents.push({
        type: 'movement_summary',
        content: `${type} movements: ${items.length} total, directions: ${Object.keys(directions).join(', ')}`,
        metadata: {
          objectType: type,
          totalMovements: items.length,
          avgSpeed: items.reduce((s, i) => s + i.speed, 0) / items.length,
          directions: Object.fromEntries(
            Object.entries(directions).map(([dir, moves]) => [dir, moves.length])
          ),
          avgDistance: items.reduce((s, i) => s + i.distance, 0) / items.length
        }
      });
    }
  }

  indexZones(zones) {
    const zoneSummary = this.groupBy(zones, 'zoneName');
    
    for (const [zoneName, items] of Object.entries(zoneSummary)) {
      const objectTypes = this.groupBy(items, 'objectType');
      
      this.documents.push({
        type: 'zone_summary',
        content: `Zone ${zoneName}: ${items.length} object entries, types: ${Object.keys(objectTypes).join(', ')}`,
        metadata: {
          zoneName,
          totalEntries: items.length,
          objectTypes: Object.fromEntries(
            Object.entries(objectTypes).map(([type, entries]) => [type, entries.length])
          ),
          timestamps: items.map(i => i.timestamp)
        }
      });
    }
  }

  indexTemporal(temporal) {
    this.documents.push({
      type: 'temporal_analysis',
      content: `Timeline analysis: ${temporal.length} time points analyzed`,
      metadata: {
        totalTimePoints: temporal.length,
        peakActivity: temporal.reduce((max, curr) => 
          curr.totalObjects > max.totalObjects ? curr : max, temporal[0]),
        avgObjectsPerFrame: temporal.reduce((s, t) => s + t.totalObjects, 0) / temporal.length,
        uniqueObjectTypes: [...new Set(temporal.flatMap(t => t.objectTypes))]
      }
    });
  }

  indexAttributes(attributes) {
    const personAttributes = attributes.filter(a => a.type === 'person');
    
    if (personAttributes.length > 0) {
      const genderCounts = this.groupBy(personAttributes, 'estimatedGender');
      const ageCounts = this.groupBy(personAttributes, 'estimatedAge');
      
      this.documents.push({
        type: 'person_attributes',
        content: `Person analysis: ${personAttributes.length} person detections`,
        metadata: {
          totalPersons: personAttributes.length,
          genderEstimates: Object.fromEntries(
            Object.entries(genderCounts).map(([gender, items]) => [gender, items.length])
          ),
          ageEstimates: Object.fromEntries(
            Object.entries(ageCounts).map(([age, items]) => [age, items.length])
          )
        }
      });
    }
  }

  groupBy(array, key) {
    return array.reduce((groups, item) => {
      const group = item[key];
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {});
  }

  query(userPrompt) {
    const prompt = userPrompt.toLowerCase();
    const results = [];

    if (prompt.includes('people') || prompt.includes('person')) {
      const personDocs = this.documents.filter(d => 
        d.type === 'object_summary' && d.metadata.objectType === 'person' ||
        d.type === 'person_attributes'
      );
      results.push(...personDocs);
    }

    if (prompt.includes('movement') || prompt.includes('walking') || prompt.includes('moving')) {
      const movementDocs = this.documents.filter(d => d.type === 'movement_summary');
      results.push(...movementDocs);
    }

    if (prompt.includes('door') || prompt.includes('zone')) {
      const zoneDocs = this.documents.filter(d => d.type === 'zone_summary');
      results.push(...zoneDocs);
    }

    if (prompt.includes('timeline') || prompt.includes('time') || prompt.includes('when')) {
      const temporalDocs = this.documents.filter(d => d.type === 'temporal_analysis');
      results.push(...temporalDocs);
    }

    if (prompt.includes('male') || prompt.includes('female') || prompt.includes('gender')) {
      const genderDocs = this.documents.filter(d => d.type === 'person_attributes');
      results.push(...genderDocs);
    }

    return results.length > 0 ? results : this.documents;
  }
}

class InteractiveVideoAgent {
  constructor() {
    this.extractor = new VideoDataExtractor();
    this.ragSystem = new VideoRAGSystem();
    this.llm = new ChatAnthropic({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      modelName: 'claude-3-5-sonnet-20241022',
      temperature: 0.1
    });
    this.isProcessed = false;
  }

  async processVideo(videoPath) {
    console.log('🎥 Processing video...');
    
    await this.extractor.initialize();
    
    const outputDir = './analysis-output';
    await fs.mkdir(outputDir, { recursive: true });
    
    console.log('📹 Extracting frames...');
    const framePattern = path.join(outputDir, 'frame_%04d.jpg');
    
    await new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .fps(0.5)
        .output(framePattern)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
    
    const frameFiles = await fs.readdir(outputDir);
    const sortedFrames = frameFiles
      .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort();
    
    console.log('🔍 Extracting comprehensive data...');
    
    let previousObjects = null;
    const zones = this.extractor.defineZones(640, 480);
    
    for (let i = 0; i < sortedFrames.length; i++) {
      const framePath = path.join(outputDir, sortedFrames[i]);
      const timestamp = i * 2;
      
      try {
        const imageBuffer = await fs.readFile(framePath);
        const { data, info } = await sharp(imageBuffer)
          .resize(640, 480)
          .raw()
          .toBuffer({ resolveWithObject: true });
        
        const tensor = tf.tensor3d(data, [info.height, info.width, info.channels]);
        const predictions = await this.extractor.model.detect(tensor);
        tensor.dispose();
        
        const filteredPredictions = predictions.filter(p => p.score > 0.5);
        
        const objects = this.extractor.extractObjectData(filteredPredictions, i + 1, timestamp);
        const movements = this.extractor.extractMovementData(objects, previousObjects, timestamp);
        const zoneData = this.extractor.extractZoneData(objects, zones, timestamp);
        const attributes = this.extractor.extractAttributeData(objects, timestamp);
        const temporal = this.extractor.extractTemporalData(timestamp, objects, movements);
        
        process.stdout.write(`\rProcessing frame ${i + 1}/${sortedFrames.length}`);
        
        previousObjects = objects;
        
      } catch (error) {
        console.log(`\nFrame ${i + 1}: Error - ${error.message}`);
      }
    }
    
    console.log('\n📚 Indexing data in RAG system...');
    this.ragSystem.indexVideoData(this.extractor.extractedData);
    
    await fs.rm(outputDir, { recursive: true, force: true });
    
    this.isProcessed = true;
    console.log('✅ Video processing complete!');
  }

  async queryVideo(userPrompt) {
    if (!this.isProcessed) {
      return "Please process a video first using the 'process' command.";
    }
    
    const relevantDocs = this.ragSystem.query(userPrompt);
    
    const context = relevantDocs.map(doc => 
      `${doc.type}: ${doc.content}\nData: ${JSON.stringify(doc.metadata, null, 2)}`
    ).join('\n\n');
    
    const response = await this.llm.invoke([{
      role: 'user',
      content: `Based on this video analysis data, answer the user's question: "${userPrompt}"

Context:
${context}

Please provide a detailed answer with specific numbers and insights from the data.`
    }]);
    
    return response.content;
  }
}

async function runInteractiveAgent() {
  const agent = new InteractiveVideoAgent();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('🎬 INTERACTIVE VIDEO ANALYSIS AGENT');
  console.log('=====================================');
  console.log('Commands:');
  console.log('  process - Process the video');
  console.log('  <your question> - Ask about the video');
  console.log('  exit - Quit the application');
  console.log('');

  const askQuestion = () => {
    rl.question('> ', async (input) => {
      const command = input.trim().toLowerCase();

      if (command === 'exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      if (command === 'process') {
        try {
          const videoPath = '/Users/shivpatel/Downloads/18361966-uhd_3840_2160_60fps.mp4';
          await agent.processVideo(videoPath);
          console.log('\nYou can now ask questions about the video!');
          console.log('Examples:');
          console.log('- How many people are in the video?');
          console.log('- What movements occurred?');
          console.log('- How many males vs females?');
          console.log('- When was peak activity?');
        } catch (error) {
          console.log('Error processing video:', error.message);
        }
        askQuestion();
        return;
      }

      if (input.trim()) {
        try {
          console.log('🤖 Analyzing...');
          const response = await agent.queryVideo(input.trim());
          console.log('\n' + response + '\n');
        } catch (error) {
          console.log('Error:', error.message);
        }
      }

      askQuestion();
    });
  };

  askQuestion();
}

runInteractiveAgent().catch(console.error);
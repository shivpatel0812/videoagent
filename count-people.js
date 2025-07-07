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

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

async function countPeopleInVideo() {
  const videoPath = '/Users/shivpatel/Downloads/18361966-uhd_3840_2160_60fps.mp4';
  const outputDir = './analysis-output';
  
  console.log('🎥 Loading AI models...');
  const model = await cocoSsd.load();
  
  const llm = new ChatAnthropic({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    modelName: 'claude-3-5-sonnet-20241022',
    temperature: 0.1
  });
  
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
  
  console.log('🔍 Detecting people in frames...');
  const frameFiles = await fs.readdir(outputDir);
  const sortedFrames = frameFiles
    .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
    .sort();
  
  const peopleDetections = [];
  let totalPeopleDetected = 0;
  
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
      
      const people = predictions.filter(p => p.class === 'person' && p.score > 0.5);
      
      if (people.length > 0) {
        peopleDetections.push({
          timestamp,
          frameNumber: i + 1,
          peopleCount: people.length,
          detections: people.map(p => ({
            confidence: (p.score * 100).toFixed(1) + '%',
            bbox: p.bbox
          }))
        });
        totalPeopleDetected += people.length;
      }
      
      console.log(`Frame ${i + 1}/${sortedFrames.length}: ${people.length} people detected`);
      
    } catch (error) {
      console.log(`Frame ${i + 1}: Error - ${error.message}`);
    }
  }
  
  console.log('\n🤖 Analyzing with Claude...');
  
  const analysisPrompt = `Analyze this video data to count unique people:

Video: 76 seconds, 4K resolution
Frames analyzed: ${sortedFrames.length} (every 2 seconds)
Total person detections: ${totalPeopleDetected}

Detection details:
${peopleDetections.map(d => 
  `At ${d.timestamp}s: ${d.peopleCount} people detected`
).join('\n')}

Question: Based on these detections across time, estimate how many unique individuals appear in this video. Consider:
1. People may appear in multiple frames
2. Some may enter/exit the scene
3. Detection confidence levels
4. Temporal patterns

Provide your best estimate of unique people count with reasoning.`;

  const response = await llm.invoke([
    { role: 'user', content: analysisPrompt }
  ]);
  
  console.log('\n🎯 FINAL ANALYSIS:');
  console.log('==================');
  console.log(`Total frames analyzed: ${sortedFrames.length}`);
  console.log(`Frames with people: ${peopleDetections.length}`);
  console.log(`Total person detections: ${totalPeopleDetected}`);
  console.log(`Detection timespan: ${peopleDetections.length > 0 ? 
    `${peopleDetections[0].timestamp}s to ${peopleDetections[peopleDetections.length-1].timestamp}s` : 'None'}`);
  
  console.log('\n🧠 Claude AI Analysis:');
  console.log(response.content);
  
  await fs.rm(outputDir, { recursive: true, force: true });
  console.log('\n✅ Analysis complete! Temporary files cleaned up.');
}

countPeopleInVideo().catch(console.error);
require('dotenv').config({ path: './ai-agent/.env' });
const VideoAnalysisAgent = require('./ai-agent/agent');
const path = require('path');

async function analyzeVideo() {
  const videoPath = '/Users/shivpatel/Downloads/18361966-uhd_3840_2160_60fps.mp4';
  const jobId = 'people-count-job';
  
  console.log('Initializing video analysis agent...');
  
  const agent = new VideoAnalysisAgent({
    outputDir: './output'
  });

  try {
    await agent.initialize();
    console.log('Agent initialized successfully!');

    console.log('Processing video:', videoPath);
    const result = await agent.processVideo(videoPath, jobId, {
      frameRate: 0.5
    });

    console.log('\n=== PROCESSING COMPLETE ===');
    console.log('Job ID:', result.jobId);
    console.log('Total frames processed:', result.frames.totalFrames);
    console.log('Total detections:', result.detections.length);

    console.log('\n=== OBJECT SUMMARY ===');
    console.log('Unique objects detected:', result.objectSummary.uniqueObjects);
    result.objectSummary.summary.forEach(obj => {
      console.log(`- ${obj.object}: ${obj.count} times (avg confidence: ${(obj.avgConfidence * 100).toFixed(1)}%)`);
    });

    console.log('\n=== QUERYING FOR PEOPLE COUNT ===');
    const peopleQuery = await agent.ragProcessor.queryVideo(
      "How many unique people appear in this video? Count distinct individuals.",
      jobId
    );

    console.log('AI Analysis:', peopleQuery.answer);
    console.log('Confidence:', peopleQuery.confidence.toFixed(1) + '%');

  } catch (error) {
    console.error('Analysis failed:', error.message);
    console.error(error.stack);
  }
}

analyzeVideo();
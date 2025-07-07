console.log('Testing environment...');

try {
  require('dotenv').config({ path: './ai-agent/.env' });
  console.log('✓ dotenv loaded');
  
  const fs = require('fs');
  const videoPath = '/Users/shivpatel/Downloads/18361966-uhd_3840_2160_60fps.mp4';
  
  if (fs.existsSync(videoPath)) {
    console.log('✓ Video file found');
  } else {
    console.log('✗ Video file not found');
  }
  
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('✓ API key configured');
  } else {
    console.log('✗ API key missing');
  }
  
  console.log('\nEnvironment ready! Run: node simple-analysis.js');
  
} catch (error) {
  console.log('✗ Error:', error.message);
}
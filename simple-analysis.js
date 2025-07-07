require('dotenv').config({ path: './ai-agent/.env' });
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

async function analyzeVideo() {
  const videoPath = '/Users/shivpatel/Downloads/18361966-uhd_3840_2160_60fps.mp4';
  
  console.log('Getting video metadata...');
  
  ffmpeg.ffprobe(videoPath, (err, metadata) => {
    if (err) {
      console.error('Error:', err.message);
      return;
    }
    
    const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
    
    console.log('Video Analysis:');
    console.log('- Duration:', Math.round(metadata.format.duration), 'seconds');
    console.log('- Resolution:', videoStream.width + 'x' + videoStream.height);
    console.log('- Frame Rate:', Math.round(eval(videoStream.r_frame_rate)), 'fps');
    console.log('- File Size:', Math.round(metadata.format.size / 1024 / 1024), 'MB');
    
    console.log('\nReady to extract frames and count people!');
    console.log('Your video is', Math.round(metadata.format.duration), 'seconds long');
    console.log('We will extract', Math.round(metadata.format.duration * 0.5), 'frames for analysis');
  });
}

analyzeVideo();
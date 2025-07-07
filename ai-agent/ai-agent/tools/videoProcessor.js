const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

ffmpeg.setFfmpegPath(ffmpegStatic);

class VideoProcessor {
  constructor(outputDir = './output') {
    this.outputDir = outputDir;
  }

  async extractFrames(videoPath, options = {}) {
    const jobId = options.jobId || uuidv4();
    const frameRate = options.frameRate || 1; // 1 frame per second
    const outputPattern = path.join(this.outputDir, jobId, 'frame_%04d.jpg');
    
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPattern), { recursive: true });

    return new Promise((resolve, reject) => {
      const timestamps = [];
      let frameCount = 0;

      ffmpeg(videoPath)
        .fps(frameRate)
        .output(outputPattern)
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .on('end', async () => {
          try {
            // Get list of extracted frames
            const frameDir = path.dirname(outputPattern);
            const files = await fs.readdir(frameDir);
            const frameFiles = files
              .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
              .sort()
              .map((file, index) => ({
                frameKey: file,
                path: path.join(frameDir, file),
                timestamp: index / frameRate,
                frameNumber: index + 1
              }));

            resolve({
              jobId,
              frames: frameFiles,
              totalFrames: frameFiles.length,
              frameRate
            });
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject)
        .run();
    });
  }

  async getVideoMetadata(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        
        resolve({
          duration: metadata.format.duration,
          width: videoStream?.width,
          height: videoStream?.height,
          frameRate: eval(videoStream?.r_frame_rate) || 30,
          codec: videoStream?.codec_name,
          bitrate: metadata.format.bit_rate,
          size: metadata.format.size
        });
      });
    });
  }

  async extractThumbnails(videoPath, timestamps, options = {}) {
    const jobId = options.jobId || uuidv4();
    const outputDir = path.join(this.outputDir, jobId, 'thumbnails');
    
    await fs.mkdir(outputDir, { recursive: true });

    const thumbnails = [];

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const outputPath = path.join(outputDir, `thumb_${i.toString().padStart(4, '0')}.jpg`);

      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .seekInput(timestamp)
          .frames(1)
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      thumbnails.push({
        timestamp,
        path: outputPath,
        filename: path.basename(outputPath)
      });
    }

    return thumbnails;
  }
}

module.exports = VideoProcessor;
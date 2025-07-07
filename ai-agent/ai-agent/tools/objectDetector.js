const tf = require('@tensorflow/tfjs-node');
const cocoSsd = require('@tensorflow-models/coco-ssd');
const sharp = require('sharp');
const fs = require('fs').promises;

class ObjectDetector {
  constructor() {
    this.model = null;
  }

  async initialize() {
    if (!this.model) {
      console.log('Loading COCO-SSD model...');
      this.model = await cocoSsd.load();
      console.log('Model loaded successfully');
    }
  }

  async detectObjects(imagePath, options = {}) {
    await this.initialize();

    try {
      // Load and preprocess image
      const imageBuffer = await fs.readFile(imagePath);
      const { data, info } = await sharp(imageBuffer)
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Convert to tensor
      const tensor = tf.tensor3d(data, [info.height, info.width, info.channels]);
      
      // Detect objects
      const predictions = await this.model.detect(tensor);
      
      // Clean up tensor
      tensor.dispose();

      // Format predictions
      const detections = predictions.map(prediction => ({
        label: prediction.class,
        confidence: prediction.score,
        bbox: {
          x: prediction.bbox[0],
          y: prediction.bbox[1],
          width: prediction.bbox[2],
          height: prediction.bbox[3]
        }
      }));

      return {
        imagePath,
        detections,
        imageSize: {
          width: info.width,
          height: info.height
        }
      };
    } catch (error) {
      console.error('Error detecting objects:', error);
      throw error;
    }
  }

  async detectObjectsInFrames(frames, options = {}) {
    const results = [];
    const confidenceThreshold = options.confidenceThreshold || 0.5;

    for (const frame of frames) {
      try {
        const result = await this.detectObjects(frame.path);
        
        // Filter by confidence threshold
        result.detections = result.detections.filter(
          detection => detection.confidence >= confidenceThreshold
        );

        results.push({
          frameKey: frame.frameKey,
          timestamp: frame.timestamp,
          frameNumber: frame.frameNumber,
          ...result
        });

        console.log(`Processed frame ${frame.frameNumber}: ${result.detections.length} objects detected`);
      } catch (error) {
        console.error(`Error processing frame ${frame.frameKey}:`, error);
        results.push({
          frameKey: frame.frameKey,
          timestamp: frame.timestamp,
          frameNumber: frame.frameNumber,
          error: error.message,
          detections: []
        });
      }
    }

    return results;
  }

  async getObjectSummary(detectionResults) {
    const objectCounts = {};
    const objectTimestamps = {};

    detectionResults.forEach(result => {
      result.detections.forEach(detection => {
        const label = detection.label;
        
        if (!objectCounts[label]) {
          objectCounts[label] = 0;
          objectTimestamps[label] = [];
        }
        
        objectCounts[label]++;
        objectTimestamps[label].push({
          timestamp: result.timestamp,
          confidence: detection.confidence,
          bbox: detection.bbox
        });
      });
    });

    return {
      totalFrames: detectionResults.length,
      uniqueObjects: Object.keys(objectCounts),
      objectCounts,
      objectTimestamps,
      summary: Object.entries(objectCounts).map(([object, count]) => ({
        object,
        count,
        avgConfidence: objectTimestamps[object].reduce((sum, t) => sum + t.confidence, 0) / count,
        firstSeen: Math.min(...objectTimestamps[object].map(t => t.timestamp)),
        lastSeen: Math.max(...objectTimestamps[object].map(t => t.timestamp))
      }))
    };
  }
}

module.exports = ObjectDetector;
const { ChatAnthropic } = require('@langchain/anthropic');
const { AgentExecutor, createReactAgent } = require('langchain/agents');
const { pull } = require('langchain/hub');
const { Tool } = require('@langchain/core/tools');
const VideoProcessor = require('./tools/videoProcessor');
const ObjectDetector = require('./tools/objectDetector');
const RAGProcessor = require('./tools/ragProcessor');
const fs = require('fs').promises;
const path = require('path');

class VideoAnalysisAgent {
  constructor(options = {}) {
    this.anthropicApiKey = options.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    this.outputDir = options.outputDir || './output';
    
    this.llm = new ChatAnthropic({
      anthropicApiKey: this.anthropicApiKey,
      modelName: 'claude-3-sonnet-20240229',
      temperature: 0.1
    });

    this.videoProcessor = new VideoProcessor(this.outputDir);
    this.objectDetector = new ObjectDetector();
    this.ragProcessor = new RAGProcessor(options);
    
    this.tools = this.createTools();
    this.agent = null;
  }

  createTools() {
    return [
      new Tool({
        name: 'extract_frames',
        description: 'Extract frames from a video file. Input should be a JSON string with videoPath and optional frameRate.',
        func: async (input) => {
          try {
            const { videoPath, frameRate = 1, jobId } = JSON.parse(input);
            const result = await this.videoProcessor.extractFrames(videoPath, { frameRate, jobId });
            return JSON.stringify(result);
          } catch (error) {
            return `Error extracting frames: ${error.message}`;
          }
        }
      }),

      new Tool({
        name: 'detect_objects',
        description: 'Detect objects in extracted frames. Input should be a JSON string with frames array.',
        func: async (input) => {
          try {
            const { frames, confidenceThreshold = 0.5 } = JSON.parse(input);
            const result = await this.objectDetector.detectObjectsInFrames(frames, { confidenceThreshold });
            return JSON.stringify(result);
          } catch (error) {
            return `Error detecting objects: ${error.message}`;
          }
        }
      }),

      new Tool({
        name: 'get_object_summary',
        description: 'Get summary statistics of detected objects. Input should be detection results.',
        func: async (input) => {
          try {
            const detectionResults = JSON.parse(input);
            const summary = await this.objectDetector.getObjectSummary(detectionResults);
            return JSON.stringify(summary);
          } catch (error) {
            return `Error creating object summary: ${error.message}`;
          }
        }
      }),

      new Tool({
        name: 'index_video_content',
        description: 'Index video content for RAG retrieval. Input should be a JSON string with videoMetadata, detectionResults, and jobId.',
        func: async (input) => {
          try {
            const { videoMetadata, detectionResults, jobId } = JSON.parse(input);
            const documents = await this.ragProcessor.processVideoMetadata(videoMetadata, detectionResults, jobId);
            await this.ragProcessor.indexDocuments(documents);
            return `Successfully indexed ${documents.length} documents for job ${jobId}`;
          } catch (error) {
            return `Error indexing content: ${error.message}`;
          }
        }
      }),

      new Tool({
        name: 'query_video_content',
        description: 'Query indexed video content using RAG. Input should be a JSON string with query and jobId.',
        func: async (input) => {
          try {
            const { query, jobId, k = 5 } = JSON.parse(input);
            const result = await this.ragProcessor.queryVideo(query, jobId, { k });
            return JSON.stringify(result);
          } catch (error) {
            return `Error querying content: ${error.message}`;
          }
        }
      }),

      new Tool({
        name: 'get_video_metadata',
        description: 'Get metadata from a video file. Input should be the video file path.',
        func: async (input) => {
          try {
            const videoPath = input.trim();
            const metadata = await this.videoProcessor.getVideoMetadata(videoPath);
            return JSON.stringify(metadata);
          } catch (error) {
            return `Error getting video metadata: ${error.message}`;
          }
        }
      }),

      new Tool({
        name: 'count_object_events',
        description: 'Count specific events or movements of objects across frames. Input should be a JSON string with detectionResults and eventType.',
        func: async (input) => {
          try {
            const { detectionResults, eventType, objectType } = JSON.parse(input);
            const events = this.countObjectEvents(detectionResults, eventType, objectType);
            return JSON.stringify(events);
          } catch (error) {
            return `Error counting events: ${error.message}`;
          }
        }
      })
    ];
  }

  countObjectEvents(detectionResults, eventType, objectType) {
    // Simple event counting logic - can be enhanced based on specific needs
    const events = [];
    let previousFrame = null;

    detectionResults.forEach(frame => {
      const targetObjects = frame.detections?.filter(d => 
        !objectType || d.label.toLowerCase().includes(objectType.toLowerCase())
      ) || [];

      if (previousFrame && eventType === 'movement') {
        // Detect movement by comparing object positions
        targetObjects.forEach(obj => {
          const prevObjects = previousFrame.detections?.filter(d => d.label === obj.label) || [];
          
          prevObjects.forEach(prevObj => {
            const distance = Math.sqrt(
              Math.pow(obj.bbox.x - prevObj.bbox.x, 2) + 
              Math.pow(obj.bbox.y - prevObj.bbox.y, 2)
            );
            
            if (distance > 50) { // Movement threshold
              events.push({
                type: 'movement',
                object: obj.label,
                timestamp: frame.timestamp,
                distance: distance.toFixed(2)
              });
            }
          });
        });
      }

      if (eventType === 'appearance') {
        targetObjects.forEach(obj => {
          events.push({
            type: 'appearance',
            object: obj.label,
            timestamp: frame.timestamp,
            confidence: obj.confidence
          });
        });
      }

      previousFrame = frame;
    });

    return {
      eventType,
      objectType,
      events,
      totalEvents: events.length,
      summary: this.summarizeEvents(events, eventType, objectType)
    };
  }

  summarizeEvents(events, eventType, objectType) {
    if (events.length === 0) {
      return `No ${eventType} events detected${objectType ? ` for ${objectType}` : ''}.`;
    }

    const timeSpan = events.length > 1 ? 
      `between ${events[0].timestamp.toFixed(2)}s and ${events[events.length - 1].timestamp.toFixed(2)}s` :
      `at ${events[0].timestamp.toFixed(2)}s`;

    return `Detected ${events.length} ${eventType} events ${timeSpan}${objectType ? ` for ${objectType}` : ''}.`;
  }

  async initialize() {
    try {
      // Initialize components
      await this.objectDetector.initialize();
      await this.ragProcessor.initialize();

      // Create the agent
      const prompt = await pull('hwchase17/react');
      this.agent = await createReactAgent({
        llm: this.llm,
        tools: this.tools,
        prompt
      });

      this.agentExecutor = new AgentExecutor({
        agent: this.agent,
        tools: this.tools,
        verbose: true,
        maxIterations: 15
      });

      console.log('Video Analysis Agent initialized successfully');
    } catch (error) {
      console.error('Error initializing agent:', error);
      throw error;
    }
  }

  async processVideo(videoPath, jobId, options = {}) {
    try {
      const frameRate = options.frameRate || 1;
      
      // Step 1: Get video metadata
      console.log('Getting video metadata...');
      const metadata = await this.videoProcessor.getVideoMetadata(videoPath);
      
      // Step 2: Extract frames
      console.log('Extracting frames...');
      const frameResult = await this.videoProcessor.extractFrames(videoPath, { frameRate, jobId });
      
      // Step 3: Detect objects
      console.log('Detecting objects in frames...');
      const detectionResults = await this.objectDetector.detectObjectsInFrames(frameResult.frames);
      
      // Step 4: Index content for RAG
      console.log('Indexing content for RAG...');
      const documents = await this.ragProcessor.processVideoMetadata(metadata, detectionResults, jobId);
      await this.ragProcessor.indexDocuments(documents);
      
      // Step 5: Generate summary
      const objectSummary = await this.objectDetector.getObjectSummary(detectionResults);
      
      return {
        jobId,
        videoMetadata: metadata,
        frames: frameResult,
        detections: detectionResults,
        objectSummary,
        documentsIndexed: documents.length,
        status: 'completed'
      };
    } catch (error) {
      console.error('Error processing video:', error);
      throw error;
    }
  }

  async invokeAgent(prompt, context = {}) {
    if (!this.agentExecutor) {
      await this.initialize();
    }

    try {
      const result = await this.agentExecutor.invoke({
        input: prompt,
        context: JSON.stringify(context)
      });

      return result;
    } catch (error) {
      console.error('Error invoking agent:', error);
      throw error;
    }
  }
}

module.exports = VideoAnalysisAgent;
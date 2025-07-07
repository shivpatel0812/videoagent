require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const VideoAnalysisAgent = require('./agent');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const jobId = uuidv4();
    req.jobId = jobId;
    cb(null, `${jobId}_${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  }
});

// Initialize agent
const agent = new VideoAnalysisAgent({
  outputDir: path.join(__dirname, '../output')
});

// Job status tracking
const jobs = new Map();

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/upload', upload.single('video'), async (req, res) => {
  try {
    const jobId = req.jobId;
    const videoPath = req.file.path;

    // Initialize job status
    jobs.set(jobId, {
      status: 'uploaded',
      videoPath,
      filename: req.file.originalname,
      uploadTime: new Date(),
      progress: 0
    });

    res.json({
      jobId,
      message: 'Video uploaded successfully',
      filename: req.file.originalname
    });

    // Start processing in background
    processVideoBackground(jobId, videoPath);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', message: error.message });
  }
});

app.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

app.post('/agent/invoke', async (req, res) => {
  try {
    const { jobId, prompt } = req.body;

    if (!jobId || !prompt) {
      return res.status(400).json({ error: 'jobId and prompt are required' });
    }

    const job = jobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Video processing not completed yet' });
    }

    // Invoke agent with the prompt
    const result = await agent.invokeAgent(prompt, {
      jobId,
      videoPath: job.videoPath,
      processedData: job.result
    });

    res.json({
      jobId,
      prompt,
      result: result.output,
      intermediateSteps: result.intermediateSteps
    });

  } catch (error) {
    console.error('Agent invocation error:', error);
    res.status(500).json({ error: 'Agent invocation failed', message: error.message });
  }
});

app.post('/query/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const { query, k = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const job = jobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Video processing not completed yet' });
    }

    // Query using RAG
    const result = await agent.ragProcessor.queryVideo(query, jobId, { k });

    res.json({
      jobId,
      query,
      ...result
    });

  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Query failed', message: error.message });
  }
});

app.get('/jobs/:jobId/summary', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Video processing not completed yet' });
  }

  res.json({
    jobId,
    summary: job.result?.objectSummary || {},
    videoMetadata: job.result?.videoMetadata || {},
    totalFramesProcessed: job.result?.frames?.totalFrames || 0,
    totalDetections: job.result?.detections?.length || 0
  });
});

// Background processing function
async function processVideoBackground(jobId, videoPath) {
  try {
    // Update job status
    jobs.set(jobId, { ...jobs.get(jobId), status: 'processing', progress: 10 });

    // Process video
    const result = await agent.processVideo(videoPath, jobId);

    // Update job with results
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'completed',
      progress: 100,
      result,
      completedTime: new Date()
    });

    console.log(`Job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    jobs.set(jobId, {
      ...jobs.get(jobId),
      status: 'failed',
      error: error.message,
      failedTime: new Date()
    });
  }
}

// Initialize agent on startup
async function initializeServer() {
  try {
    await agent.initialize();
    console.log('Agent initialized successfully');
    
    app.listen(port, () => {
      console.log(`Video Analysis Agent server running on port ${port}`);
      console.log(`Available endpoints:`);
      console.log(`  POST /upload - Upload video for processing`);
      console.log(`  GET  /status/:jobId - Check job status`);
      console.log(`  POST /agent/invoke - Invoke agent with prompt`);
      console.log(`  POST /query/:jobId - Query video content with RAG`);
      console.log(`  GET  /jobs/:jobId/summary - Get job summary`);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
}

initializeServer();
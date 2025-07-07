const { ChatAnthropic } = require('@langchain/anthropic');
const { FaissStore } = require('@langchain/community/vectorstores/faiss');
const { HuggingFaceTransformersEmbeddings } = require('@langchain/community/embeddings/hf_transformers');
const fs = require('fs').promises;
const path = require('path');

class RAGProcessor {
  constructor(options = {}) {
    this.anthropicApiKey = options.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    this.vectorStorePath = options.vectorStorePath || './vector_db';
    
    this.llm = new ChatAnthropic({
      anthropicApiKey: this.anthropicApiKey,
      modelName: 'claude-3-sonnet-20240229',
      temperature: 0.1
    });

    this.embeddings = new HuggingFaceTransformersEmbeddings({
      modelName: 'sentence-transformers/all-MiniLM-L6-v2'
    });

    this.vectorStore = null;
  }

  async initialize() {
    try {
      // Try to load existing vector store
      if (await this.vectorStoreExists()) {
        this.vectorStore = await FaissStore.load(this.vectorStorePath, this.embeddings);
        console.log('Loaded existing vector store');
      } else {
        // Create new empty vector store
        this.vectorStore = await FaissStore.fromTexts(
          ['initial empty document'],
          [{ id: 'init' }],
          this.embeddings
        );
        console.log('Created new vector store');
      }
    } catch (error) {
      console.error('Error initializing RAG processor:', error);
      throw error;
    }
  }

  async vectorStoreExists() {
    try {
      const indexPath = path.join(this.vectorStorePath, 'faiss.index');
      await fs.access(indexPath);
      return true;
    } catch {
      return false;
    }
  }

  async processVideoMetadata(videoMetadata, detectionResults, jobId) {
    const documents = [];

    // Create documents from video metadata
    documents.push({
      content: `Video metadata: duration ${videoMetadata.duration}s, resolution ${videoMetadata.width}x${videoMetadata.height}, codec ${videoMetadata.codec}`,
      metadata: {
        jobId,
        type: 'video_metadata',
        timestamp: 0
      }
    });

    // Create documents from object detection results
    detectionResults.forEach(result => {
      if (result.detections && result.detections.length > 0) {
        const objectList = result.detections.map(d => `${d.label} (${(d.confidence * 100).toFixed(1)}%)`).join(', ');
        
        documents.push({
          content: `At ${result.timestamp.toFixed(2)}s: detected ${objectList}`,
          metadata: {
            jobId,
            type: 'object_detection',
            timestamp: result.timestamp,
            frameNumber: result.frameNumber,
            objects: result.detections.map(d => d.label)
          }
        });
      }
    });

    // Create summary document
    const objectSummary = this.createObjectSummary(detectionResults);
    documents.push({
      content: `Video summary: ${objectSummary}`,
      metadata: {
        jobId,
        type: 'summary',
        timestamp: -1
      }
    });

    return documents;
  }

  createObjectSummary(detectionResults) {
    const objectCounts = {};
    detectionResults.forEach(result => {
      result.detections?.forEach(detection => {
        objectCounts[detection.label] = (objectCounts[detection.label] || 0) + 1;
      });
    });

    const topObjects = Object.entries(objectCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([object, count]) => `${object} (${count} times)`)
      .join(', ');

    return `Most frequently detected objects: ${topObjects}`;
  }

  async indexDocuments(documents) {
    await this.initialize();

    const texts = documents.map(doc => doc.content);
    const metadatas = documents.map(doc => doc.metadata);

    // Add documents to vector store
    await this.vectorStore.addTexts(texts, metadatas);

    // Save vector store
    await fs.mkdir(this.vectorStorePath, { recursive: true });
    await this.vectorStore.save(this.vectorStorePath);

    console.log(`Indexed ${documents.length} documents`);
  }

  async retrieveRelevantContext(query, options = {}) {
    await this.initialize();

    const k = options.k || 5;
    const jobId = options.jobId;

    try {
      // Perform similarity search
      let results = await this.vectorStore.similaritySearchWithScore(query, k);

      // Filter by jobId if provided
      if (jobId) {
        results = results.filter(([doc]) => doc.metadata.jobId === jobId);
      }

      return results.map(([doc, score]) => ({
        content: doc.pageContent,
        metadata: doc.metadata,
        similarity: score
      }));
    } catch (error) {
      console.error('Error retrieving context:', error);
      return [];
    }
  }

  async generateAnswer(query, context, options = {}) {
    const systemPrompt = `You are a video analysis AI assistant. You have access to extracted video metadata and object detection results. 
    
    Based on the provided context, answer the user's question about the video content. Be specific and include timestamps when relevant.
    
    Context:
    ${context.map(item => `- ${item.content} (similarity: ${item.similarity?.toFixed(3)})`).join('\n')}
    `;

    try {
      const response = await this.llm.invoke([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ]);

      return {
        answer: response.content,
        sources: context,
        confidence: this.calculateConfidence(context)
      };
    } catch (error) {
      console.error('Error generating answer:', error);
      throw error;
    }
  }

  calculateConfidence(context) {
    if (context.length === 0) return 0;
    
    const avgSimilarity = context.reduce((sum, item) => sum + (item.similarity || 0), 0) / context.length;
    return Math.min(avgSimilarity * 100, 100);
  }

  async queryVideo(query, jobId, options = {}) {
    try {
      // Retrieve relevant context
      const context = await this.retrieveRelevantContext(query, { 
        jobId, 
        k: options.k || 5 
      });

      if (context.length === 0) {
        return {
          answer: "I couldn't find relevant information about this query in the video.",
          sources: [],
          confidence: 0
        };
      }

      // Generate answer using retrieved context
      const result = await this.generateAnswer(query, context, options);
      
      return result;
    } catch (error) {
      console.error('Error querying video:', error);
      throw error;
    }
  }
}

module.exports = RAGProcessor;
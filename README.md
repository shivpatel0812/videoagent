# Video Analysis App

A DIY, prompt-driven video analysis application that uses AI to automatically analyze videos and answer questions about their content.

## What This Application Does

This application transforms video content into actionable insights through AI-powered analysis. Simply upload a video, and the system will:

• **Extract and analyze frames** from your video at customizable intervals
• **Detect objects, people, and activities** using computer vision models
• **Index video content** for intelligent search and retrieval
• **Answer natural language questions** about what's happening in your videos
• **Generate detailed reports** and summaries of video content

## User Benefits & Applications

**For Content Creators:**
• Automatically tag and categorize video content
• Generate video summaries and highlights
• Track object appearances and movements across videos

**For Security & Surveillance:**
• Monitor for specific events or activities
• Count people entering/leaving areas
• Detect unusual behavior patterns

**For Business Analytics:**
• Analyze customer behavior in retail spaces
• Track product placements and interactions
• Generate reports on space utilization

**For Research & Education:**
• Analyze behavioral patterns in video data
• Extract quantitative data from visual content
• Create searchable video archives

The system uses direct Claude AI integration (not AWS Bedrock) to provide intelligent, context-aware analysis of your video content.

## Architecture

- **Frontend**: React SPA hosted on S3 + CloudFront
- **Backend**: API Gateway + Lambda functions
- **Video Processing**: Serverless pipeline with Step Functions
- **AI Agent**: LangChain + Claude via direct Anthropic API
- **RAG Layer**: OpenSearch + embeddings for semantic search

## Project Structure

```
video-analysis-app/
├── frontend/          # React frontend
├── backend/           # Lambda functions and API
├── infrastructure/    # AWS CDK infrastructure
├── ai-agent/         # LangChain Claude agent
├── video-processing/ # Docker containers for video processing
└── package.json      # Root package.json
```

## Getting Started

1. Install dependencies: `npm install`
2. Set up AWS credentials
3. Deploy infrastructure: `npm run deploy`
4. Start development: `npm run dev`

## Services Used

- S3 for video/frame storage
- Lambda for serverless compute
- Fargate for container workloads
- DynamoDB for job tracking
- OpenSearch for vector search
- Anthropic API for Claude AI integration
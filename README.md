# Video Analysis App

A DIY, prompt-driven video analysis application built on AWS with Claude AI integration.

## Architecture

- **Frontend**: React SPA hosted on S3 + CloudFront
- **Backend**: API Gateway + Lambda functions
- **Video Processing**: Serverless pipeline with Step Functions
- **AI Agent**: LangChain + Claude on Amazon Bedrock
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
- Bedrock for Claude AI integration
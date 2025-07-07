export interface VideoUploadResponse {
  jobId: string;
  message: string;
  filename: string;
}

export interface ProcessingStatus {
  jobId: string;
  status: 'uploaded' | 'processing' | 'completed' | 'failed';
  progress: number;
  message?: string;
  error?: string;
}

export interface VideoAnalysisResult {
  jobId: string;
  totalFrames: number;
  objectsDetected: number;
  movementsTracked: number;
  zoneInteractions: number;
  attributeData: number;
  summary: {
    uniquePeople: number;
    totalObjects: number;
    peakActivity: {
      timestamp: number;
      objectCount: number;
    };
  };
}

export interface QueryResponse {
  answer: string;
  confidence: number;
  sources: Array<{
    type: string;
    content: string;
    metadata: any;
  }>;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  size: number;
}
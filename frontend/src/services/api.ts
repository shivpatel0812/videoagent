import axios from 'axios';
import { VideoUploadResponse, ProcessingStatus, VideoAnalysisResult, QueryResponse } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const videoApi = {
  uploadVideo: async (file: File): Promise<VideoUploadResponse> => {
    const formData = new FormData();
    formData.append('video', file);
    
    const response = await api.post<VideoUploadResponse>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  },

  getProcessingStatus: async (jobId: string): Promise<ProcessingStatus> => {
    const response = await api.get<ProcessingStatus>(`/status/${jobId}`);
    return response.data;
  },

  getAnalysisResults: async (jobId: string): Promise<VideoAnalysisResult> => {
    const response = await api.get<VideoAnalysisResult>(`/results/${jobId}`);
    return response.data;
  },

  queryVideo: async (jobId: string, query: string): Promise<QueryResponse> => {
    const response = await api.post<QueryResponse>(`/query/${jobId}`, {
      query,
    });
    return response.data;
  },

  startProcessing: async (jobId: string): Promise<{ message: string }> => {
    const response = await api.post(`/process/${jobId}`);
    return response.data;
  },
};

export default api;
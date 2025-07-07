import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketProps {
  url: string;
  jobId?: string;
}

interface ProcessingUpdate {
  jobId: string;
  status: string;
  progress: number;
  message?: string;
  currentStep?: string;
}

export const useWebSocket = ({ url, jobId }: UseWebSocketProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<ProcessingUpdate | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const socket = io(url);
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join_job', { jobId });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('processing_update', (update: ProcessingUpdate) => {
      setLastUpdate(update);
    });

    socket.on('processing_complete', (result: any) => {
      setLastUpdate({
        jobId,
        status: 'completed',
        progress: 100,
        message: 'Processing completed successfully!'
      });
    });

    socket.on('processing_error', (error: any) => {
      setLastUpdate({
        jobId,
        status: 'failed',
        progress: 0,
        message: error.message || 'Processing failed'
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [url, jobId]);

  const sendMessage = (event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
    }
  };

  return {
    isConnected,
    lastUpdate,
    sendMessage,
  };
};
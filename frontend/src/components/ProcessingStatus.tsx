import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Chip,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  AutorenewRounded as ProcessingIcon,
} from '@mui/icons-material';
import { videoApi } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { ProcessingStatus as ProcessingStatusType } from '../types';

interface ProcessingStatusProps {
  jobId: string;
  onProcessingComplete: () => void;
}

const processingSteps = [
  'Video Upload',
  'Frame Extraction',
  'Object Detection',
  'Movement Analysis',
  'Zone Processing',
  'RAG Indexing',
  'Complete',
];

export const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  jobId,
  onProcessingComplete,
}) => {
  const [status, setStatus] = useState<ProcessingStatusType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { isConnected, lastUpdate } = useWebSocket({
    url: 'ws://localhost:8000',
    jobId,
  });

  useEffect(() => {
    const pollStatus = async () => {
      try {
        const statusResponse = await videoApi.getProcessingStatus(jobId);
        setStatus(statusResponse);

        if (statusResponse.status === 'completed') {
          onProcessingComplete();
        } else if (statusResponse.status === 'failed') {
          setError(statusResponse.error || 'Processing failed');
        }
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to get status');
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 2000);

    return () => clearInterval(interval);
  }, [jobId, onProcessingComplete]);

  useEffect(() => {
    if (lastUpdate) {
      setStatus(prev => ({
        ...prev!,
        status: lastUpdate.status as any,
        progress: lastUpdate.progress,
        message: lastUpdate.message,
      }));

      if (lastUpdate.status === 'completed') {
        onProcessingComplete();
      } else if (lastUpdate.status === 'failed') {
        setError(lastUpdate.message || 'Processing failed');
      }
    }
  }, [lastUpdate, onProcessingComplete]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      case 'processing':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      case 'processing':
        return <ProcessingIcon color="warning" />;
      default:
        return null;
    }
  };

  const getCurrentStep = () => {
    if (!status) return 0;
    
    const progressSteps = {
      'uploaded': 1,
      'processing': Math.min(Math.floor((status.progress / 100) * 6) + 1, 6),
      'completed': 7,
      'failed': 0,
    };
    
    return progressSteps[status.status] || 0;
  };

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="h6">Processing Failed</Typography>
            <Typography>{error}</Typography>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardContent>
          <Typography>Loading status...</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            {getStatusIcon(status.status)}
            <Typography variant="h6">
              Video Processing
            </Typography>
            <Chip
              label={status.status.toUpperCase()}
              color={getStatusColor(status.status) as any}
              size="small"
            />
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Job ID: {jobId}
          </Typography>

          {isConnected && (
            <Chip
              label="Real-time updates connected"
              color="success"
              size="small"
              sx={{ mb: 2 }}
            />
          )}
        </Box>

        <Stepper activeStep={getCurrentStep()} alternativeLabel sx={{ mb: 3 }}>
          {processingSteps.map((label, index) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2">Progress</Typography>
            <Typography variant="body2">{status.progress}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={status.progress}
            sx={{ borderRadius: 1, height: 8 }}
          />
        </Box>

        {status.message && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {status.message}
          </Alert>
        )}

        {lastUpdate?.currentStep && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Current step: {lastUpdate.currentStep}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};
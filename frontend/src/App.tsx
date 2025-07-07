import React, { useState } from 'react';
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Alert,
  Snackbar,
} from '@mui/material';
import {
  VideoLibrary as VideoIcon,
} from '@mui/icons-material';
import { VideoUpload } from './components/VideoUpload';
import { ProcessingStatus } from './components/ProcessingStatus';
import { VideoAnalysis } from './components/VideoAnalysis';
import { ChatInterface } from './components/ChatInterface';
import { VideoUploadResponse } from './types';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

const steps = ['Upload Video', 'Process Video', 'Analyze Results', 'Ask Questions'];

function App() {
  const [currentStep, setCurrentStep] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
  }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const showSnackbar = (message: string, severity: 'success' | 'error' | 'warning' | 'info') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleUploadSuccess = (response: VideoUploadResponse) => {
    setJobId(response.jobId);
    setCurrentStep(1);
    showSnackbar(`Video uploaded successfully! Job ID: ${response.jobId}`, 'success');
  };

  const handleUploadError = (error: string) => {
    showSnackbar(`Upload failed: ${error}`, 'error');
  };

  const handleProcessingComplete = () => {
    setCurrentStep(2);
    showSnackbar('Video processing completed successfully!', 'success');
  };

  const handleCloseSnackbar = () => {
    setSnackbar(prev => ({ ...prev, open: false }));
  };

  const handleStartNewAnalysis = () => {
    setCurrentStep(0);
    setJobId(null);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <VideoUpload
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
          />
        );
      case 1:
        return jobId ? (
          <ProcessingStatus
            jobId={jobId}
            onProcessingComplete={handleProcessingComplete}
          />
        ) : null;
      case 2:
        return (
          <Box>
            {jobId && <VideoAnalysis jobId={jobId} />}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Typography
                variant="body2"
                color="primary"
                sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => setCurrentStep(3)}
              >
                Ready to ask questions? Click here to continue →
              </Typography>
            </Box>
          </Box>
        );
      case 3:
        return jobId ? <ChatInterface jobId={jobId} /> : null;
      default:
        return null;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', bgcolor: 'grey.50' }}>
        <AppBar position="static" elevation={0}>
          <Toolbar>
            <VideoIcon sx={{ mr: 2 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              Video Analysis AI
            </Typography>
            {jobId && (
              <Typography
                variant="body2"
                sx={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={handleStartNewAnalysis}
              >
                New Analysis
              </Typography>
            )}
          </Toolbar>
        </AppBar>

        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Paper sx={{ p: 3, mb: 4 }}>
            <Typography variant="h4" align="center" gutterBottom>
              AI-Powered Video Analysis
            </Typography>
            <Typography variant="body1" align="center" color="text.secondary" sx={{ mb: 4 }}>
              Upload your video and ask natural language questions about what happens in it
            </Typography>

            <Stepper activeStep={currentStep} alternativeLabel sx={{ mb: 4 }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {renderStepContent()}
          </Paper>

          {currentStep >= 2 && jobId && (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h5" gutterBottom>
                Ask Questions
              </Typography>
              <ChatInterface jobId={jobId} />
            </Paper>
          )}
        </Container>

        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default App;
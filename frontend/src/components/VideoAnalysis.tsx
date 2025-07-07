import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Paper,
  Divider,
} from '@mui/material';
import {
  People as PeopleIcon,
  Visibility as VisibilityIcon,
  TrendingUp as TrendingUpIcon,
  AccessTime as AccessTimeIcon,
} from '@mui/icons-material';
import { videoApi } from '../services/api';
import { VideoAnalysisResult } from '../types';

interface VideoAnalysisProps {
  jobId: string;
}

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color?: 'primary' | 'secondary' | 'success' | 'warning';
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  color = 'primary',
}) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ color: `${color}.main` }}>{icon}</Box>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" component="div" color={`${color}.main`}>
            {value}
          </Typography>
          <Typography variant="h6" color="text.primary">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

export const VideoAnalysis: React.FC<VideoAnalysisProps> = ({ jobId }) => {
  const [results, setResults] = useState<VideoAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const analysisResults = await videoApi.getAnalysisResults(jobId);
        setResults(analysisResults);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [jobId]);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Typography>Loading analysis results...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Typography color="error">Error: {error}</Typography>
        </CardContent>
      </Card>
    );
  }

  if (!results) {
    return (
      <Card>
        <CardContent>
          <Typography>No results available</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Video Analysis Results
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Unique People"
            value={results.summary.uniquePeople}
            subtitle="Detected individuals"
            icon={<PeopleIcon fontSize="large" />}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Objects"
            value={results.summary.totalObjects}
            subtitle="All detections"
            icon={<VisibilityIcon fontSize="large" />}
            color="secondary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Movements"
            value={results.movementsTracked}
            subtitle="Tracked movements"
            icon={<TrendingUpIcon fontSize="large" />}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Peak Activity"
            value={results.summary.peakActivity.objectCount}
            subtitle={`At ${results.summary.peakActivity.timestamp}s`}
            icon={<AccessTimeIcon fontSize="large" />}
            color="warning"
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Processing Summary
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography>Frames Processed:</Typography>
                  <Chip label={results.totalFrames} size="small" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography>Objects Detected:</Typography>
                  <Chip label={results.objectsDetected} size="small" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography>Zone Interactions:</Typography>
                  <Chip label={results.zoneInteractions} size="small" />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography>Attribute Data Points:</Typography>
                  <Chip label={results.attributeData} size="small" />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Analysis Insights
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Paper sx={{ p: 2, bgcolor: 'primary.50' }}>
                  <Typography variant="subtitle2" color="primary">
                    People Detection
                  </Typography>
                  <Typography variant="body2">
                    {results.summary.uniquePeople} unique individuals identified
                    through advanced tracking algorithms
                  </Typography>
                </Paper>
                <Paper sx={{ p: 2, bgcolor: 'success.50' }}>
                  <Typography variant="subtitle2" color="success.main">
                    Movement Analysis
                  </Typography>
                  <Typography variant="body2">
                    {results.movementsTracked} movements tracked across all zones
                    and time periods
                  </Typography>
                </Paper>
                <Paper sx={{ p: 2, bgcolor: 'warning.50' }}>
                  <Typography variant="subtitle2" color="warning.main">
                    Peak Activity
                  </Typography>
                  <Typography variant="body2">
                    Highest activity at {results.summary.peakActivity.timestamp}s
                    with {results.summary.peakActivity.objectCount} objects
                  </Typography>
                </Paper>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
};
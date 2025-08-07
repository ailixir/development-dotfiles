import React from 'react';
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Grid,
  Button,
  Chip,
  Stack,
} from '@mui/material';
import {
  HealthAndSafety as HealthIcon,
  Dashboard as DashboardIcon,
  PlayCircle as StudioIcon,
  Assessment as ReportsIcon,
  Add as AddIcon,
  List as ListIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  const features = [
    {
      title: 'Health Monitoring Dashboard',
      description: 'Get a unified view of all your operational health checks organized by CSI',
      icon: <DashboardIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      action: () => navigate('/dashboard'),
      status: 'Ready',
      color: 'success' as const,
    },
    {
      title: 'Check Builder',
      description: 'Create comprehensive health checks for HTTP endpoints, databases, and enterprise systems',
      icon: <AddIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      action: () => navigate('/new'),
      status: 'Phase 2',
      color: 'warning' as const,
    },
    {
      title: 'Checks Studio',
      description: 'Build no-code UI tests with plain English commands and video recording',
      icon: <StudioIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      action: () => navigate('/studio'),
      status: 'Phase 3',
      color: 'info' as const,
    },
    {
      title: 'Reports & Analytics',
      description: 'Generate email reports with live preview and automated scheduling',
      icon: <ReportsIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      action: () => navigate('/reports'),
      status: 'Phase 4',
      color: 'info' as const,
    },
    {
      title: 'Check Management',
      description: 'View, edit, and manage all operational checks with filtering and search',
      icon: <ListIcon sx={{ fontSize: 48, color: 'primary.main' }} />,
      action: () => navigate('/list'),
      status: 'Phase 2',
      color: 'warning' as const,
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {/* Hero Section */}
      <Box sx={{ textAlign: 'center', mb: 6 }}>
        <HealthIcon sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
        <Typography variant="h2" component="h1" gutterBottom>
          PUT Checks Module
        </Typography>
        <Typography variant="h5" color="text.secondary" sx={{ mb: 3 }}>
          Centralized Operational Health Monitoring
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 600, mx: 'auto', mb: 4 }}>
          A unified platform for creating, executing, and monitoring operational health checks 
          across your entire infrastructure. Orchestrate monitoring without replacing your existing tools.
        </Typography>
        <Button
          variant="contained"
          size="large"
          onClick={() => navigate('/dashboard')}
          startIcon={<DashboardIcon />}
        >
          Go to Dashboard
        </Button>
      </Box>

      {/* Features Grid */}
      <Typography variant="h4" component="h2" gutterBottom sx={{ mb: 4 }}>
        Platform Features
      </Typography>

      <Grid container spacing={3}>
        {features.map((feature, index) => (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={index}>
            <Card 
              sx={{ 
                height: '100%', 
                cursor: 'pointer',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: (theme) => theme.shadows[8],
                }
              }}
              onClick={feature.action}
            >
              <CardContent sx={{ textAlign: 'center', p: 3 }}>
                <Box sx={{ mb: 2 }}>
                  {feature.icon}
                </Box>
                
                <Stack direction="row" spacing={1} justifyContent="center" sx={{ mb: 2 }}>
                  <Typography variant="h6" component="h3">
                    {feature.title}
                  </Typography>
                  <Chip 
                    label={feature.status} 
                    size="small" 
                    color={feature.color}
                    variant={feature.status === 'Ready' ? 'filled' : 'outlined'}
                  />
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {feature.description}
                </Typography>

                <Button 
                  variant="outlined" 
                  size="small"
                  disabled={feature.status !== 'Ready'}
                >
                  {feature.status === 'Ready' ? 'Explore' : 'Coming Soon'}
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Implementation Status */}
      <Box sx={{ mt: 6, p: 3, bgcolor: 'background.paper', borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom>
          🚀 Implementation Progress
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <Chip label="Phase 1: Foundation - Complete ✅" color="success" />
          <Chip label="Phase 2: Check Management - In Progress 🔄" color="warning" />
          <Chip label="Phase 3: UI Testing Studio - Planned 📋" color="info" />
          <Chip label="Phase 4: Reports & Analytics - Planned 📋" color="info" />
        </Stack>
        <Typography variant="body2" color="text.secondary">
          This is a high-fidelity prototype powered by Mock Service Worker (MSW). 
          All UI interactions work, with realistic mock data demonstrating the complete user experience.
        </Typography>
      </Box>
    </Container>
  );
};

export default WelcomePage;

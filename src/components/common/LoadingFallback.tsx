import React from 'react';
import {
  Box,
  Container,
  Skeleton,
  Typography,
  CircularProgress,
  Stack,
  Paper,
} from '@mui/material';
import { styled } from '@mui/material/styles';

const LoadingContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '60vh',
  padding: theme.spacing(4),
}));

const SkeletonCard = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginBottom: theme.spacing(2),
  borderRadius: theme.shape.borderRadius,
}));

interface LoadingFallbackProps {
  message?: string;
  variant?: 'spinner' | 'skeleton' | 'minimal';
  size?: 'small' | 'medium' | 'large';
}

const LoadingFallback: React.FC<LoadingFallbackProps> = ({
  message = 'Loading...',
  variant = 'spinner',
  size = 'medium',
}) => {
  const getSize = () => {
    switch (size) {
      case 'small':
        return 32;
      case 'large':
        return 64;
      default:
        return 48;
    }
  };

  if (variant === 'minimal') {
    return (
      <Box 
        display="flex" 
        alignItems="center" 
        justifyContent="center" 
        p={2}
      >
        <CircularProgress size={getSize()} />
      </Box>
    );
  }

  if (variant === 'skeleton') {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header skeleton */}
        <Box sx={{ mb: 4 }}>
          <Skeleton variant="text" width="40%" height={40} />
          <Skeleton variant="text" width="60%" height={24} />
        </Box>

        {/* Navigation skeleton */}
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={2}>
            <Skeleton variant="rectangular" width={100} height={36} />
            <Skeleton variant="rectangular" width={120} height={36} />
            <Skeleton variant="rectangular" width={80} height={36} />
          </Stack>
        </Box>

        {/* Content cards skeleton */}
        <Stack spacing={2}>
          {[1, 2, 3].map((index) => (
            <SkeletonCard key={index} elevation={1}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Skeleton variant="circular" width={40} height={40} sx={{ mr: 2 }} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="70%" height={24} />
                  <Skeleton variant="text" width="90%" height={20} />
                </Box>
                <Skeleton variant="rectangular" width={80} height={32} />
              </Box>
              <Skeleton variant="text" width="100%" height={16} />
              <Skeleton variant="text" width="80%" height={16} />
              <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                <Skeleton variant="rectangular" width={60} height={24} />
                <Skeleton variant="rectangular" width={80} height={24} />
                <Skeleton variant="rectangular" width={70} height={24} />
              </Box>
            </SkeletonCard>
          ))}
        </Stack>
      </Container>
    );
  }

  // Default spinner variant
  return (
    <LoadingContainer>
      <CircularProgress 
        size={getSize()} 
        sx={{ mb: 2 }}
        color="primary"
      />
      {message && (
        <Typography 
          variant="body1" 
          color="text.secondary"
          sx={{ mt: 2 }}
        >
          {message}
        </Typography>
      )}
    </LoadingContainer>
  );
};

// Specific loading components for different sections
export const ChecksListSkeleton: React.FC = () => (
  <Container maxWidth="lg" sx={{ py: 2 }}>
    <Stack spacing={2}>
      {[1, 2, 3, 4, 5].map((index) => (
        <SkeletonCard key={index} elevation={1}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Skeleton variant="circular" width={32} height={32} sx={{ mr: 2 }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="60%" height={20} />
              <Skeleton variant="text" width="90%" height={16} />
            </Box>
            <Skeleton variant="rectangular" width={60} height={24} sx={{ mr: 1 }} />
            <Skeleton variant="rectangular" width={80} height={32} />
          </Box>
        </SkeletonCard>
      ))}
    </Stack>
  </Container>
);

export const DashboardSkeleton: React.FC = () => (
  <Container maxWidth="lg" sx={{ py: 2 }}>
    {/* Stats cards */}
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2, mb: 4 }}>
      {[1, 2, 3, 4].map((index) => (
        <SkeletonCard key={index} elevation={1}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Skeleton variant="text" width={80} height={16} />
              <Skeleton variant="text" width={60} height={32} />
            </Box>
            <Skeleton variant="circular" width={48} height={48} />
          </Box>
        </SkeletonCard>
      ))}
    </Box>

    {/* Chart area */}
    <SkeletonCard elevation={1}>
      <Skeleton variant="text" width={200} height={24} sx={{ mb: 2 }} />
      <Skeleton variant="rectangular" width="100%" height={300} />
    </SkeletonCard>
  </Container>
);

export const StudioSkeleton: React.FC = () => (
  <Container maxWidth="xl" sx={{ py: 2 }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 350px 1fr', gap: 2, height: '70vh' }}>
      {/* Left panel */}
      <SkeletonCard elevation={1}>
        <Skeleton variant="text" width={120} height={24} sx={{ mb: 2 }} />
        <Stack spacing={1}>
          {[1, 2, 3, 4, 5].map((index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center' }}>
              <Skeleton variant="text" width={20} height={20} sx={{ mr: 1 }} />
              <Skeleton variant="text" width="80%" height={20} />
            </Box>
          ))}
        </Stack>
      </SkeletonCard>

      {/* Center panel */}
      <SkeletonCard elevation={1}>
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Skeleton variant="rectangular" width="80%" height={48} sx={{ mx: 'auto', mb: 2 }} />
          <Skeleton variant="text" width="60%" height={20} sx={{ mx: 'auto' }} />
        </Box>
      </SkeletonCard>

      {/* Right panel */}
      <SkeletonCard elevation={1}>
        <Skeleton variant="text" width={100} height={24} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height="80%" />
      </SkeletonCard>
    </Box>
  </Container>
);

export default LoadingFallback;

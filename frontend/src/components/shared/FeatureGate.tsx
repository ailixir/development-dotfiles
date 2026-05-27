import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import { useAppSelector } from '@/store';
import { selectIsFeatureEnabled } from '@store/slices/featuresSlice';

interface FeatureGateProps {
  featureKey: string;
  children: React.ReactNode;
}

const FeatureUnavailable: React.FC<{ label?: string }> = ({ label }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '50vh',
    }}
  >
    <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 420 }}>
      <BlockIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
      <Typography variant="h6" gutterBottom>
        Feature Unavailable
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label
          ? `${label} is currently disabled by your administrator.`
          : 'This feature is currently disabled by your administrator.'}
      </Typography>
    </Paper>
  </Box>
);

const FeatureGate: React.FC<FeatureGateProps> = ({ featureKey, children }) => {
  const enabled = useAppSelector(selectIsFeatureEnabled(featureKey));
  if (!enabled) return <FeatureUnavailable />;
  return <>{children}</>;
};

export default FeatureGate;

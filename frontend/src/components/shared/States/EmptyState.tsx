import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Nothing here yet',
  description = 'Try adjusting filters or create a new item to get started.',
  actionLabel,
  onAction,
}) => {
  return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <Stack spacing={1} alignItems="center">
        <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{description}</Typography>
        {actionLabel && (
          <Button variant="contained" size="small" onClick={onAction}>{actionLabel}</Button>
        )}
      </Stack>
    </Box>
  );
};

export default EmptyState;



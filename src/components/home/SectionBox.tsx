import React from 'react';
import { Box, Paper, Stack, Typography, alpha, useTheme } from '@mui/material';

interface SectionBoxProps {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  accentColor?: string;
  maxHeight?: number | string;
  children: React.ReactNode;
}

const SectionBox: React.FC<SectionBoxProps> = ({ title, icon, action, accentColor, maxHeight, children }) => {
  const theme = useTheme();
  const color = accentColor || theme.palette.primary.main;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 0,
        borderRadius: 2,
        borderColor: alpha(color, 0.25),
        background: `linear-gradient(135deg, ${alpha(color, 0.02)} 0%, ${alpha(color, 0.01)} 100%)`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        height: maxHeight ? maxHeight : 'auto',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          px: 2,
          py: 1.5,
          backgroundColor: theme.palette.background.paper,
          borderBottom: `1px solid ${alpha(color, 0.12)}`,
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: alpha(color, 0.9),
          },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            {icon && <Box sx={{ color }}>{icon}</Box>}
            <Typography variant="h6" fontWeight={700}>
              {title}
            </Typography>
          </Stack>
          {action && <Box>{action}</Box>}
        </Stack>
      </Box>

      {/* Content */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          overflowY: maxHeight ? 'auto' : 'visible',
          '&::-webkit-scrollbar': { width: 8 },
          '&::-webkit-scrollbar-track': { background: alpha(theme.palette.grey[400], 0.2), borderRadius: 8 },
          '&::-webkit-scrollbar-thumb': { background: alpha(color, 0.4), borderRadius: 8 },
          '&::-webkit-scrollbar-thumb:hover': { background: alpha(color, 0.6) },
        }}
      >
        {children}
      </Box>
    </Paper>
  );
};

export default SectionBox;



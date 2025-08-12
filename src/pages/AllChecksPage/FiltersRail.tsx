import React from 'react';
import {
  Box,
  Paper,
  Stack,
  Typography,
  Divider,
  Chip,
  Skeleton,
} from '@mui/material';

/**
 * Visual skeleton rail for faceted filters (status, type, tags summary).
 * Non-functional for now; for layout validation only.
 */
const FiltersRail: React.FC = () => {
  return (
    <Paper sx={{ p: 2, border: (t) => `1px solid ${t.palette.divider}` }}>
      <Stack spacing={2}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Filters
        </Typography>
        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Status
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {['Passing', 'Warning', 'Failing', 'Pending'].map((label) => (
              <Chip key={label} label={label} size="small" variant="outlined" />
            ))}
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Type
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
            {['HTTP', 'TCP', 'Splunk', 'Grafana', 'ITRS', 'AppDynamics', 'UI Test'].map((label) => (
              <Chip key={label} label={label} size="small" variant="outlined" />
            ))}
          </Stack>
        </Box>

        <Divider />

        <Box>
          <Typography variant="caption" color="text.secondary">
            Popular Tags
          </Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {[...Array(6)].map((_, i) => (
              <Skeleton variant="rounded" height={20} key={i} />
            ))}
          </Stack>
        </Box>
      </Stack>
    </Paper>
  );
};

export default FiltersRail;










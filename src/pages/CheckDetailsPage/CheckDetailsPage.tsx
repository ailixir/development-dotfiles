import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  Card,
  CardContent,
  Stack,
  Chip,
  Divider,
  Button,
  Skeleton,
} from '@mui/material';
import ScheduleDialog from '@components/scheduling/ScheduleDialog';

const CheckDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState(0);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Check Details
          </Typography>
          <Typography variant="body2" color="text.secondary">
            ID: {id}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={() => setScheduleOpen(true)}>
            Manage Schedule
          </Button>
          <Button variant="contained" color="success">
            Execute Now
          </Button>
        </Stack>
      </Stack>

      <Card variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="check details tabs">
          <Tab label="Overview" />
          <Tab label="History" />
          <Tab label="Configuration" />
          <Tab label="Schedule" />
          <Tab label="Links" />
        </Tabs>
        <Divider />
        <CardContent>
          {tab === 0 && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip label="Status: --" size="small" />
                <Chip label="Type: --" size="small" />
                <Chip label="CSI: --" size="small" />
              </Stack>
              <Skeleton variant="rounded" height={140} />
            </Stack>
          )}
          {tab === 1 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Execution History
              </Typography>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 1 }} />
              ))}
            </Box>
          )}
          {tab === 2 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Configuration
              </Typography>
              <Skeleton variant="rounded" height={200} />
            </Box>
          )}
          {tab === 3 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Schedule
              </Typography>
              <Skeleton variant="rounded" height={120} />
            </Box>
          )}
          {tab === 4 && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Links
              </Typography>
              <Skeleton variant="rounded" height={80} />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Skeleton schedule dialog wiring */}
      <ScheduleDialog open={scheduleOpen} onClose={() => setScheduleOpen(false)} check={null} />
    </Box>
  );
};

export default CheckDetailsPage;
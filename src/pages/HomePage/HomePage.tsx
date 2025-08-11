import React, { useEffect } from 'react';
import { Box, Grid, Stack, Typography } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchDashboardSummary,
  fetchAttention,
  fetchActivity,
  fetchUpcomingSchedules,
  fetchReportsSnapshot,
} from '@/store/slices/dashboardSlice';
import KPIBar from '@/components/home/KPIBar';
import AttentionPanel from '@/components/home/AttentionPanel';
import ActivityFeed from '@/components/home/ActivityFeed';
import ReportsSnapshot from '@/components/home/ReportsSnapshot';
import UpcomingSchedules from '@/components/home/UpcomingSchedules';
import GlobalSearch from '@/components/home/GlobalSearch';
import PinnedCSIs from '@/components/home/PinnedCSIs';

const HomePage: React.FC = () => {
  const dispatch = useAppDispatch();
  const summary = useAppSelector((s) => s.dashboard.summary);

  useEffect(() => {
    const load = () => {
      dispatch(fetchDashboardSummary());
      dispatch(fetchAttention({ limit: 20 }));
      dispatch(fetchActivity({ scope: 'ALL', hours: 24 }));
      dispatch(fetchUpcomingSchedules({ limit: 10 }));
      dispatch(fetchReportsSnapshot({ limit: 5 }));
    };
    load();
    const id = setInterval(() => {
      if (!document.hidden) {
        dispatch(fetchDashboardSummary());
        dispatch(fetchAttention({ limit: 20 }));
      }
    }, 60000);
    return () => clearInterval(id);
  }, [dispatch]);

  return (
    <Box>
      <Stack spacing={2} mb={2}>
        <Typography variant="h4" fontWeight={700}>
          Home
        </Typography>
        <Typography variant="body2" color="text.secondary">
          A calm command center for what needs attention, by CSI.
        </Typography>
      </Stack>

      {/* GlobalSearch moved to layout header */}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <KPIBar summary={summary.data} />
        </Grid>

        <Grid item xs={12}>
          <PinnedCSIs />
        </Grid>

        <Grid item xs={12} md={7}>
          <AttentionPanel maxHeight={420} />
        </Grid>
        <Grid item xs={12} md={5}>
          <UpcomingSchedules maxHeight={420} />
        </Grid>

        <Grid item xs={12} md={7}>
          <ActivityFeed maxHeight={360} />
        </Grid>
        <Grid item xs={12} md={5}>
          <ReportsSnapshot maxHeight={360} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomePage;



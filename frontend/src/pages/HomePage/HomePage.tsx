import React, { useEffect } from 'react';
import { Box, Grid, Stack, Typography } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
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
import PinnedCSIs from '@/components/home/PinnedCSIs';
import EmptyState from '@/components/shared/States/EmptyState';

const HomePage: React.FC = () => {
  const dispatch = useAppDispatch();
  const summary = useAppSelector((s) => s.dashboard.summary);
  const searchContext = useAppSelector((s) => s.dashboard.searchContext);

  useEffect(() => {
    const load = () => {
      if (!searchContext.csiId) return;
      dispatch(fetchDashboardSummary());
      dispatch(fetchAttention({ limit: 20 }));
      dispatch(fetchActivity({ scope: 'ALL', hours: 24 }));
      dispatch(fetchUpcomingSchedules({ limit: 10 }));
      dispatch(fetchReportsSnapshot({ limit: 5 }));
    };
    load();
    const id = setInterval(() => {
      if (!document.hidden && searchContext.csiId) {
        dispatch(fetchDashboardSummary());
        dispatch(fetchAttention({ limit: 20 }));
      }
    }, 60000);
    return () => clearInterval(id);
  }, [dispatch, searchContext.csiId]);

  // Refetch scoped widgets when search context changes
  useEffect(() => {
    if (!searchContext.csiId) return;
    dispatch(fetchDashboardSummary());
    dispatch(fetchAttention({ limit: 20 }));
    dispatch(fetchActivity({ scope: 'ALL', hours: 24 }));
    dispatch(fetchUpcomingSchedules({ limit: 10 }));
    dispatch(fetchReportsSnapshot({ limit: 5 }));
  }, [dispatch, searchContext.csiId, searchContext.environment, searchContext.tags, searchContext.tagMode]);

  return (
    <Box>
      <Stack spacing={2} mb={2}>
        <Typography variant="h4" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HomeIcon sx={{ fontSize: 32, color: 'primary.main' }} />
          Home
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Your centralized view of critical checks, anomalies, and system health across all environments.
        </Typography>
      </Stack>

      {/* GlobalSearch moved to layout header */}

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <PinnedCSIs />
        </Grid>

        {!searchContext.csiId ? (
          <Grid item xs={12}>
            <EmptyState
              title="Select a CSI to view data"
              description="Use the global search above to choose a CSI. You can also set one from My CSIs."
            />
          </Grid>
        ) : (
          <>
            <Grid item xs={12}>
              <KPIBar summary={summary.data} loading={summary.loading} error={summary.error} />
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
          </>
        )}
      </Grid>
    </Box>
  );
};

export default HomePage;



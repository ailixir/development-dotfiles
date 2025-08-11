import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, Tabs, Tab, Card, CardContent, Divider, Stack, Chip, Skeleton, IconButton, Tooltip } from '@mui/material';
import { PushPin, PushPinOutlined } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { pinCsi, unpinCsi } from '@/store/slices/dashboardSlice';

// Static CSI Overview placeholder with tabs
const CSIOverviewPage: React.FC = () => {
  const { csiId } = useParams<{ csiId: string }>();
  const [tab, setTab] = useState(0);
  const dispatch = useAppDispatch();
  const pinned = useAppSelector((s) => s.dashboard.pinnedCsiIds);
  const isPinned = !!(csiId && pinned.includes(csiId));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h4" fontWeight={700}>CSI Overview</Typography>
          <Typography variant="body2" color="text.secondary">{csiId}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip label="Open in scope" variant="outlined" />
          {csiId && (
            <Tooltip title={isPinned ? 'Unpin from Home' : 'Pin to Home'}>
              <IconButton onClick={() => dispatch(isPinned ? unpinCsi(csiId) : pinCsi(csiId))}>
                {isPinned ? <PushPin /> : <PushPinOutlined />}
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      <Card variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} aria-label="CSI tabs">
          <Tab label="Health" />
          <Tab label="Checks" />
          <Tab label="Applications" />
          <Tab label="Reports" />
          <Tab label="Studio" />
        </Tabs>
        <Divider />
        <CardContent>
          {tab === 0 && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1}>
                <Chip label="Owner: --" size="small" />
                <Chip label="BU: --" size="small" />
                <Chip label="Criticality: --" size="small" />
                <Chip label="Tags: env:*" size="small" />
              </Stack>
              <Skeleton variant="rounded" height={160} />
            </Stack>
          )}
          {tab === 1 && (
            <Stack spacing={1}>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} variant="rounded" height={36} />
              ))}
            </Stack>
          )}
          {tab === 2 && <Skeleton variant="rounded" height={120} />}
          {tab === 3 && <Skeleton variant="rounded" height={120} />}
          {tab === 4 && <Skeleton variant="rounded" height={120} />}
        </CardContent>
      </Card>
    </Box>
  );
};

export default CSIOverviewPage;



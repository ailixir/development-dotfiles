import React, { useState } from 'react';
import { Button, Chip, IconButton, List, ListItem, ListItemText, ListItemIcon, Skeleton, Stack, Typography, alpha, useTheme } from '@mui/material';
import { Error, Warning, AssignmentInd, CheckCircle } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { acknowledgeCheck, assignCheck } from '@/store/slices/dashboardSlice';
import type { AttentionItem } from '@/types/dashboard/dashboardTypes';
import { useNavigate } from 'react-router-dom';
import TriageDrawer from './TriageDrawer';
import SectionBox from './SectionBox';

const Row: React.FC<{ item: AttentionItem; onAck: () => void; onAssign: () => void; onOpen: () => void }> = ({ item, onAck, onAssign, onOpen }) => {
  const theme = useTheme();
  const isFail = item.status === 'FAILING';
  const color = isFail ? theme.palette.error.main : theme.palette.warning.main;
  const icon = isFail ? <Error sx={{ color }} /> : <Warning sx={{ color }} />;
  return (
    <ListItem
      disablePadding
      sx={{
        p: 1.5,
        borderRadius: 1,
        '&:hover': { bgcolor: alpha(color, 0.04) },
        borderLeft: `3px solid ${alpha(color, 0.6)}`,
      }}
      onClick={onOpen}
    >
      <ListItemIcon sx={{ minWidth: 36 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2" fontWeight={600}>
              {item.name}
            </Typography>
            <Chip size="small" label={item.csiName} variant="outlined" />
          </Stack>
        }
        secondary={
          <Typography variant="caption" color="text.secondary">
            {item.reason || 'Issue detected'} • since {new Date(item.since).toLocaleTimeString()}
          </Typography>
        }
      />
      <Stack direction="row" spacing={1}>
        <IconButton size="small" onClick={onAck} title="Acknowledge">
          <CheckCircle />
        </IconButton>
        <IconButton size="small" onClick={onAssign} title="Assign">
          <AssignmentInd />
        </IconButton>
      </Stack>
    </ListItem>
  );
};

interface AttentionPanelProps { maxHeight?: number | string }

const AttentionPanel: React.FC<AttentionPanelProps> = ({ maxHeight }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data, loading } = useAppSelector((s) => s.dashboard.attention);
  const [triageId, setTriageId] = useState<string | null>(null);
  const theme = useTheme();

  if (loading === 'loading') {
    return (
      <SectionBox title="Needs Attention" accentColor={theme.palette.error.main} maxHeight={maxHeight}>
        <Stack spacing={1.5}>
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={56} />
          ))}
        </Stack>
      </SectionBox>
    );
  }

  return (
    <SectionBox
      title="Needs Attention"
      accentColor={theme.palette.error.main}
      action={<Button size="small" onClick={() => navigate('/checks/all')}>View all</Button>}
      maxHeight={maxHeight}
    >
      {data.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          All clear. No failing or degrading checks.
        </Typography>
      ) : (
        <List disablePadding>
          {data.slice(0, 10).map((item) => (
            <Row
              key={item.id}
              item={item}
              onAck={() => dispatch(acknowledgeCheck(item.id))}
              onAssign={() => dispatch(assignCheck({ id: item.id, userId: 'current.user@citi.com' }))}
              onOpen={() => setTriageId(item.id)}
            />
          ))}
        </List>
      )}
      <TriageDrawer open={!!triageId} checkId={triageId} onClose={() => setTriageId(null)} />
    </SectionBox>
  );
};

export default AttentionPanel;



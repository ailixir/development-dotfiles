import React, { useState } from 'react';
import { Button, Chip, IconButton, List, ListItem, ListItemText, ListItemIcon, Skeleton, Stack, Typography, alpha, useTheme, Tooltip, Alert, Snackbar } from '@mui/material';
import { Error, Warning, AssignmentInd, CheckCircle, Campaign } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { acknowledgeCheck, assignCheck, fetchAttention, optimisticallyRemoveAttentionItem, restoreAttentionItem } from '@/store/slices/dashboardSlice';
import type { AttentionItem } from '@/types/dashboard/dashboardTypes';
import { useNavigate } from 'react-router-dom';
import TriageDrawer from './TriageDrawer';
import { createCommsTemplateFromCheck } from '@/utils/commsBridge';
import SectionBox from './SectionBox';

const Row: React.FC<{ item: AttentionItem; onAck: () => void; onAssign: () => void; onOpen: () => void }> = ({ item, onAck, onAssign, onOpen }) => {
  const theme = useTheme();
  const navigate = useNavigate();
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
        <Tooltip title="Acknowledge">
          <IconButton size="small" onClick={onAck}>
            <CheckCircle />
          </IconButton>
        </Tooltip>
        <Tooltip title="Assign">
          <IconButton size="small" onClick={onAssign}>
            <AssignmentInd />
          </IconButton>
        </Tooltip>
        <Tooltip title="Comms">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              // Build payload and store in sessionStorage for cross-MFE handoff
              try {
                const payload = createCommsTemplateFromCheck(item);
                const handoffKey = `put:handoff:comms:${Date.now()}:${Math.random().toString(36).slice(2)}`;
                sessionStorage.setItem(handoffKey, JSON.stringify(payload));
                // Save a stable alias so Comms can recover if query is lost
                sessionStorage.setItem('put:handoff:comms:latest', JSON.stringify(payload));
                // Navigate to Comms root with handoff; Comms will forward to /communications/new
                navigate(`/comms?handoff=${encodeURIComponent(handoffKey)}`);
              } catch {
                navigate('/comms');
              }
            }}
          >
            <Campaign />
          </IconButton>
        </Tooltip>
      </Stack>
    </ListItem>
  );
};

interface AttentionPanelProps { maxHeight?: number | string }

const AttentionPanel: React.FC<AttentionPanelProps> = ({ maxHeight }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.attention);
  const items = Array.isArray(data) ? data : [];
  const [triageId, setTriageId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>(() => ({ open: false, message: '', severity: 'success' }));
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
      {loading === 'failed' ? (
        <Alert severity="error" role="alert" onClose={() => dispatch(fetchAttention({ limit: 20 }))}>{error || 'Failed to load attention items'}</Alert>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          All clear. No failing or degrading checks.
        </Typography>
      ) : (
        <List disablePadding>
          {items.slice(0, 10).map((item) => (
            <Row
              key={item.id}
              item={item}
              onAck={async () => {
                // Optimistic remove with simple rollback after 4s if needed
                dispatch(optimisticallyRemoveAttentionItem(item.id));
                setToast({ open: true, message: 'Acknowledged (Undo)', severity: 'success' });
                const timer = setTimeout(() => {}, 4000);
                try {
                  await dispatch(acknowledgeCheck(item.id)).unwrap();
                  clearTimeout(timer);
                } catch {
                  clearTimeout(timer);
                  dispatch(restoreAttentionItem(item));
                  setToast({ open: true, message: 'Failed to acknowledge', severity: 'error' });
                }
              }}
              onAssign={async () => {
                try {
                  await dispatch(assignCheck({ id: item.id, userId: 'current.user@citi.com' })).unwrap();
                  setToast({ open: true, message: 'Assigned', severity: 'success' });
                } catch {
                  setToast({ open: true, message: 'Failed to assign', severity: 'error' });
                }
              }}
              onOpen={() => setTriageId(item.id)}
            />
          ))}
        </List>
      )}
      <TriageDrawer open={!!triageId} checkId={triageId} onClose={() => setTriageId(null)} />
      <Snackbar open={toast.open} autoHideDuration={2000} onClose={() => setToast((t) => ({ ...t, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={toast.severity} onClose={() => setToast((t) => ({ ...t, open: false }))}>{toast.message}</Alert>
      </Snackbar>
    </SectionBox>
  );
};

export default AttentionPanel;



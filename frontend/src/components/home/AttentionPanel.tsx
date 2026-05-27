import React, { useEffect, useMemo, useState } from 'react';
import { Button, Chip, IconButton, List, ListItem, ListItemText, ListItemIcon, Skeleton, Stack, Typography, alpha, useTheme, Tooltip, Alert, Snackbar } from '@mui/material';
import { Error, Warning, AssignmentInd, CheckCircle, Campaign, Person } from '@mui/icons-material';
import usersApi from '@/services/api/usersApi';
import { useAppDispatch, useAppSelector } from '@/store';
import { acknowledgeCheck, assignCheck, fetchAttention, optimisticallyRemoveAttentionItem, restoreAttentionItem } from '@/store/slices/dashboardSlice';
import type { AttentionItem } from '@/types/dashboard/dashboardTypes';
import { useNavigate } from 'react-router-dom';
import TriageDrawer from './TriageDrawer';
import { createCommsTemplateFromCheck } from '@/utils/commsBridge';
import SectionBox from './SectionBox';

const relativeTime = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs < 24) return remMins > 0 ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

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
        cursor: 'pointer',
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
            {item.assignedTo && (
              <Chip size="small" icon={<Person />} label={item.assignedTo.split('@')[0]} variant="outlined" color="info" />
            )}
          </Stack>
        }
        secondary={
          <Typography variant="caption" color="text.secondary">
            {item.reason || 'Issue detected'} &bull; {relativeTime(item.since)}
          </Typography>
        }
      />
      <Stack direction="row" spacing={0.5}>
        <Tooltip title="Acknowledge">
          <IconButton size="small" onClick={stop(onAck)}>
            <CheckCircle />
          </IconButton>
        </Tooltip>
        <Tooltip title="Assign to me">
          <IconButton size="small" onClick={stop(onAssign)}>
            <AssignmentInd />
          </IconButton>
        </Tooltip>
        <Tooltip title="Send to Comms">
          <IconButton
            size="small"
            onClick={stop(() => {
              try {
                const payload = createCommsTemplateFromCheck(item);
                const handoffKey = `put:handoff:comms:${Date.now()}:${Math.random().toString(36).slice(2)}`;
                sessionStorage.setItem(handoffKey, JSON.stringify(payload));
                sessionStorage.setItem('put:handoff:comms:latest', JSON.stringify(payload));
                navigate(`/comms?handoff=${encodeURIComponent(handoffKey)}`);
              } catch {
                navigate('/comms');
              }
            })}
          >
            <Campaign />
          </IconButton>
        </Tooltip>
      </Stack>
    </ListItem>
  );
};

const INITIAL_VISIBLE = 10;

interface AttentionPanelProps { maxHeight?: number | string }

const AttentionPanel: React.FC<AttentionPanelProps> = ({ maxHeight }) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.attention);
  const items = Array.isArray(data) ? data : [];
  const [triageId, setTriageId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ open: boolean; message: string; severity: 'success' | 'error'; undo?: () => void }>(() => ({ open: false, message: '', severity: 'success' }));
  const [showAll, setShowAll] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const theme = useTheme();

  useEffect(() => {
    usersApi.getMe().then((u) => setCurrentUserEmail(u.email)).catch(() => {});
  }, []);

  const sorted = useMemo(() =>
    [...items].sort((a, b) => {
      if (a.status === b.status) return new Date(a.since).getTime() - new Date(b.since).getTime();
      return a.status === 'FAILING' ? -1 : 1;
    }),
    [items],
  );

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_VISIBLE);
  const hiddenCount = sorted.length - INITIAL_VISIBLE;

  const countBadge = items.length > 0 ? (
    <Chip size="small" label={items.length} color="error" sx={{ fontWeight: 700, minWidth: 28, height: 22 }} />
  ) : null;

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
      icon={countBadge}
      accentColor={theme.palette.error.main}
      action={<Button size="small" onClick={() => navigate('/checks/all?status=FAILING')}>View all</Button>}
      maxHeight={maxHeight}
    >
      {loading === 'failed' ? (
        <Alert severity="error" role="alert" onClose={() => dispatch(fetchAttention({ limit: 20 }))}>{error || 'Failed to load attention items'}</Alert>
      ) : items.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          All clear. No failing or degrading checks.
        </Typography>
      ) : (
        <>
          <List disablePadding>
            {visible.map((item) => (
              <Row
                key={item.id}
                item={item}
                onAck={() => {
                  dispatch(optimisticallyRemoveAttentionItem(item.id));
                  const rollback = () => dispatch(restoreAttentionItem(item));
                  setToast({ open: true, message: 'Acknowledged', severity: 'success', undo: rollback });
                  dispatch(acknowledgeCheck(item.id)).unwrap().catch(() => {
                    rollback();
                    setToast({ open: true, message: 'Failed to acknowledge', severity: 'error' });
                  });
                }}
                onAssign={async () => {
                  if (!currentUserEmail) {
                    setToast({ open: true, message: 'User info unavailable', severity: 'error' });
                    return;
                  }
                  try {
                    await dispatch(assignCheck({ id: item.id, userId: currentUserEmail })).unwrap();
                    setToast({ open: true, message: 'Assigned to you', severity: 'success' });
                    dispatch(fetchAttention({ limit: 20 }));
                  } catch {
                    setToast({ open: true, message: 'Failed to assign', severity: 'error' });
                  }
                }}
                onOpen={() => setTriageId(item.id)}
              />
            ))}
          </List>
          {hiddenCount > 0 && !showAll && (
            <Button size="small" fullWidth sx={{ mt: 1 }} onClick={() => setShowAll(true)}>
              Show {hiddenCount} more
            </Button>
          )}
        </>
      )}
      <TriageDrawer open={!!triageId} checkId={triageId} onClose={() => setTriageId(null)} />
      <Snackbar
        open={toast.open}
        autoHideDuration={4000}
        onClose={() => setToast((t) => ({ ...t, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast.severity}
          onClose={() => setToast((t) => ({ ...t, open: false }))}
          action={
            toast.undo ? (
              <Button color="inherit" size="small" onClick={() => { toast.undo?.(); setToast((t) => ({ ...t, open: false })); }}>
                Undo
              </Button>
            ) : undefined
          }
        >
          {toast.message}
        </Alert>
      </Snackbar>
    </SectionBox>
  );
};

export default AttentionPanel;



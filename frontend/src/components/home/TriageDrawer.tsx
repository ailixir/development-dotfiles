import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, ChipProps, Divider, Drawer, IconButton, Paper, Skeleton, Stack, Tooltip, Typography, alpha, useTheme } from '@mui/material';
import { PlayArrow, OpenInNew, ContentCopy, Person } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { checksApi } from '@/services/api/checksApi';
import { useAppDispatch } from '@/store';
import { executeCheck } from '@/store/slices/checksSlice';
import type { CheckEntity, ExecutionResult } from '@/types/checks/checkTypes';

interface TriageDrawerProps {
  open: boolean;
  checkId: string | null;
  onClose: () => void;
}

const statusColor = (status: string): ChipProps['color'] => {
  switch (status) {
    case 'SUCCESS': case 'PASSING': return 'success';
    case 'WARNING': return 'warning';
    case 'FAILURE': case 'FAILING': case 'TIMEOUT': return 'error';
    default: return 'default';
  }
};

const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const relativeTime = (iso: string): string => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const TriageDrawer: React.FC<TriageDrawerProps> = ({ open, checkId, onClose }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<CheckEntity | null>(null);
  const [history, setHistory] = useState<ExecutionResult[]>([]);
  const [executing, setExecuting] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  useEffect(() => {
    if (!open || !checkId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [d, h] = await Promise.all([
          checksApi.getCheckById(checkId),
          checksApi.getCheckExecutions(checkId, 5),
        ]);
        if (!cancelled) {
          setDetails(d as CheckEntity);
          setHistory(Array.isArray(h?.data) ? h.data : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, checkId]);

  const lastRun = history[0] ?? null;

  const handleExecute = async () => {
    if (!checkId) return;
    setExecuting(true);
    try {
      await dispatch(executeCheck(checkId)).unwrap();
      const [d, h] = await Promise.all([
        checksApi.getCheckById(checkId),
        checksApi.getCheckExecutions(checkId, 5),
      ]);
      setDetails(d as CheckEntity);
      setHistory(Array.isArray(h?.data) ? h.data : []);
    } finally {
      setExecuting(false);
    }
  };

  const copyOutput = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 1500); } catch { /* Clipboard permissions may deny this optional copy; keep the original output available. */ }
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520 } } }}>
      <Box sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Typography variant="h6" fontWeight={700}>Triage</Typography>
          <Button size="small" onClick={onClose}>Close</Button>
        </Stack>
        <Divider sx={{ my: 2 }} />

        {loading ? (
          <Stack spacing={2}>
            <Skeleton variant="text" width="60%" height={28} />
            <Skeleton variant="rounded" height={40} />
            <Skeleton variant="rounded" height={120} />
          </Stack>
        ) : !details ? (
          <Typography variant="body2" color="text.secondary">No data</Typography>
        ) : (
          <Stack spacing={2.5} sx={{ flex: 1, overflow: 'auto' }}>
            {/* Check identity */}
            <Stack spacing={0.5}>
              <Typography variant="subtitle1" fontWeight={700}>{details.name}</Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label={statusLabel(details.status)} color={statusColor(details.status)} />
                <Chip size="small" label={details.type} variant="outlined" />
                <Chip size="small" label={details.csiName} variant="outlined" />
                {details.assignedTo && (
                  <Chip size="small" icon={<Person />} label={`Assigned: ${details.assignedTo.split('@')[0]}`} color="info" variant="outlined" />
                )}
              </Stack>
            </Stack>

            {/* Quick actions */}
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="contained"
                startIcon={<PlayArrow />}
                disabled={executing}
                onClick={handleExecute}
              >
                {executing ? 'Running...' : 'Execute Now'}
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<OpenInNew />}
                onClick={() => { onClose(); navigate(`/checks/details/${checkId}`); }}
              >
                Full Details
              </Button>
            </Stack>

            <Divider />

            {/* Last output preview */}
            {lastRun && (
              <Box>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Typography variant="subtitle2" fontWeight={600}>Last Output</Typography>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Chip size="small" label={statusLabel(lastRun.status)} color={statusColor(lastRun.status)} />
                    <Typography variant="caption" color="text.secondary">{Math.round(lastRun.duration)} ms</Typography>
                    {lastRun.output && (
                      <Tooltip title={copyFeedback ? 'Copied!' : 'Copy output'}>
                        <IconButton size="small" onClick={() => copyOutput(lastRun.output || '')}>
                          <ContentCopy sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </Stack>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    maxHeight: 200,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    fontSize: 12,
                    lineHeight: 1.6,
                    bgcolor: '#0B0F14',
                    color: '#E5E7EB',
                    borderColor: '#1F2937',
                    borderRadius: 1,
                  }}
                >
                  {lastRun.output || 'No output'}
                </Paper>
              </Box>
            )}

            {/* Recent executions */}
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Recent Runs</Typography>
              <Stack spacing={0.75}>
                {history.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">No executions yet</Typography>
                ) : history.map((e) => (
                  <Stack
                    key={e.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      borderRadius: 1,
                      bgcolor: alpha(theme.palette.divider, 0.04),
                      '&:hover': { bgcolor: alpha(theme.palette.divider, 0.08) },
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" label={statusLabel(e.status)} color={statusColor(e.status)} sx={{ minWidth: 64 }} />
                      <Typography variant="caption" color="text.secondary">{Math.round(e.duration)} ms</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {relativeTime(e.endTime || e.startTime)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

export default TriageDrawer;



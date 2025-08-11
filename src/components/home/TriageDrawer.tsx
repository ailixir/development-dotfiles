import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Divider, Drawer, Stack, Typography, useTheme } from '@mui/material';
import { checksApi } from '@/services/api/checksApi';

interface TriageDrawerProps {
  open: boolean;
  checkId: string | null;
  onClose: () => void;
}

const TriageDrawer: React.FC<TriageDrawerProps> = ({ open, checkId, onClose }) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

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
          setDetails(d);
          setHistory(Array.isArray(h?.data) ? h.data : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, checkId]);

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: 480 } }}>
      <Box sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" fontWeight={700}>Triage</Typography>
          <Button size="small" onClick={onClose}>Close</Button>
        </Stack>
        <Divider sx={{ my: 2 }} />

        {loading ? (
          <Typography variant="body2" color="text.secondary">Loading…</Typography>
        ) : !details ? (
          <Typography variant="body2" color="text.secondary">No data</Typography>
        ) : (
          <Stack spacing={2}>
            <Stack>
              <Typography variant="subtitle2" fontWeight={700}>{details.name}</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={details.status} color={
                  details.status === 'FAILING' ? 'error' : details.status === 'WARNING' ? 'warning' : 'success'
                } />
                <Chip size="small" label={details.csiName} variant="outlined" />
              </Stack>
            </Stack>

            <Box>
              <Typography variant="subtitle2" gutterBottom>Recent executions</Typography>
              <Stack spacing={1}>
                {history.map((e) => (
                  <Stack key={e.id} direction="row" justifyContent="space-between">
                    <Typography variant="body2">{e.status}</Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(e.endTime || e.startTime).toLocaleString()}</Typography>
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



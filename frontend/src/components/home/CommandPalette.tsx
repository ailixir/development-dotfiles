import React, { useEffect, useMemo, useState } from 'react';
import { Box, Dialog, List, ListItemButton, ListItemText, Paper, TextField } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { searchAll } from '@/store/slices/dashboardSlice';
import { useUiTestAvailability } from '@/hooks/useUiTestAvailability';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const UI_TESTS_PATH = '/checks/all?type=UI_TEST';

const NAV_ITEMS = [
  { title: 'Home', path: '/checks' },
  { title: 'All Checks', path: '/checks/all' },
  { title: 'Reports', path: '/checks/reports' },
  { title: 'UI tests', path: UI_TESTS_PATH },
  { title: 'Splunk prototype', path: '/checks/prototype/splunk' },
];

const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { data, loading } = useAppSelector((s) => s.dashboard.search);
  const results = Array.isArray(data) ? data : [];
  const [q, setQ] = useState('');
  // The UI tests entry is shown only when UI tests are available (DC-18, DC-23).
  const uiTestAvailability = useUiTestAvailability();

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      if (q.trim().length >= 2) dispatch(searchAll({ query: q }));
    }, 150);
    return () => clearTimeout(id);
  }, [dispatch, q, open]);

  const staticMatches = useMemo(() => {
    const term = q.toLowerCase();
    return NAV_ITEMS.filter(
      (i) => (i.path !== UI_TESTS_PATH || uiTestAvailability === 'on') && i.title.toLowerCase().includes(term),
    );
  }, [q, uiTestAvailability]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <Paper sx={{ p: 2 }}>
        <TextField
          fullWidth
          autoFocus
          placeholder="Type a command or search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Box sx={{ mt: 1, maxHeight: 360, overflow: 'auto' }}>
          <List dense>
            {staticMatches.map((i) => (
              <ListItemButton key={i.path} onClick={() => { navigate(i.path); onClose(); }}>
                <ListItemText primary={i.title} />
              </ListItemButton>
            ))}
            {q.trim().length >= 2 && (
              <>
                {loading === 'loading' && <Box p={2}>Searching…</Box>}
                {results.slice(0, 8).map((r) => (
                  <ListItemButton key={`${r.type}-${r.id}`} onClick={() => { navigate(r.path); onClose(); }}>
                    <ListItemText primary={r.title} secondary={r.subtitle} />
                  </ListItemButton>
                ))}
              </>
            )}
          </List>
        </Box>
      </Paper>
    </Dialog>
  );
};

export default CommandPalette;



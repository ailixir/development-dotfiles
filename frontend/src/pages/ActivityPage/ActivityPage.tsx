import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  List,
  ListItem,
  ListItemText,
  Skeleton,
  Alert,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  FormControl,
  Select,
  MenuItem,
  Divider,
  alpha,
  useTheme,
} from '@mui/material';
import { Refresh, Timeline, Person, Public } from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchActivity } from '@/store/slices/dashboardSlice';
import type { ActivityItem } from '@/types/dashboard/dashboardTypes';

const TYPE_COLORS: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'info'> = {
  EXECUTION: 'primary',
  EDIT: 'secondary',
  ASSIGN: 'warning',
  COMMENT: 'info',
};

const HOURS_OPTIONS = [
  { value: 1, label: '1h' },
  { value: 6, label: '6h' },
  { value: 24, label: '24h' },
  { value: 72, label: '3d' },
  { value: 168, label: '7d' },
];

const ActivityPage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { data, loading, error } = useAppSelector((s) => s.dashboard.activity);
  const searchContext = useAppSelector((s) => s.dashboard.searchContext);

  const [scope, setScope] = useState<'ALL' | 'MINE'>('ALL');
  const [hours, setHours] = useState(24);

  const items: ActivityItem[] = Array.isArray(data) ? data : [];

  const load = () => {
    dispatch(fetchActivity({ scope, hours, csiId: searchContext.csiId }));
  };

  useEffect(() => {
    load();
  }, [scope, hours, searchContext.csiId]);

  const formatTimestamp = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    if (diffMs < 60_000) return 'Just now';
    if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`;
    if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Timeline color="primary" />
          <Typography variant="h4" fontWeight={700}>
            Activity
          </Typography>
          {loading === 'succeeded' && (
            <Chip label={`${items.length} events`} size="small" variant="outlined" />
          )}
        </Stack>
        <Button startIcon={<Refresh />} onClick={load} disabled={loading === 'loading'} size="small">
          Refresh
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={scope}
          onChange={(_, val) => val && setScope(val)}
        >
          <ToggleButton value="ALL">
            <Public fontSize="small" sx={{ mr: 0.5 }} />
            All
          </ToggleButton>
          <ToggleButton value="MINE">
            <Person fontSize="small" sx={{ mr: 0.5 }} />
            Mine
          </ToggleButton>
        </ToggleButtonGroup>

        <FormControl size="small" sx={{ minWidth: 90 }}>
          <Select value={hours} onChange={(e) => setHours(e.target.value as number)}>
            {HOURS_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Paper variant="outlined" sx={{ p: 0 }}>
        {loading === 'loading' ? (
          <Stack spacing={0} sx={{ p: 2 }}>
            {[...Array(8)].map((_, i) => (
              <Stack key={i} direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
                <Skeleton variant="rounded" width={80} height={24} />
                <Skeleton variant="text" width="50%" />
                <Skeleton variant="text" width="15%" />
              </Stack>
            ))}
          </Stack>
        ) : loading === 'failed' ? (
          <Alert
            severity="error"
            sx={{ m: 2 }}
            action={<Button size="small" onClick={load}>Retry</Button>}
          >
            {error || 'Failed to load activity'}
          </Alert>
        ) : items.length === 0 ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <Typography variant="body2" color="text.secondary">
              No activity in the last {hours}h
            </Typography>
            <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={load}>
              Refresh
            </Button>
          </Stack>
        ) : (
          <List disablePadding>
            {items.map((item, idx) => (
              <React.Fragment key={item.id}>
                {idx > 0 && <Divider component="li" />}
                <ListItem
                  sx={{
                    px: 2,
                    py: 1.5,
                    transition: 'background-color 120ms ease',
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.03) },
                  }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Chip
                          size="small"
                          label={item.type}
                          color={TYPE_COLORS[item.type] || 'default'}
                          variant="outlined"
                          sx={{ minWidth: 90, justifyContent: 'center' }}
                        />
                        <Typography variant="body2" fontWeight={500}>
                          {item.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
                          {formatTimestamp(item.timestamp)}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      item.description || item.csiName ? (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: 'block' }}>
                          {[item.description, item.csiName].filter(Boolean).join(' · ')}
                        </Typography>
                      ) : undefined
                    }
                  />
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        )}
      </Paper>
    </Box>
  );
};

export default ActivityPage;

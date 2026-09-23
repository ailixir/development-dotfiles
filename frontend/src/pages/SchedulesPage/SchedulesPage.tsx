import type { BackendScheduleDto } from '@/services/api/mappers/scheduleMapper';
import { schedulesApi } from '@/services/api/schedulesApi';
import type { ApiResponse } from '@/types/common/commonTypes';
import { formatNextCronRun, parseCron } from '@/utils/cronNextRun';
import {
  Delete,
  FilterList,
  OpenInNew,
  Refresh,
  Schedule,
  Search,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

type EnabledFilter = 'all' | 'enabled' | 'disabled';

const SchedulesPage: React.FC = () => {
  const theme = useTheme();
  const navigate = useNavigate();

  const [data, setData] = useState<BackendScheduleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>('all');
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<BackendScheduleDto | null>(null);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof schedulesApi.list>[0] = {
        page: page + 1,
        limit: rowsPerPage,
      };
      if (enabledFilter !== 'all') {
        params!.enabled = enabledFilter === 'enabled';
      }
      const response: ApiResponse<BackendScheduleDto[]> = await schedulesApi.list(params);
      setData(response.data);
      setTotal(response.total ?? 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, enabledFilter]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleToggleEnabled = async (schedule: BackendScheduleDto) => {
    setTogglingIds((prev) => new Set(prev).add(schedule.id));
    try {
      const updated = await schedulesApi.setEnabled(schedule.id, !schedule.enabled);
      setData((prev) => prev.map((s) => (s.id === schedule.id ? updated : s)));
    } catch {
      // revert on error - refetch
      await fetchSchedules();
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(schedule.id);
        return next;
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try {
      await schedulesApi.delete(id);
      setData((prev) => prev.filter((s) => s.id !== id));
      setTotal((prev) => prev - 1);
    } catch {
      setError('Failed to delete schedule');
    }
  };

  const filteredData = search
    ? data.filter(
        (s) =>
          s.checkId.toLowerCase().includes(search.toLowerCase()) ||
          s.cronExpression.toLowerCase().includes(search.toLowerCase()) ||
          s.timezone.toLowerCase().includes(search.toLowerCase()),
      )
    : data;

  const formatNextExecution = (iso: string | null, cronExpression?: string): string => {
    if (!iso) {
      if (cronExpression && parseCron(cronExpression)) return formatNextCronRun(cronExpression);
      return '—';
    }
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs < 0) return 'Overdue';
    if (diffMs < 60_000) return 'Less than 1 min';
    if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)} min`;
    return d.toLocaleString();
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Schedule color="primary" />
          <Typography variant="h4" fontWeight={700}>
            Schedules
          </Typography>
          {!loading && (
            <Chip label={`${total} total`} size="small" variant="outlined" />
          )}
        </Stack>
        <Button startIcon={<Refresh />} onClick={fetchSchedules} disabled={loading} size="small">
          Refresh
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search by check, cron, timezone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: 280 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <Select
            value={enabledFilter}
            onChange={(e) => {
              setEnabledFilter(e.target.value as EnabledFilter);
              setPage(0);
            }}
            startAdornment={<FilterList fontSize="small" sx={{ mr: 0.5 }} />}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="enabled">Enabled</MenuItem>
            <MenuItem value="disabled">Disabled</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} action={<Button size="small" onClick={fetchSchedules}>Retry</Button>}>
          {error}
        </Alert>
      )}

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Check ID</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Frequency</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Cron Expression</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Timezone</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Next Execution</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Enabled</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(7)].map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    {search ? 'No schedules match your search' : 'No schedules configured yet'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredData.map((schedule) => (
                <TableRow
                  key={schedule.id}
                  hover
                  sx={{
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.02) },
                    opacity: schedule.enabled ? 1 : 0.6,
                  }}
                >
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                      {schedule.checkId.slice(0, 8)}...
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={schedule.frequency}
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">
                      {schedule.cronExpression}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{schedule.timezone}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatNextExecution(schedule.nextExecutionAt, schedule.cronExpression)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Switch
                      size="small"
                      checked={schedule.enabled}
                      disabled={togglingIds.has(schedule.id)}
                      onChange={() => handleToggleEnabled(schedule)}
                      color="success"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="View check">
                        <IconButton
                          size="small"
                          onClick={() => navigate(`/checks/details/${schedule.checkId}`)}
                        >
                          <OpenInNew fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete schedule">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteTarget(schedule)}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!loading && total > rowsPerPage && (
          <TablePagination
            component="div"
            count={total}
            page={page}
            rowsPerPage={rowsPerPage}
            onPageChange={(_, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
          />
        )}
      </TableContainer>

      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete schedule?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently remove the schedule for check{' '}
            <strong>{deleteTarget?.checkId.slice(0, 8)}...</strong> ({deleteTarget?.cronExpression}).
            The check itself will not be deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} autoFocus>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SchedulesPage;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  MenuItem,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { Add, Movie } from '@mui/icons-material';
import CreateTestDialog from '@/components/studio/tests/CreateTestDialog';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCSIs } from '@/store/slices/csiSlice';
import { useUrlListState } from '@/hooks/useUrlListState';
import { SortableHeaderCell, StudioListLayout } from '@/components/studio/list/StudioListLayout';
import { hideBelowMd } from '@/components/studio/list/studioListSx';
import { executionStatusLabel } from '@/components/studio/run/executionStatus';
import {
  DEFAULT_EXECUTION_SORT,
  EXECUTION_STATUS_FILTERS,
  isExecutionSort,
  type ExecutionSort,
  type ExecutionStatusFilter,
} from '@/types/studio/studioTypes';
import { useStudioRuns } from '@/components/studio/runs/useStudioRuns';
import { useLiveRunsRefresh } from '@/components/studio/runs/useLiveRunsRefresh';
import { RunRow } from '@/components/studio/runs/RunRow';
import { RunDetailsDrawer } from '@/components/studio/runs/RunDetailsDrawer';
import { copyText, runDetailsPath, runsListPath, studioTestPath, studioTestsPath } from '@/components/studio/runs/runLinks';
import { isActiveRunStatus } from '@/components/studio/runs/runSnapshots';

export const RUNS_PAGE_SIZE = 25;

type StatusFilterValue = ExecutionStatusFilter | '';
const STATUS_VALUES: readonly StatusFilterValue[] = ['', ...EXECUTION_STATUS_FILTERS];
/** Columns: Test · Status · System · Requested · Duration · actions. */
const COLUMN_SX = [undefined, undefined, hideBelowMd, undefined, hideBelowMd, undefined] as const;

function statusFilterLabel(status: ExecutionStatusFilter): string {
  return status === 'CANCELLED' ? 'Cancelled' : executionStatusLabel(status);
}

/**
 * Run history (story 10.46): server-paged, URL-driven list with a deep-linked, live run details
 * drawer at `studio/runs/:executionId`.
 */
const StudioRunsPage: React.FC = () => {
  const { executionId } = useParams<{ executionId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const csiId = useAppSelector((state) => state.dashboard.searchContext.csiId);
  const registeredCsis = useAppSelector((state) => state.csi.data);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  useEffect(() => { void dispatch(fetchCSIs()); }, [dispatch]);
  const csiNames = useMemo(
    () => new Map(registeredCsis.map((csi) => [csi.id, csi.name])),
    [registeredCsis],
  );

  const list = useUrlListState<{ status: StatusFilterValue }, ExecutionSort>({
    filters: { status: { defaultValue: '', values: STATUS_VALUES } },
    defaultSort: DEFAULT_EXECUTION_SORT,
    isSort: isExecutionSort,
    defaultPageSize: RUNS_PAGE_SIZE,
  });
  const { page, setPage, pageSize } = list;

  const { runs, totalElements, loading, error, runningCount, reload, applySnapshot } = useStudioRuns({
    q: list.debouncedQuery,
    status: list.filters.status,
    csiId,
    sort: list.sort,
    page,
    pageSize,
  });

  const hasActiveRun = runs.some((run) => isActiveRunStatus(run.status));
  const backgroundRefresh = useCallback(() => reload({ silent: true }), [reload]);
  useLiveRunsRefresh({ active: hasActiveRun && error === null, refresh: backgroundRefresh });

  // A different global system starts the list from its first page.
  const previousCsi = useRef(csiId);
  useEffect(() => {
    if (previousCsi.current === csiId) return;
    previousCsi.current = csiId;
    if (page !== 1) setPage(1, { replace: true });
  }, [csiId, page, setPage]);

  // A page past the end (stale link, rows gone) falls back to the last page that exists.
  useEffect(() => {
    if (loading || error || runs.length > 0 || totalElements === 0 || page === 1) return;
    // Replace, not push: Back must not return to the empty page, which would redirect again.
    setPage(Math.max(1, Math.ceil(totalElements / pageSize)), { replace: true });
  }, [loading, error, runs.length, totalElements, page, pageSize, setPage]);

  const listPath = runsListPath(location.pathname);
  const runHref = (id: string) => runDetailsPath(listPath, id, location.search);
  const testHref = useCallback((testId: string) => studioTestPath(listPath, testId), [listPath]);

  const openRun = (id: string) => navigate(runHref(id));
  const closeRun = () => navigate({ pathname: listPath, search: location.search });
  const switchRun = (id: string) => navigate(runHref(id), { replace: true });
  const copyRunLink = (id: string) => {
    void copyText(`${window.location.origin}${runHref(id)}`).then((copied) =>
      setNotice(copied
        ? { message: 'Link copied', severity: 'success' }
        : { message: 'The link could not be copied', severity: 'error' }),
    );
  };

  const filterActive = list.hasActiveFilters || csiId !== null;

  return (
    <Box>
      <StudioListLayout
        title="Runs"
        description="Browser test results, live progress and recordings."
        icon={<Movie aria-hidden="true" />}
        action={
          <>
            {runningCount !== null && runningCount > 0 && (
              <Chip
                color="info"
                variant={list.filters.status === 'RUNNING' ? 'filled' : 'outlined'}
                data-testid="runs-running-count"
                aria-pressed={list.filters.status === 'RUNNING'}
                icon={<CircularProgress size={12} thickness={6} color="inherit" sx={{ ml: '8px !important' }} />}
                label={`${runningCount} running`}
                onClick={() => list.setFilter('status', list.filters.status === 'RUNNING' ? '' : 'RUNNING')}
              />
            )}
            <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)} size="large">Create Test</Button>
          </>
        }
        query={list.query}
        onQueryChange={list.setQuery}
        filter={
          <Grid item xs={12} md={2}>
            <TextField
              fullWidth
              select
              label="Status"
              value={list.filters.status}
              onChange={(event) => list.setFilter('status', event.target.value as StatusFilterValue)}
            >
              <MenuItem value="">All Status</MenuItem>
              {EXECUTION_STATUS_FILTERS.map((status) => (
                <MenuItem key={status} value={status}>{statusFilterLabel(status)}</MenuItem>
              ))}
            </TextField>
          </Grid>
        }
        csiId={csiId}
        loading={loading}
        error={error}
        onRefresh={() => { void reload(); }}
        emptyTitle={filterActive ? 'No matching runs' : 'No runs yet'}
        emptyMessage={filterActive ? 'No runs match your filters.' : 'Run a test from the Studio editor and its result appears here.'}
        emptyAction={filterActive ? undefined : { label: 'Go to tests', onClick: () => navigate(studioTestsPath(listPath)) }}
        hasActiveFilters={list.hasActiveFilters}
        onClearFilters={list.clearAll}
        count={totalElements}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        pageSizeOptions={list.pageSizeOptions}
        onPageSizeChange={list.setPageSize}
        showRefresh
        skeletonColumns={COLUMN_SX.length}
        skeletonColumnSx={COLUMN_SX}
      >
        <TableContainer>
          <Table size="small" aria-label="UI test runs">
            <TableHead>
              <TableRow>
                <TableCell>Test</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={hideBelowMd}>System</TableCell>
                <SortableHeaderCell
                  field="acceptedAt"
                  label="Requested"
                  activeField={list.sortField}
                  direction={list.sortDirection}
                  onSort={(field) => list.toggleSort(field, 'desc')}
                />
                <SortableHeaderCell
                  field="durationMs"
                  label="Duration"
                  activeField={list.sortField}
                  direction={list.sortDirection}
                  onSort={(field) => list.toggleSort(field, 'desc')}
                  sx={hideBelowMd}
                />
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {runs.map((run) => (
                <RunRow
                  key={run.executionId}
                  run={run}
                  csiName={run.csiId ? csiNames.get(run.csiId) ?? null : null}
                  href={runHref(run.executionId)}
                  selected={run.executionId === executionId}
                  onOpenRun={() => openRun(run.executionId)}
                  onOpenTest={run.testName === null ? undefined : () => navigate(testHref(run.testId))}
                  onCopyLink={() => copyRunLink(run.executionId)}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </StudioListLayout>

      <RunDetailsDrawer
        executionId={executionId ?? null}
        pageRuns={runs}
        onClose={closeRun}
        onNavigateRun={switchRun}
        onCopyLink={copyRunLink}
        testHref={testHref}
        onSnapshot={applySnapshot}
      />

      <CreateTestDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setCreateOpen(false);
          navigate(testHref(created.id));
        }}
      />

      <Snackbar
        open={notice !== null}
        autoHideDuration={3000}
        onClose={() => setNotice(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        {notice ? (
          <Alert onClose={() => setNotice(null)} severity={notice.severity} sx={{ width: '100%' }}>
            {notice.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
};

export default StudioRunsPage;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  LinearProgress,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchCSIs } from '@/store/slices/csiSlice';
import { hideBelowMd } from '@/components/studio/list/studioListSx';
import { DEFAULT_EXECUTION_SORT } from '@/types/studio/studioTypes';
import { useStudioRuns } from '@/components/studio/runs/useStudioRuns';
import { useLiveRunsRefresh } from '@/components/studio/runs/useLiveRunsRefresh';
import { RunRow } from '@/components/studio/runs/RunRow';
import { RunDetailsDrawer } from '@/components/studio/runs/RunDetailsDrawer';
import { copyText } from '@/components/studio/runs/runLinks';
import { isActiveRunStatus } from '@/components/studio/runs/runSnapshots';
import { uiTestEditorPath, uiTestRunPath, uiTestRunsPath } from '@/components/studio/uiTestPaths';
import { useUiTestDetailContext } from './useUiTestDetail';

const UI_TEST_RUNS_PAGE_SIZE = 25;
const UI_TEST_RUNS_PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50];
const UI_TEST_RUNS_NOTE = 'Runs lists replays of this test. Learning happens in Studio.';
const UI_TEST_RUNS_EMPTY_MESSAGE = 'No replays yet. Run the test from Studio and its result appears here.';

/**
 * The detail page's Runs tab (spec §8.4): this test's replays, newest first, server-paged, live while a
 * replay is active. It is the child of `runs` and of `runs/:executionId`; the run in the URL opens the
 * run details drawer, bound to this test. Learns are never listed (the server does not return them).
 */
export const UiTestRunsTab: React.FC = () => {
  const { testId } = useUiTestDetailContext();
  const { executionId } = useParams<{ executionId?: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const registeredCsis = useAppSelector((state) => state.csi.data);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(UI_TEST_RUNS_PAGE_SIZE);
  const [notice, setNotice] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  useEffect(() => { void dispatch(fetchCSIs()); }, [dispatch]);
  const csiNames = useMemo(
    () => new Map(registeredCsis.map((csi) => [csi.id, csi.name])),
    [registeredCsis],
  );

  const { runs, totalElements, loading, error, reload, applySnapshot } = useStudioRuns({
    q: '',
    status: '',
    csiId: null,
    sort: DEFAULT_EXECUTION_SORT,
    testId,
    page,
    pageSize,
  });

  const hasActiveRun = runs.some((run) => isActiveRunStatus(run.status));
  const backgroundRefresh = useCallback(() => reload({ silent: true }), [reload]);
  useLiveRunsRefresh({ active: hasActiveRun && error === null, refresh: backgroundRefresh });

  // A different test starts from its first page.
  const previousTestId = useRef(testId);
  useEffect(() => {
    if (previousTestId.current === testId) return;
    previousTestId.current = testId;
    setPage(1);
  }, [testId]);

  // A page past the end (rows gone) falls back to the last page that exists.
  useEffect(() => {
    if (loading || error || runs.length > 0 || totalElements === 0 || page === 1) return;
    setPage(Math.max(1, Math.ceil(totalElements / pageSize)));
  }, [loading, error, runs.length, totalElements, page, pageSize]);

  const runHref = (id: string) => uiTestRunPath(testId, id);
  const openRun = (id: string) => navigate(runHref(id));
  const closeRun = () => navigate(uiTestRunsPath(testId));
  const switchRun = (id: string) => navigate(runHref(id), { replace: true });
  const copyRunLink = (id: string) => {
    void copyText(`${window.location.origin}${runHref(id)}`).then((copied) =>
      setNotice(copied
        ? { message: 'Link copied', severity: 'success' }
        : { message: 'The link could not be copied', severity: 'error' }),
    );
  };

  const showInitialLoad = loading && runs.length === 0 && error === null;

  return (
    <Box data-testid="ui-test-runs-tab">
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }} data-testid="ui-test-runs-note">
        {UI_TEST_RUNS_NOTE}
      </Typography>

      {error !== null && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={() => { void reload(); }}>Retry</Button>}
        >
          {error}
        </Alert>
      )}

      {showInitialLoad && <LinearProgress data-testid="ui-test-runs-loading" sx={{ mb: 2 }} />}

      {!showInitialLoad && error === null && totalElements === 0 && runs.length === 0 && (
        <Typography variant="body2" color="text.secondary" data-testid="ui-test-runs-empty" sx={{ py: 3 }}>
          {UI_TEST_RUNS_EMPTY_MESSAGE}
        </Typography>
      )}

      {runs.length > 0 && (
        <>
          <TableContainer sx={{ opacity: loading ? 0.6 : 1 }}>
            <Table size="small" aria-label="Runs of this UI test">
              <TableHead>
                <TableRow>
                  <TableCell>Run</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={hideBelowMd}>System</TableCell>
                  <TableCell>Requested</TableCell>
                  <TableCell sx={hideBelowMd}>Duration</TableCell>
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
                    onCopyLink={() => copyRunLink(run.executionId)}
                  />
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalElements}
            page={Math.max(0, page - 1)}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[...UI_TEST_RUNS_PAGE_SIZE_OPTIONS]}
            onPageChange={(_event, zeroBased) => setPage(zeroBased + 1)}
            onRowsPerPageChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(1);
            }}
          />
        </>
      )}

      <RunDetailsDrawer
        executionId={executionId ?? null}
        pageRuns={runs}
        onClose={closeRun}
        onNavigateRun={switchRun}
        onCopyLink={copyRunLink}
        testHref={(id) => uiTestEditorPath(id)}
        onSnapshot={applySnapshot}
        expectedTestId={testId}
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

export default UiTestRunsTab;

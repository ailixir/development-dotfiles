import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
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
import { hideBelowMd } from '@/components/studio/list/studioListSx';
import { DEFAULT_EXECUTION_SORT } from '@/types/studio/studioTypes';
import { useStudioRuns } from '@/components/studio/runs/useStudioRuns';
import { useLiveRunsRefresh } from '@/components/studio/runs/useLiveRunsRefresh';
import { RunRow } from '@/components/studio/runs/RunRow';
import { RunDetailsDrawer } from '@/components/studio/runs/RunDetailsDrawer';
import { copyText } from '@/components/studio/runs/runLinks';
import { isActiveRunStatus } from '@/components/studio/runs/runSnapshots';
import { uiTestEditorPath, uiTestPath, uiTestRunPath } from '@/components/studio/uiTestPaths';

const UI_TEST_RUNS_PAGE_SIZE = 25;
const UI_TEST_RUNS_PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50];
const UI_TEST_RUNS_NOTE =
  'Runs lists replays of this test, including the replay that records proof after each learn. Learning happens in Studio.';
const UI_TEST_RUNS_EMPTY_MESSAGE = 'No replays yet. Run the test from Studio and its result appears here.';

export interface UiTestRecentRunsCardProps {
  testId: string;
}

/**
 * The detail page's Recent Runs card: this test's replays, newest first, server-paged, live while a
 * replay is active. The run in the URL (`runs/:executionId`) opens the run details drawer, bound to this
 * test, over the page; closing it goes back to the detail page. Learns are never listed (the server does
 * not return them).
 */
export const UiTestRecentRunsCard: React.FC<UiTestRecentRunsCardProps> = ({ testId }) => {
  const { executionId } = useParams<{ executionId?: string }>();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(UI_TEST_RUNS_PAGE_SIZE);
  const [notice, setNotice] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

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
  const closeRun = () => navigate(uiTestPath(testId));
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
    <Card variant="outlined" data-testid="ui-test-recent-runs">
      <CardHeader title="Recent Runs" />
      <CardContent>
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
              <Table
                size="small"
                aria-label="Runs of this UI test"
                sx={{
                  // Below sm the cells use compact side padding so the four visible columns fit a phone
                  // without a horizontal scroll (STUDIO-UNIFY-001.6 AC-06, tightened by STUDIO-UNIFY-001.8
                  // AC-01 now the card keeps MUI's own padding); from sm up it is MUI's small-table 16 px.
                  '& .MuiTableCell-root': { px: { xs: 0.25, sm: 2, lg: 1 } },
                  // Below sm the header labels and the chip label padding are one step smaller so every
                  // status chip, Running (spinner) included, fits the phone-width card (STUDIO-UNIFY-001.8
                  // AC-01); from sm up both are MUI's.
                  '& .MuiTableCell-head': { fontSize: { xs: '0.75rem', sm: '0.875rem' } },
                  '& .MuiChip-label': { px: { xs: 0.75, sm: 1 } },
                  // From lg up the card sits beside the Latest run card and is only 300-400 px wide at
                  // every desktop width, so Requested and Duration drop (STUDIO-UNIFY-001.7 AC-05); the
                  // Run link, Status and the row menu are never hidden, and the table never scrolls.
                  '& [data-column="requested"], & [data-column="duration"]': { display: { lg: 'none' } },
                  // The requested time may wrap to two lines on a phone; from sm up it stays on one line.
                  '& [data-testid="run-requested"]': { whiteSpace: { xs: 'normal', sm: 'nowrap' } },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Run</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell data-column="requested">Requested</TableCell>
                    <TableCell data-column="duration" sx={hideBelowMd}>Duration</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {runs.map((run) => (
                    <RunRow
                      key={run.executionId}
                      run={run}
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
              data-testid="ui-test-runs-pagination"
              sx={{
                // Same treatment as the All Checks pager (STUDIO-UNIFY-001.5 AC-06), kept to `xl`: the card is
                // only 300-400 px wide beside Latest run below that, so the rows-per-page selector is hidden
                // and the arrows stay on one row inside the card.
                '& .MuiTablePagination-selectLabel': { display: { xs: 'none', xl: 'block' } },
                '& .MuiTablePagination-input': { display: { xs: 'none', xl: 'inline-flex' } },
              }}
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
      </CardContent>

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
    </Card>
  );
};

export default UiTestRecentRunsCard;

import React, { useCallback, useEffect, useRef } from 'react';
import { Alert, Box, Button, Card, CardContent, CardHeader, LinearProgress, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_EXECUTION_SORT, isTerminalExecutionStatus } from '@/types/studio/studioTypes';
import { useStudioRuns } from '@/components/studio/runs/useStudioRuns';
import { useLiveRunsRefresh } from '@/components/studio/runs/useLiveRunsRefresh';
import { RunStatusChip } from '@/components/studio/runs/RunStatusChip';
import { formatRunTime, runDurationText, shortRunId } from '@/components/studio/runs/runPresentation';
import { ExecutionProgressView } from '@/components/studio/run/ExecutionProgressView';
import { FailedStepSummary } from '@/components/studio/run/FailedStepSummary';
import { VideoEvidencePanel } from '@/components/studio/evidence/VideoEvidencePanel';
import { uiTestRunPath } from '@/components/studio/uiTestPaths';
import { toIsoDateTime } from '@/utils/time';

export const UI_TEST_LATEST_RUN_EMPTY_MESSAGE = 'No replays yet. Learning happens in Studio; run the test from there and its result appears here.';
// The same two sentences as the run drawer's in-progress notice (RunDetailsDrawer), kept local so the drawer stays untouched.
const WAITING_FOR_BROWSER_MESSAGE = 'Waiting for a browser. This view updates by itself.';
const BROWSER_RUNNING_MESSAGE = 'The browser is running this test. Steps update here as they finish.';
export const UI_TEST_LATEST_RUN_EARLIER_VERSION_MESSAGE =
  'This run used an earlier version of the test, not the one Studio last learned.';

export interface UiTestLatestRunCardProps {
  testId: string;
  /**
   * The revision the test currently runs (`confirmedRevisionId`). When the newest run's revision is a
   * different one, the card says so: that happens when the replay after a re-learn was refused, so the
   * newest run is still of the earlier version.
   */
  confirmedRevisionId?: string | null;
  /**
   * Called once per run, when this card sees that run go from not terminal to terminal (any terminal
   * status, a cancel included). Not called for a run the card first sees already terminal, on poll ticks,
   * or when the recording settles afterwards. The page shell uses it to re-read the test (header status).
   */
  onRunTerminal?: () => void;
}

/**
 * The "Latest run" card of the UI test detail page (STUDIO-UNIFY-001.7, AC-06..AC-08): the newest replay
 * of this test: status, time and duration, and, once it ended, why it failed and the recording (the steps
 * and logs are in the run details drawer; while it is live the steps show here). It reads its
 * own one-row page of the newest-first list (a list item is the full execution snapshot), so it stays the
 * newest replay while the Recent Runs table is on another page. It re-reads in the background until the
 * run is settled (`streamComplete`: terminal status and a recording that is no longer processing).
 *
 * The card is mounted by the page shell only after the test read succeeded, so it sends nothing before that.
 * It reads no test itself; `onRunTerminal` is how the shell learns that a watched run ended
 * (STUDIO-UNIFY-001.8, AC-03..AC-05).
 */
export const UiTestLatestRunCard: React.FC<UiTestLatestRunCardProps> = ({ testId, confirmedRevisionId = null, onRunTerminal }) => {
  const navigate = useNavigate();
  const { runs, loading, error, reload } = useStudioRuns({
    q: '',
    status: '',
    csiId: null,
    sort: DEFAULT_EXECUTION_SORT,
    testId,
    page: 1,
    pageSize: 1,
  });

  // Never a run of another test, whatever the list returned.
  const latest = runs.find((run) => run.testId === testId) ?? null;

  const backgroundRefresh = useCallback(() => reload({ silent: true }), [reload]);
  useLiveRunsRefresh({ active: latest !== null && !latest.streamComplete && error === null, refresh: backgroundRefresh });

  // Fire `onRunTerminal` on the live -> terminal transition of one run. The callback sits in a ref (the
  // pattern of `useLiveRunsRefresh`) so a new function identity never re-runs the effect; the id last seen
  // not terminal is the only state: a run first seen terminal never matches it, and clearing it on the call
  // makes the later `streamComplete` flip (same id, still terminal) a no-op.
  const onRunTerminalRef = useRef(onRunTerminal);
  onRunTerminalRef.current = onRunTerminal;
  const liveRunId = useRef<string | null>(null);
  const latestId = latest?.executionId ?? null;
  const latestStatus = latest?.status ?? null;
  useEffect(() => {
    if (latestId === null || latestStatus === null) return;
    if (!isTerminalExecutionStatus(latestStatus)) {
      liveRunId.current = latestId;
    } else if (liveRunId.current === latestId) {
      liveRunId.current = null;
      onRunTerminalRef.current?.();
    }
  }, [latestId, latestStatus]);

  const earlierVersion =
    latest !== null &&
    latest.revisionId !== null &&
    confirmedRevisionId !== null &&
    latest.revisionId !== confirmedRevisionId;
  const showInitialLoad = loading && latest === null && error === null;
  const terminal = latest !== null && isTerminalExecutionStatus(latest.status);

  return (
    <Card variant="outlined" data-testid="ui-test-latest-run">
      <CardHeader
        title="Latest run"
        // MUI pulls the action 8 px past the header's padding; keep it on the content edge, level with the title.
        sx={{ '& .MuiCardHeader-action': { m: 0, alignSelf: 'center' } }}
        action={
          latest !== null && error === null ? (
            <Button
              size="small"
              variant="outlined"
              data-testid="ui-test-latest-run-open"
              onClick={() => navigate(uiTestRunPath(testId, latest.executionId))}
            >
              View details
            </Button>
          ) : undefined
        }
      />
      <CardContent sx={{ minWidth: 0 }}>
        {error !== null && (
          <Alert
            severity="error"
            data-testid="ui-test-latest-run-error"
            action={<Button color="inherit" size="small" onClick={() => { void reload(); }}>Retry</Button>}
          >
            {error}
          </Alert>
        )}

        {showInitialLoad && <LinearProgress data-testid="ui-test-latest-run-loading" />}

        {error === null && !showInitialLoad && latest === null && (
          <Typography variant="body2" color="text.secondary" data-testid="ui-test-latest-run-empty">
            {UI_TEST_LATEST_RUN_EMPTY_MESSAGE}
          </Typography>
        )}

        {error === null && latest !== null && (
          <Stack spacing={2.5}>
            <Stack
              direction="row"
              spacing={1.5}
              useFlexGap
              flexWrap="wrap"
              alignItems="center"
              data-testid="ui-test-latest-run-meta"
            >
              <RunStatusChip status={latest.status} errorCode={latest.errorCode} data-testid="ui-test-latest-run-status" />
              <Typography variant="body2" component="span">
                <Box component="time" dateTime={toIsoDateTime(latest.acceptedAt)} data-testid="ui-test-latest-run-time">
                  {formatRunTime(latest.acceptedAt)}
                </Box>
              </Typography>
              <Typography variant="body2" component="span" color="text.secondary">·</Typography>
              <Typography variant="body2" component="span" data-testid="ui-test-latest-run-duration">
                {runDurationText(latest)}
              </Typography>
              <Typography variant="body2" component="span" color="text.secondary">·</Typography>
              <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace' }} data-testid="ui-test-latest-run-id">
                #{shortRunId(latest.executionId)}
              </Typography>
            </Stack>

            {earlierVersion && (
              <Typography variant="body2" color="text.secondary" data-testid="ui-test-latest-run-earlier-version">
                {UI_TEST_LATEST_RUN_EARLIER_VERSION_MESSAGE}
              </Typography>
            )}

            {!terminal && (
              <Alert severity="info" variant="outlined" data-testid="ui-test-latest-run-in-progress">
                {latest.status === 'PENDING' ? WAITING_FOR_BROWSER_MESSAGE : BROWSER_RUNNING_MESSAGE}
              </Alert>
            )}

            {terminal ? (
              <>
                {/* Once the run has ended the card is a summary: the steps and logs are in the run's drawer. */}
                <FailedStepSummary snapshot={latest} />
                <ExecutionProgressView snapshot={latest} showStatus={false} showSteps={false} showLogs={false} />
                <VideoEvidencePanel snapshot={latest} compact />
              </>
            ) : (
              // Live: the steps still update here as they finish.
              <ExecutionProgressView snapshot={latest} showStatus={false} showLogs={false} />
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export default UiTestLatestRunCard;

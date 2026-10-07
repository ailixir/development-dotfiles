import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  Link,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Close,
  ExpandLess,
  ExpandMore,
  KeyboardArrowDown,
  KeyboardArrowUp,
  Link as LinkIcon,
  Terminal,
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import studioApi from '@/services/api/studioApi';
import {
  subscribeToExecution,
  type TransportPhase,
} from '@/services/api/studioTransportWiring';
import { isTerminalExecutionStatus, type ExecutionLogEntry, type ExecutionSnapshot } from '@/types/studio/studioTypes';
import { ExecutionProgressView, LOGS_TRUNCATED_STATEMENT } from '@/components/studio/run/ExecutionProgressView';
import { VideoEvidencePanel } from '@/components/studio/evidence/VideoEvidencePanel';
import { useVideoSeek } from '@/components/studio/evidence/useVideoSeek';
import { formatAbsoluteTime, formatDuration, formatRelativeTime, toIsoDateTime } from '@/utils/time';
import { RunStatusChip } from './RunStatusChip';
import { newerSnapshot } from './runSnapshots';
import { runDurationText, runQueueWaitMs, runTestLabel, shortRunId } from './runPresentation';

export const RUN_NOT_FOUND_MESSAGE =
  'This run was not found. It may have been removed, or you may not have access to it.';
export const RUN_LOAD_ERROR_MESSAGE = 'Run details could not be loaded. Please try again.';
export const RUN_LIVE_LABEL = 'Live';

export interface RunDetailsDrawerProps {
  /** The run in the URL, or null when the drawer is closed. */
  executionId: string | null;
  /** The list's current page; used for the first paint and for Prev/Next. */
  pageRuns: readonly ExecutionSnapshot[];
  onClose: () => void;
  /** Opens another run of the current page (Prev/Next). */
  onNavigateRun: (executionId: string) => void;
  onCopyLink: (executionId: string) => void;
  /** The Studio editor URL for a test. */
  testHref: (testId: string) => string;
  /** Live snapshots flow back to the list row. */
  onSnapshot?: (snapshot: ExecutionSnapshot) => void;
}

type LoadState = 'idle' | 'loading' | 'not-found' | 'error';

function httpStatusOf(failure: unknown): number | undefined {
  return (failure as { response?: { status?: number } } | null)?.response?.status;
}

const LOG_LEVEL_COLOR: Record<ExecutionLogEntry['level'], string> = {
  DEBUG: 'grey.500',
  INFO: 'info.light',
  WARN: 'warning.light',
  ERROR: 'error.light',
};

function logTime(at: string | null): string {
  if (!at) return '';
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? at : parsed.toISOString().slice(11, 23);
}

function RunLogs({ snapshot }: { snapshot: ExecutionSnapshot }) {
  const [open, setOpen] = useState(false);
  if (snapshot.logs.length === 0 && !snapshot.logsTruncated) return null;
  return (
    <Box>
      <Button
        size="small"
        startIcon={<Terminal fontSize="small" />}
        endIcon={open ? <ExpandLess /> : <ExpandMore />}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide logs' : `Show logs (${snapshot.logs.length})`}
      </Button>
      <Collapse in={open} unmountOnExit>
        {snapshot.logsTruncated && (
          <Typography variant="caption" color="warning.main" data-testid="logs-truncated-statement" sx={{ display: 'block', my: 0.5 }}>
            {LOGS_TRUNCATED_STATEMENT}
          </Typography>
        )}
        <Box
          data-testid="run-logs"
          sx={{
            mt: 1,
            p: 1.5,
            borderRadius: 1,
            bgcolor: 'grey.900',
            color: 'grey.100',
            fontFamily: '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace',
            fontSize: 12,
            lineHeight: 1.6,
            maxHeight: 320,
            overflow: 'auto',
          }}
        >
          {snapshot.logs.map((entry, index) => (
            <Box key={`${entry.at ?? 'na'}-${index}`} data-testid={`run-log-line-${index}`} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              <Box component="span" sx={{ color: 'grey.500' }}>{logTime(entry.at)}</Box>
              {entry.at ? ' ' : ''}
              <Box component="span" sx={{ color: LOG_LEVEL_COLOR[entry.level] ?? 'grey.300', fontWeight: 700 }}>
                {entry.level.padEnd(5)}
              </Box>{' '}
              {entry.message}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

/** A `FAILED` run carries no error code; its narrative is the first failing step (§8.2). */
function FailedStepSummary({ snapshot }: { snapshot: ExecutionSnapshot }) {
  if (snapshot.status !== 'FAILED' || snapshot.errorCode !== null) return null;
  const failed = snapshot.stepResults.find((step) => step.status === 'FAIL');
  if (!failed) return null;
  return (
    <Alert severity="error" variant="outlined" data-testid="run-failed-step">
      <AlertTitle>Failed at step {failed.stepIndex + 1}</AlertTitle>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{failed.originalText}</Typography>
      {failed.message && <Typography variant="body2" sx={{ mt: 0.5 }}>{failed.message}</Typography>}
    </Alert>
  );
}

interface RunDetailsContentProps extends Omit<RunDetailsDrawerProps, 'executionId'> {
  executionId: string;
}

function RunDetailsContent({
  executionId,
  pageRuns,
  onClose,
  onNavigateRun,
  onCopyLink,
  testHref,
  onSnapshot,
}: RunDetailsContentProps) {
  const listRun = pageRuns.find((run) => run.executionId === executionId) ?? null;
  const [fetched, setFetched] = useState<ExecutionSnapshot | null>(null);
  const [live, setLive] = useState<ExecutionSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [attempt, setAttempt] = useState(0);
  const [follow, setFollow] = useState(false);
  const [phase, setPhase] = useState<TransportPhase | null>(null);
  const { videoRef, seekToOffset } = useVideoSeek();

  const snapshot = newerSnapshot(newerSnapshot(listRun, fetched), live);
  const hasListRun = listRun !== null;

  // Off-page (deep link, other page, filtered out): read the run itself.
  useEffect(() => {
    if (hasListRun || fetched !== null) return undefined;
    let cancelled = false;
    setLoadState('loading');
    studioApi
      .getExecution(executionId)
      .then((result) => {
        if (cancelled) return;
        setFetched(result);
        setLoadState('idle');
      })
      .catch((failure: unknown) => {
        if (cancelled) return;
        // The backend answers 403 for runs outside the caller's scope, including unknown ids, so it
        // must not reveal which ids exist; both read as "not found" here.
        const status = httpStatusOf(failure);
        setLoadState(status === 404 || status === 403 ? 'not-found' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [executionId, hasListRun, fetched, attempt]);

  // Follow a run that is still moving. Once started, the subscription runs until the transport
  // closes it (`streamComplete`, after evidence settles) or the drawer closes or changes run.
  const moving = snapshot !== null && !isTerminalExecutionStatus(snapshot.status);
  useEffect(() => {
    if (moving) setFollow(true);
  }, [moving]);

  const onSnapshotRef = useCallbackRef(onSnapshot);
  useEffect(() => {
    if (!follow) return undefined;
    const subscription = subscribeToExecution(executionId, {
      onSnapshot: (next) => {
        setLive((current) => newerSnapshot(current, next));
        onSnapshotRef(next);
      },
      onStatus: (status) => setPhase(status.phase),
    });
    return () => subscription.close();
  }, [executionId, follow, onSnapshotRef]);

  const index = pageRuns.findIndex((run) => run.executionId === executionId);
  const previous = index > 0 ? pageRuns[index - 1] : null;
  const next = index >= 0 && index < pageRuns.length - 1 ? pageRuns[index + 1] : null;
  const name = snapshot ? runTestLabel(snapshot) : null;
  const terminal = snapshot !== null && isTerminalExecutionStatus(snapshot.status);
  const canSeek = snapshot !== null && terminal && snapshot.video.status === 'AVAILABLE' && snapshot.videoPath !== null;
  const queueWait = snapshot ? runQueueWaitMs(snapshot) : null;
  const showLive = follow && phase !== null && phase !== 'closed';
  // A run that could not be loaded has nothing coming: no header placeholders then.
  const loadFailed = !snapshot && (loadState === 'not-found' || loadState === 'error');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }} data-testid="run-details" data-execution-id={executionId}>
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          px: { xs: 2, sm: 3 },
          pt: 2,
          pb: 1.5,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            {snapshot ? (
              <RunStatusChip status={snapshot.status} errorCode={snapshot.errorCode} data-testid="run-details-status" />
            ) : (
              !loadFailed && <Skeleton variant="rounded" width={88} height={24} />
            )}
            {showLive && (
              <Chip
                size="small"
                color="info"
                label={RUN_LIVE_LABEL}
                data-testid="run-details-live"
                icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'info.main', ml: '8px !important', animation: 'runLivePulse 1.6s ease-in-out infinite', '@keyframes runLivePulse': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />}
                variant="outlined"
              />
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
            <Tooltip title="Previous run on this page">
              <span>
                <IconButton size="small" aria-label="Previous run" disabled={!previous} onClick={() => previous && onNavigateRun(previous.executionId)}>
                  <KeyboardArrowUp fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Next run on this page">
              <span>
                <IconButton size="small" aria-label="Next run" disabled={!next} onClick={() => next && onNavigateRun(next.executionId)}>
                  <KeyboardArrowDown fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Copy link">
              <IconButton size="small" aria-label="Copy link" onClick={() => onCopyLink(executionId)}>
                <LinkIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="Close">
              <IconButton size="small" aria-label="Close" onClick={onClose}>
                <Close fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Box sx={{ mt: 1.25 }}>
          {snapshot && name ? (
            name.deleted ? (
              <Typography variant="h6" component="h2" color="text.secondary" sx={{ fontStyle: 'italic' }} data-testid="run-details-title">
                {name.text}
              </Typography>
            ) : (
              <Typography variant="h6" component="h2" data-testid="run-details-title" sx={{ overflowWrap: 'anywhere' }}>
                <Link component={RouterLink} to={testHref(snapshot.testId)} underline="hover" color="inherit">
                  {name.text}
                </Link>
              </Typography>
            )
          ) : (
            !loadFailed && <Skeleton variant="text" width="60%" sx={{ fontSize: '1.25rem' }} />
          )}
          {snapshot && (
            <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.5, color: 'text.secondary' }}>
              <Typography variant="body2" component="span">
                Requested{' '}
                <Tooltip title={formatAbsoluteTime(snapshot.acceptedAt)} describeChild>
                  <Box component="time" dateTime={toIsoDateTime(snapshot.acceptedAt)} data-testid="run-details-requested">
                    {formatRelativeTime(snapshot.acceptedAt)}
                  </Box>
                </Tooltip>
              </Typography>
              <Typography variant="body2" component="span" data-testid="run-details-duration">
                Duration {runDurationText(snapshot)}
                {queueWait !== null ? ` · queued ${formatDuration(queueWait)}` : ''}
              </Typography>
              {snapshot.csiId && <Typography variant="body2" component="span">CSI {snapshot.csiId}</Typography>}
              <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace' }}>#{shortRunId(executionId)}</Typography>
              <Typography variant="body2" component="span">Origin: {snapshot.triggerSource === 'SCHEDULED' ? 'Scheduled' : snapshot.triggerSource === 'MANUAL' ? 'Manual' : 'Unknown'}</Typography>
            </Stack>
          )}
        </Box>
      </Box>

      <Stack spacing={2.5} sx={{ px: { xs: 2, sm: 3 }, py: 2.5, flex: 1 }}>
        {!snapshot && loadState === 'not-found' && (
          <Alert severity="warning" data-testid="run-details-not-found" action={<Button color="inherit" size="small" onClick={onClose}>Back to runs</Button>}>
            <AlertTitle>Run not found</AlertTitle>
            {RUN_NOT_FOUND_MESSAGE}
          </Alert>
        )}
        {!snapshot && loadState === 'error' && (
          <Alert
            severity="error"
            data-testid="run-details-error"
            action={<Button color="inherit" size="small" onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}
          >
            {RUN_LOAD_ERROR_MESSAGE}
          </Alert>
        )}
        {!snapshot && (loadState === 'loading' || loadState === 'idle') && (
          <Stack spacing={1.5} data-testid="run-details-loading">
            <Skeleton variant="rounded" height={56} />
            {Array.from({ length: 4 }, (_, row) => <Skeleton key={row} variant="text" width={`${85 - row * 10}%`} />)}
            <Skeleton variant="rounded" height={200} />
          </Stack>
        )}

        {snapshot && (
          <>
            {snapshot.triggerSource === 'SCHEDULED' && <Box data-testid="run-schedule-provenance">
              <Typography variant="subtitle2" component="h3">Scheduled execution</Typography>
              <Typography variant="body2">Scheduled due: {formatAbsoluteTime(snapshot.scheduledAt ?? null)}</Typography>
              <Typography variant="body2">Schedule {snapshot.scheduleId} · version {snapshot.scheduleVersion} · occurrence {snapshot.occurrenceId}</Typography>
              <Typography variant="body2">Confirmed revision: {snapshot.revisionId ?? 'Unavailable'}</Typography>
              <Typography variant="body2">Activated by {snapshot.activatedBy ?? 'Unknown'} at {formatAbsoluteTime(snapshot.activatedAt ?? null)}</Typography>
              <Typography variant="caption">Activation {snapshot.activationId ?? 'Unknown'}. Scheduled due, request acceptance and browser start are separate instants.</Typography>
            </Box>}
            <FailedStepSummary snapshot={snapshot} />
            {!terminal && (
              <Alert severity="info" variant="outlined" data-testid="run-details-in-progress">
                {snapshot.status === 'PENDING'
                  ? 'Waiting for a browser. This view updates by itself.'
                  : 'The browser is running this test. Steps update here as they finish.'}
              </Alert>
            )}
            <ExecutionProgressView snapshot={snapshot} showLogs={false} onSeekStep={canSeek ? seekToOffset : undefined} />
            {terminal && <VideoEvidencePanel ref={videoRef} snapshot={snapshot} />}
            <RunLogs snapshot={snapshot} />
          </>
        )}
      </Stack>
    </Box>
  );
}

/** A stable function that always calls the latest `callback`. */
function useCallbackRef<T extends unknown[]>(callback: ((...args: T) => void) | undefined): (...args: T) => void {
  const holder = useRef(callback);
  useEffect(() => {
    holder.current = callback;
  }, [callback]);
  return useCallback((...args: T) => holder.current?.(...args), []);
}

/**
 * Run details in a right-hand drawer driven by the URL (story 10.46, AC-3): linkable, live while
 * the run moves, and with Prev/Next through the list's current page.
 */
export function RunDetailsDrawer(props: RunDetailsDrawerProps) {
  const { executionId, onClose } = props;
  // Keep the last run on screen while the drawer slides out.
  const [shownId, setShownId] = useState<string | null>(executionId);
  useEffect(() => {
    if (executionId !== null) setShownId(executionId);
  }, [executionId]);
  const contentId = executionId ?? shownId;

  return (
    <Drawer
      anchor="right"
      open={executionId !== null}
      onClose={onClose}
      SlideProps={{ onExited: () => setShownId(null) }}
      PaperProps={{ sx: { width: { xs: '100%', sm: 640 }, maxWidth: '100%' }, 'data-testid': 'run-details-drawer' } as object}
    >
      {contentId !== null && <RunDetailsContent key={contentId} {...props} executionId={contentId} />}
    </Drawer>
  );
}

export default RunDetailsDrawer;

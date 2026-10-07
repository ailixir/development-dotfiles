import React, { useEffect, useMemo, useState } from 'react';
import { Alert, AlertTitle, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import studioApi from '@/services/api/studioApi';
import type { TestDto } from '@/types/studio/studioTypes';
import { artifactDivergence } from './review/artifactSummary';
import { compileErrorNarrative } from './review/compileErrorCodes';

/**
 * The Code view renders only the runnable artifact prepared from the saved test. Current editor
 * text and the retired client-side generator are never used as substitutes.
 *
 * ## What "complete" means here
 *
 * There is no standalone script to show, and inventing one would be a lie. An artifact step is a
 * single awaited call in Studio's bounded step language; the runner parses each one into a typed
 * operation and its child process refuses any message carrying source text at all. `page`,
 * `expect` and `vars` are bindings the runner supplies, and the output contract forbids imports,
 * declarations and comments. So the honest maximum is *every* step, index-aligned, each shown
 * beside the English it was translated from, under the identity of the one revision it came from —
 * not a fabricated `import`/`test(...)` wrapper, which would be client-generated source the server
 * never produced and never ran (ADR-002; story 10.11a retired exactly that).
 *
 * Rendering the `code` strings joined by newlines, as this tab used to, produced N bare `await`
 * lines with no numbering, no English and no revision identity — which reads as a fragment of a
 * file someone forgot to finish.
 */

/** The accessible name of the unavailable state. Asserted by AC-3(a). */
export const CODE_VIEW_UNAVAILABLE_TITLE = 'Source is not available yet';

/** Honest empty state for drafts that have never had a confirmed artifact. */
export const CODE_VIEW_BLOCKER = 'Press Run to prepare this test, and the source will appear here.';

export const CODE_VIEW_WHY_NOT_THE_CANDIDATE =
  'This tab shows only the source that the saved test will run.';

export const CODE_VIEW_WHAT_IS_TRUE =
  'Run prepares the browser instructions from your saved checklist.';

/**
 * What the reader is looking at, so a bounded step list is not misread as a truncated file.
 * Asserted by AC-3(a): the tab must not claim to be a runnable script.
 */
export const CODE_VIEW_LANGUAGE_NOTE =
  'Each line below is one instruction in Studio\u2019s step language. This is exactly what ' +
  'runs, not a file you can run elsewhere. The browser, the checks and your saved values are ' +
  'supplied by Studio when the test runs.';

/** Shown when the draft has moved on and the rendered source is the last confirmed revision. */
export const CODE_VIEW_PREVIOUSLY_CONFIRMED =
  'Previously confirmed source. Current changes must be prepared and confirmed before they can run.';

export interface ConfirmedSourceProps {
  /** The single-test detail read. List projections carry no artifact and render the unavailable state. */
  readonly test: TestDto | null;
  readonly loading?: boolean;
  readonly error?: string | null;
}

/**
 * Renders only the independently read confirmed pair (revision id, artifact, canonical hash) —
 * never the current candidate and never the editable draft (ADR-002 §21).
 */
export const ConfirmedSource: React.FC<ConfirmedSourceProps> = ({
  test,
  loading = false,
  error = null,
}) => {
  /** The confirmed revision's steps, in artifact order. Never the draft's English. */
  const steps = useMemo(
    () => (test?.confirmedRevisionArtifact?.steps ?? null),
    [test],
  );

  /** Said plainly when the draft has moved on since this revision was translated. */
  const divergence = useMemo(
    () =>
      test ? artifactDivergence(test.confirmedRevisionArtifact, test.steps ?? []) : null,
    [test],
  );

  /** Why there is no newer revision, when the last attempt to make one did not produce it. */
  const staleness = useMemo(() => {
    if (!test) return null;
    if (test.compileStatus === 'NEEDS_REVISION') {
      return 'The last attempt to prepare this test was refused. Check the steps flagged on the Steps tab, then run again.';
    }
    if (test.compileStatus === 'STALE' && test.compileError) {
      return compileErrorNarrative(test.compileError.code);
    }
    return null;
  }, [test]);

  const readableHash =
    typeof test?.confirmedRevisionArtifactHash === 'string' &&
    /^[0-9a-f]{64}$/u.test(test.confirmedRevisionArtifactHash);

  /** Eight characters is enough to tell two revisions apart; the full hash is never rendered. */
  const revisionLabel = useMemo(() => {
    const hash = test?.confirmedRevisionArtifactHash;
    return hash ? hash.slice(0, 8) : null;
  }, [test]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Saved test source
        </Typography>
      </Stack>
      <Paper variant="outlined" sx={{ p: 0 }}>
        {loading ? (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 2 }} role="status">
            <CircularProgress size={18} />
            <Typography variant="body2">Loading saved source…</Typography>
          </Stack>
        ) : error ? (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        ) : steps &&
          steps.length > 0 &&
          test?.confirmedRevisionId &&
          readableHash ? (
          <Stack spacing={1.5} sx={{ p: 2 }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="baseline"
              justifyContent="space-between"
              flexWrap="wrap"
            >
              <Typography variant="body2" data-testid="code-view-step-count">
                {steps.length === 1 ? '1 step' : `${steps.length} steps`}
              </Typography>
              {revisionLabel && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  data-testid="code-view-revision"
                  sx={{ fontFamily: 'monospace' }}
                >
                  {`revision ${revisionLabel}`}
                </Typography>
              )}
            </Stack>

            <Typography variant="caption" color="text.secondary" data-testid="code-view-language-note">
              {CODE_VIEW_LANGUAGE_NOTE}
            </Typography>

            {divergence && (
              <Alert severity="warning" role="status" data-testid="code-view-divergence">
                {divergence}
              </Alert>
            )}

            {test.compileStatus !== 'READY' && test.compileStatus !== 'COMPILING' && (
              <Alert severity="info" role="status" data-testid="code-view-previously-confirmed">
                {CODE_VIEW_PREVIOUSLY_CONFIRMED}
              </Alert>
            )}

            {staleness && (
              <Alert severity="warning" role="status" data-testid="code-view-staleness">
                {staleness}
              </Alert>
            )}

            <Stack spacing={1} data-testid="confirmed-playwright-source">
              {steps.map((step, index) => (
                <Stack key={`${step.stepIndex}-${index}`} spacing={0.25}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    data-testid="code-view-step-text"
                  >
                    {`${index + 1}. ${step.originalText}`}
                  </Typography>
                  <Box
                    component="pre"
                    data-testid="code-view-step-code"
                    sx={{
                      m: 0,
                      p: 1.5,
                      overflow: 'auto',
                      bgcolor: 'grey.900',
                      color: 'grey.100',
                      borderRadius: 1,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                    }}
                  >
                    {step.code}
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Stack>
        ) : (
          <Alert severity="info" role="note" aria-label={CODE_VIEW_UNAVAILABLE_TITLE}>
            <AlertTitle data-testid="code-view-unavailable-title">
              {CODE_VIEW_UNAVAILABLE_TITLE}
            </AlertTitle>
            <Stack spacing={1}>
              <Typography variant="body2" data-testid="code-view-what-is-true">
                {CODE_VIEW_WHAT_IS_TRUE}
              </Typography>
              <Typography variant="body2" data-testid="code-view-blocker">
                {CODE_VIEW_BLOCKER}
              </Typography>
              <Typography variant="body2" data-testid="code-view-why-not-candidate">
                {CODE_VIEW_WHY_NOT_THE_CANDIDATE}
              </Typography>
            </Stack>
          </Alert>
        )}
      </Paper>
    </Box>
  );
};

export interface CodeTabProps {
  readonly testId?: string | null;
  /** Fetch only when the tab is visible; toggling false → true refreshes after compile/run. */
  readonly active?: boolean;
  /** Changes when the same test may have acquired a new confirmed revision. */
  readonly refreshToken?: string | number;
}

const CodeTab: React.FC<CodeTabProps> = ({ testId = null, active = true, refreshToken }) => {
  const [test, setTest] = useState<TestDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    if (!testId) {
      setTest(null);
      setLoading(false);
      setError(null);
      return () => {
        current = false;
      };
    }
    if (!active) {
      return () => {
        current = false;
      };
    }
    setLoading(true);
    setTest(null);
    setError(null);
    const load = async () => {
      try {
        const body = await studioApi.getTest(testId);
        if (!current) return;
        setTest(body);
        setLoading(false);
        if (body.compileStatus === 'COMPILING') {
          pollTimer = setTimeout(() => void load(), 600);
        }
      } catch (reason: unknown) {
        if (!current) return;
        setTest(null);
        setLoading(false);
        setError((reason as { message?: string })?.message ?? 'The saved source could not be loaded.');
      }
    };
    void load();
    return () => {
      current = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [active, refreshToken, testId]);

  return (
    <ConfirmedSource test={test?.id === testId ? test : null} loading={loading} error={error} />
  );
};

export default CodeTab;

import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Box, Paper, Stack, Typography } from '@mui/material';
import studioApi from '@/services/api/studioApi';
import type { TestDto } from '@/types/studio/studioTypes';

export const CODE_VIEW_UNAVAILABLE_TITLE = 'The source that will run is not available to this page';
export const CODE_VIEW_BLOCKER = 'This response does not include a readable confirmed revision artifact and hash. ADR-002 §21 separates candidate source from confirmed source; select or reload a test with a retained confirmed revision.';
export const CODE_VIEW_WHY_NOT_THE_CANDIDATE = 'Substituting the current candidate is refused: it can disagree with the confirmed revision and would show different source.';
export const CODE_VIEW_WHAT_IS_TRUE = 'The server runs the artifact you confirmed. Current edits need their own compilation and confirmation before they can run.';

/** Display only the independently read confirmed pair, never the candidate or a client generator. */
export function ConfirmedSource({ test }: { test: TestDto | null }) {
  const readable = test?.confirmedRevisionId && test.confirmedRevisionArtifact &&
    typeof test.confirmedRevisionArtifactHash === 'string' && /^[0-9a-f]{64}$/.test(test.confirmedRevisionArtifactHash);
  return <Box>
    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>Source</Typography>
    <Paper variant="outlined" sx={{ p: 2 }}>
      {readable ? <Stack spacing={2}>
        <Typography>Confirmed revision: {test.confirmedRevisionId}</Typography>
        {test.compileStatus !== 'READY' && <Alert severity="info">Previously confirmed source. Current changes must be compiled and confirmed before running.</Alert>}
        {test.confirmedRevisionArtifact!.steps.map(step => <Box key={step.stepIndex}>
          <Typography>Step {step.stepIndex + 1}: {step.originalText}</Typography>
          <Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{step.code}</Box>
        </Box>)}
      </Stack> : <Alert severity="info" role="note" aria-label={CODE_VIEW_UNAVAILABLE_TITLE}>
        <AlertTitle data-testid="code-view-unavailable-title">{CODE_VIEW_UNAVAILABLE_TITLE}</AlertTitle>
        <Stack spacing={1}>
          <Typography variant="body2" data-testid="code-view-what-is-true">{CODE_VIEW_WHAT_IS_TRUE}</Typography>
          <Typography variant="body2" data-testid="code-view-blocker">{CODE_VIEW_BLOCKER}</Typography>
          <Typography variant="body2" data-testid="code-view-why-not-candidate">{CODE_VIEW_WHY_NOT_THE_CANDIDATE}</Typography>
        </Stack>
      </Alert>}
    </Paper>
  </Box>;
}

export default function CodeTab({ testId = null, snapshot }: { testId?: string | null; snapshot?: TestDto | null } = {}) {
  const [loaded, setLoaded] = useState<{ id: string; test: TestDto } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false);
    if (snapshot === undefined && testId) void studioApi.getTest(testId).then(test => {
      if (active) setLoaded({ id: testId, test });
    }).catch(() => { if (active) { setLoaded(null); setError(true); } });
    return () => { active = false; };
  }, [testId, snapshot]);
  return <>
    {error && <Alert severity="error">Confirmed source could not be loaded. Reopen this tab to retry.</Alert>}
    <ConfirmedSource test={snapshot !== undefined ? snapshot : loaded?.id === testId ? loaded.test : null}/>
  </>;
}

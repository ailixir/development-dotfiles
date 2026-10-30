import React, { useCallback, useMemo } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { StudioUnavailable, TestNotAvailable } from '@/components/studio/StudioUnavailable';
import { useUiTestAvailability } from '@/hooks/useUiTestAvailability';
import { useUiTestSchedule } from '@/hooks/useUiTestSchedule';
import { UiTestDetailHeader } from './UiTestDetailHeader';
import { UiTestOverviewCard } from './UiTestOverviewCard';
import { UiTestRecentRunsCard } from './UiTestRecentRunsCard';
import { UiTestLatestRunCard } from './UiTestLatestRunCard';
import { useUiTestDetail, type UiTestDetailContext } from './useUiTestDetail';

/**
 * The UI test detail page (spec §8.1, §10; .2 AC-23, AC-24; STUDIO-UNIFY-001.7). It is the route element of
 * `ui-tests/:id` and of `ui-tests/:id/runs/:executionId` (the run drawer over this same page), laid out like
 * a check's detail page: a header card, then two columns from 1200 px (Overview and Recent Runs on the left,
 * Latest run on the right) that stack below it.
 *
 * What it shows, in order:
 * - availability 'off': the feature-unavailable state, and nothing is requested;
 * - availability 'pending': a loading state, and nothing is requested;
 * - availability 'on': `GET /studio/tests/{id}`, then
 *     403 or 400  -> only the shared not-available state (no other text from the test, no `/checks/{id}` call),
 *     other error -> a load error with Retry,
 *     success     -> the header and the three cards.
 *
 * Until the read succeeds nothing of the test, its runs or the run drawer is rendered, because the header and
 * the cards (the Recent Runs card owns the drawer) are mounted only in the success branch. The contract for
 * the parts mounted inside is documented on `UiTestDetailContext` in `./useUiTestDetail`.
 */

const centered = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '50vh',
  textAlign: 'center',
  p: 4,
  gap: 2,
} as const;

const UiTestDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const availability = useUiTestAvailability();
  const { state, retry, refresh } = useUiTestDetail(id, availability === 'on');
  // One test re-read when the Latest run card sees a watched run end (the header follows it).
  const refreshAfterRun = useCallback(() => {
    void refresh();
  }, [refresh]);

  const { schedule, reload: reloadSchedule } = useUiTestSchedule(availability === 'on' ? id : undefined);

  const readTest = state.status === 'ready' ? state.test : null;
  const context = useMemo<UiTestDetailContext | null>(
    () => (readTest && id ? { testId: id, test: readTest, refresh, reloadSchedule } : null),
    [id, readTest, refresh, reloadSchedule],
  );

  if (availability === 'off') return <StudioUnavailable />;

  if (availability === 'pending' || state.status === 'loading') {
    return (
      <Box sx={centered} data-testid="ui-test-detail-loading">
        <CircularProgress size={28} />
        <Typography variant="body2" color="text.secondary">Loading UI test…</Typography>
      </Box>
    );
  }

  if (!id || state.status === 'unavailable') {
    return <TestNotAvailable testId="ui-test-detail-unavailable" />;
  }

  if (state.status === 'error') {
    return (
      <Box sx={centered} data-testid="ui-test-detail-error">
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={retry}>Retry</Button>}>
          Failed to load this UI test.
        </Alert>
      </Box>
    );
  }

  // state.status === 'ready': the only branch that renders anything from the test.
  if (!context) return null;

  return (
    // No padding of its own: the layout's gutter already insets the page, as on every other page.
    <Box data-testid="ui-test-detail">
      <UiTestDetailHeader {...context} />

      <Box
        data-testid="ui-test-detail-grid"
        sx={{
          display: 'grid',
          gap: 3,
          // Two columns (5:7) from `lg`, where the sidebar leaves room for the runs table; `minmax(0, ...)`
          // so a wide table can never widen its column.
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 5fr) minmax(0, 7fr)' },
          alignItems: 'start',
        }}
      >
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          <UiTestOverviewCard test={context.test} schedule={schedule} />
          <UiTestRecentRunsCard testId={context.testId} />
        </Stack>
        <Box sx={{ minWidth: 0 }}>
          <UiTestLatestRunCard
            testId={context.testId}
            confirmedRevisionId={context.test.confirmedRevisionId}
            onRunTerminal={refreshAfterRun}
          />
        </Box>
      </Box>
    </Box>
  );
};

export default UiTestDetailsPage;

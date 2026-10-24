import React, { useMemo } from 'react';
import { Alert, Box, Button, CircularProgress, Tab, Tabs, Typography } from '@mui/material';
import { Link as RouterLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { StudioUnavailable, TestNotAvailable } from '@/components/studio/StudioUnavailable';
import { useUiTestAvailability } from '@/hooks/useUiTestAvailability';
import { uiTestPath, uiTestRunsPath } from '@/components/studio/uiTestPaths';
import { UiTestDetailHeader } from './UiTestDetailHeader';
import { uiTestDetailTab, useUiTestDetail, type UiTestDetailContext } from './useUiTestDetail';

/**
 * The UI test detail page shell (spec §8.1, §10; AC-23, AC-24). It is the layout route of
 * `ui-tests/:id`, with children:
 *
 *   index                   -> UiTestOverviewTab   (task 2.7)
 *   runs                    -> UiTestRunsTab       (task 2.8)
 *   runs/:executionId       -> UiTestRunsTab       (task 2.8)
 *
 * What it shows, in order:
 * - availability 'off': the feature-unavailable state, and nothing is requested;
 * - availability 'pending': a loading state, and nothing is requested;
 * - availability 'on': `GET /studio/tests/{id}`, then
 *     403 or 400  -> only the shared not-available state (no other text from the test, no `/checks/{id}` call),
 *     other error -> a load error with Retry,
 *     success     -> header, tabs and the tab content.
 *
 * Until the read succeeds nothing of the test, its runs or the run drawer is rendered, because the
 * header, the tab strip and the Outlet are mounted only in the success branch. The shell owns the tab
 * selection (from the route); the tabs only render content. The contract for the parts mounted inside
 * is documented on `UiTestDetailContext` in `./useUiTestDetail`.
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
  const { pathname } = useLocation();
  const availability = useUiTestAvailability();
  const { state, retry, refresh } = useUiTestDetail(id, availability === 'on');

  const readTest = state.status === 'ready' ? state.test : null;
  const context = useMemo<UiTestDetailContext | null>(
    () => (readTest && id ? { testId: id, test: readTest, refresh } : null),
    [id, readTest, refresh],
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
  const tab = uiTestDetailTab(pathname);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }} data-testid="ui-test-detail">
      <UiTestDetailHeader {...context} />

      <Tabs value={tab} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tab label="Overview" value="overview" component={RouterLink} to={uiTestPath(context.testId)} />
        <Tab label="Runs" value="runs" component={RouterLink} to={uiTestRunsPath(context.testId)} />
      </Tabs>

      {/*
        SLOTS 2.7 and 2.8 (tab content). The matched child route renders here and reads the context with
        `useUiTestDetailContext()`.
      */}
      <Outlet context={context} />
    </Box>
  );
};

export default UiTestDetailsPage;

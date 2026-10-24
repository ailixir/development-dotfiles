import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

/**
 * The feature-unavailable state shared by the editor and the UI test detail routes (spec §8.1, §10,
 * DC-18): shown when the Studio feature or the UI_TEST source is off. Text and DOM are the editor's
 * original wording.
 */
export const StudioUnavailable: React.FC = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', p: 4 }}>
    <Typography variant="h5" gutterBottom>Checks Studio</Typography>
    <Typography variant="body1" color="text.secondary">Checks Studio is not available in this environment.</Typography>
  </Box>
);

/** The message for a route id the caller cannot read, or that is not a test (FR-25: 403 and 400 read the same). */
export const TEST_NOT_AVAILABLE_MESSAGE = "This UI test doesn't exist or you don't have access";

/** Where the not-available state sends the user: the catalog that lists UI tests. */
const ALL_CHECKS_PATH = '/checks/all';

interface TestNotAvailableProps {
  /** The root `data-testid`, so each screen keeps its own: the detail page and the editor differ. */
  testId: string;
}

/**
 * The one not-available state for a UI test the caller cannot read (STUDIO-UNIFY-001.5, AC-02 and AC-08):
 * a heading, the unchanged message, and a way back to All Checks. The detail page and the editor render
 * this same component, so the two screens cannot drift. It shows nothing from the test and sends no request.
 */
export const TestNotAvailable: React.FC<TestNotAvailableProps> = ({ testId }) => {
  const navigate = useNavigate();
  return (
    <Box
      data-testid={testId}
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', textAlign: 'center', p: 4, gap: 2 }}
    >
      <Typography variant="h5" component="h1">UI test not available</Typography>
      <Typography variant="body1" color="text.secondary">{TEST_NOT_AVAILABLE_MESSAGE}</Typography>
      <Button variant="contained" onClick={() => navigate(ALL_CHECKS_PATH)}>Back to All Checks</Button>
    </Box>
  );
};

/** A read of `GET /tests/{id}` that no author could ever see: forbidden, or a malformed id. */
export function isUnavailableTestRead(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return status === 403 || status === 400;
}

export default StudioUnavailable;

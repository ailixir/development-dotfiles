import React from 'react';
import { Alert, AlertTitle, Box, Paper, Stack, Typography } from '@mui/material';

/**
 * The Code view, saying what it does not have rather than showing something else
 * (story 10.11a, AC-3a).
 *
 * This tab used to be titled *"Generated Python (Playwright)"* and rendered the output of
 * `@/utils/studio/codegen/pythonGenerator`, regenerated in the browser on every step change. PRD
 * §5.3 retires Python export from the Studio plan; architecture §8.3 retires client Python
 * generation as an authoritative path; architecture §4.4 makes the server's artifact the only
 * executable truth. The page was inviting a reader to review one language and run another.
 *
 * **It renders an explicit unavailable state and it keeps the tab.** @po ruled open question 2:
 * keep the tab, name the blocker. Hiding the tab would make the blocker invisible at exactly the
 * moment its gate changed, and a blocker nobody can see is a blocker nobody moves. It is the same
 * shape story 10.10 landed for its summary slot (its AC-16a) and for the same reason: a fabricated
 * rendering of *"the code that will run"* is worse than an absent one, because it is the precise
 * confusion the confirmation step exists to prevent.
 *
 * **The blocker named is the new one, not the one that has landed.** ADR-002 §21 ruled candidate A
 * and it did **not** unblock this view: §21.2 exposes `currentCandidateArtifactHash` and
 * `currentCandidateArtifact` — the **candidate's** — while this view needs the **confirmed**
 * revision's, which §21.3 records as a *"third additive property on the same body"* that nobody has
 * ruled. Rendering the candidate instead was refused: in `needsRevision` the artifact and the
 * draft's current steps disagree **by design** (§21.7), so a Code view showing the candidate under
 * a heading that claims otherwise shows source the server will not run. Story 10.11c files that
 * Class C escalation (its AC-32); this view does not approximate around it.
 *
 * Nothing on this path imports the generator or the legacy grammar parser, and that is asserted
 * over the module text as the weaker supplement to the rendering assertions — a gate rebuilt
 * through a differently-named local passes a grep, which is the fourth catalogued vacuity shape.
 */

/** The accessible name of the unavailable state. Asserted by AC-3(a). */
export const CODE_VIEW_UNAVAILABLE_TITLE = 'The source that will run is not available to this page';

/** The blocker, named so it cannot be closed without the gate moving. */
export const CODE_VIEW_BLOCKER =
  'The API returns no confirmed revision’s source or artifact from any declared response. ADR-002 §21 added the current candidate’s artifact and hash; the confirmed revision’s is a further additive property, escalated by story 10.11c as a Class C amendment and not yet ruled.';

export const CODE_VIEW_WHY_NOT_THE_CANDIDATE =
  'Showing the current candidate instead was refused rather than overlooked. A draft that needs revision has a candidate that disagrees with its steps by design, so displaying it under this heading would show source the server will not run.';

export const CODE_VIEW_WHAT_IS_TRUE =
  'What runs is the artifact the server compiled and you confirmed. This page has never been able to read it, and until this story it showed Python it generated in your browser, which the server neither produced nor runs.';

const CodeTab: React.FC = () => (
  <Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Source
      </Typography>
    </Stack>
    <Paper variant="outlined" sx={{ p: 0 }}>
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
    </Paper>
  </Box>
);

export default CodeTab;

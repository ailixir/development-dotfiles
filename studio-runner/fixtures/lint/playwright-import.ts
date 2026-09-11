// Deliberate violation: Playwright is confined to `src/run/browser.ts` (story 10.12 AC-1).
// Asserted by `test/lint-boundary.test.ts`; excluded from the package lint run.
import { chromium } from 'playwright';

export const browser = chromium;

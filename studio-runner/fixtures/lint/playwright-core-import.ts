// Deliberate violation: `playwright-core` is the same library under a different name, and the
// confinement would be worthless if the engine package were reachable (story 10.12 AC-1).
import { chromium } from 'playwright-core';

export const engine = chromium;

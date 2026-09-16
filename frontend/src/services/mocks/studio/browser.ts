import { setupWorker } from 'msw/browser';
import { studioHandlers } from './handlers';
import { installMockedExecutionTransport } from './executionScenarios';

/**
 * Service worker used by the standalone Vite mode, which is the stakeholder-demo path
 * (story 10.1, AC-16). Started only when `VITE_ENABLE_MSW` is on; see `MswGate`.
 */
export const studioWorker = setupWorker(...studioHandlers);

/**
 * Story 10.11b, AC-17. The SSE assessment asks for *"a mocked transport scenario to the frontend
 * development path"*. A service worker cannot usefully serve a `text/event-stream`, so the scenario
 * is installed at the transport seam instead — which is the honest place for it, because what a
 * developer needs to see is snapshots arriving as separate frames. This module is only reachable
 * from the MSW-enabled development build (see `MswGate`), so nothing here ships to production.
 */
installMockedExecutionTransport();

export default studioWorker;

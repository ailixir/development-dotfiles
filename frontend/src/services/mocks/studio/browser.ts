import { setupWorker } from 'msw/browser';
import { studioHandlers } from './handlers';

/**
 * Service worker used by the standalone Vite mode, which is the stakeholder-demo path
 * (story 10.1, AC-16). Started only when `VITE_ENABLE_MSW` is on; see `MswGate`.
 */
export const studioWorker = setupWorker(...studioHandlers);

export default studioWorker;

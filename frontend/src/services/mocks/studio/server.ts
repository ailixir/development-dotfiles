import { setupServer } from 'msw/node';
import { studioHandlers } from './handlers';

/** Node-side interception used by Vitest (story 10.1, AC-21). */
export const studioMockServer = setupServer(...studioHandlers);

export default studioMockServer;

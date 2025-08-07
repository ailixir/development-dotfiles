import { checksHandlers } from './checks.handlers';
import { csiHandlers } from './csi.handlers';
import { executionHandlers } from './execution.handlers';
import { reportsHandlers } from './reports.handlers';
import { studioHandlers } from './studio.handlers';

// Combine all handlers
export const handlers = [
  ...checksHandlers,
  ...csiHandlers,
  ...executionHandlers,
  ...reportsHandlers,
  ...studioHandlers,
];

export default handlers;

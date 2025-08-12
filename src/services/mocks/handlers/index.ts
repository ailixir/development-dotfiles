import { checksHandlers } from './checksHandlers';
import { csiHandlers } from './csiHandlers';
import { reportsHandlers } from './reportsHandlers';
import studioHandlers from './studioHandlers';
import { tagsHandlers } from './tagsHandlers';
import { dashboardHandlers } from './dashboardHandlers';
import { secretsHandlers } from './secretsHandlers';

export const handlers = [
  ...checksHandlers,
  ...csiHandlers,
  ...reportsHandlers,
  ...tagsHandlers,
  ...studioHandlers,
  ...dashboardHandlers,
  ...secretsHandlers,
];
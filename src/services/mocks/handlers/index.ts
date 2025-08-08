import { checksHandlers } from './checksHandlers';
import { csiHandlers } from './csiHandlers';
import { reportsHandlers } from './reportsHandlers';
import { studioHandlers } from './studioHandlers';
import { tagsHandlers } from './tagsHandlers';

export const handlers = [
  ...checksHandlers,
  ...csiHandlers,
  ...reportsHandlers,
  ...studioHandlers,
  ...tagsHandlers,
];
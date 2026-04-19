import type { RequestHandler } from 'msw';
import { isDomainDisabled, type MockDomain } from '../mockMode';
import { checksHandlers } from './checksHandlers';
import { csiHandlers } from './csiHandlers';
import { reportsHandlers } from './reportsHandlers';
import studioHandlers from './studioHandlers';
import { tagsHandlers } from './tagsHandlers';
import { dashboardHandlers } from './dashboardHandlers';
import { secretsHandlers } from './secretsHandlers';
import { templatesHandlers } from './templatesHandlers';

const domainHandlerMap: [MockDomain, RequestHandler[]][] = [
  ['checks', checksHandlers],
  ['csi', csiHandlers],
  ['reports', reportsHandlers],
  ['tags', tagsHandlers],
  ['studio', studioHandlers],
  ['dashboard', dashboardHandlers],
  ['secrets', secretsHandlers],
  ['templates', templatesHandlers],
];

export const handlers: RequestHandler[] = domainHandlerMap.flatMap(
  ([domain, domainHandlers]) => {
    if (isDomainDisabled(domain)) {
      // eslint-disable-next-line no-console
      console.log(`[MSW] Domain '${domain}' disabled — requests fall through to real backend`);
      return [];
    }
    return domainHandlers;
  }
);
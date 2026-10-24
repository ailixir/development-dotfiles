import { describe, expect, it } from 'vitest';
import { getCurrentPageId } from './navigationSetup';

describe('getCurrentPageId', () => {
  it.each([
    ['/', 'home'],
    ['/checks', 'home'],
    ['/checks/all', 'checks'],
    ['/checks/create', 'checks'],
    ['/checks/prototype/splunk', 'checks'],
    ['/checks/ui-tests/abc/studio', 'checks'],
    ['/checks/studio/tests', 'studio-tests'],
    ['/checks/studio/runs', 'studio-runs'],
    ['/checks/reports', 'reports'],
  ])('maps %s to %s', (pathname, pageId) => {
    expect(getCurrentPageId(pathname)).toBe(pageId);
  });
});

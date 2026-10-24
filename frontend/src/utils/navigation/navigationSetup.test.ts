import { navigationRegistry } from '@put/core-components';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentPageId, registerChecksNavigation } from './navigationSetup';

describe('getCurrentPageId', () => {
  it.each([
    ['/', 'home'],
    ['/checks', 'home'],
    ['/checks/all', 'checks'],
    ['/checks/create', 'checks'],
    ['/checks/prototype/splunk', 'checks'],
    ['/checks/ui-tests/abc/studio', 'checks'],
    ['/checks/reports', 'reports'],
  ])('maps %s to %s', (pathname, pageId) => {
    expect(getCurrentPageId(pathname)).toBe(pageId);
  });
});

describe('registerChecksNavigation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers Home, Checks and Reports with no Studio group', () => {
    const register = vi.spyOn(navigationRegistry, 'register').mockImplementation(() => undefined);
    registerChecksNavigation();
    const { navigation } = register.mock.calls[0][0] as { navigation: Array<{ id: string; children?: unknown }> };
    expect(navigation.map((item) => item.id)).toEqual(['home', 'checks', 'reports']);
    expect(navigation.some((item) => item.children)).toBe(false);
  });
});

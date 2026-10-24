import { navigationRegistry } from '@put/core-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { store } from '@/store';
import { fetchFeatures } from '@/store/slices/featuresSlice';
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
  type NavItem = { id: string; label: string; path: string; children?: unknown };
  const initialFeatures = store.getState().features;

  const registeredNavigation = (): NavItem[] => {
    const register = vi.spyOn(navigationRegistry, 'register').mockImplementation(() => undefined);
    registerChecksNavigation();
    return (register.mock.calls[0][0] as { navigation: NavItem[] }).navigation;
  };

  beforeEach(() => {
    // The registration reads the singleton store: start from its initial feature flags.
    store.dispatch(fetchFeatures.fulfilled({ sources: initialFeatures.sources, features: initialFeatures.features }, ''));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    store.dispatch(fetchFeatures.fulfilled({ sources: initialFeatures.sources, features: initialFeatures.features }, ''));
  });

  it('registers Home, Checks and Reports with no Studio group', () => {
    const navigation = registeredNavigation();
    expect(navigation.map((item) => item.id)).toEqual(['home', 'checks', 'reports']);
    expect(navigation.some((item) => item.children)).toBe(false);
  });

  it('registers the labels and paths the sidebar shows', () => {
    expect(registeredNavigation().map(({ id, label, path }) => ({ id, label, path }))).toEqual([
      { id: 'home', label: 'Home', path: '/checks' },
      { id: 'checks', label: 'Checks', path: '/checks/all' },
      { id: 'reports', label: 'Reports', path: '/checks/reports' },
    ]);
  });

  it('hides Reports only when the REPORTS feature is explicitly disabled', () => {
    store.dispatch(
      fetchFeatures.fulfilled({ sources: [], features: [{ key: 'REPORTS', enabled: false, label: 'Reports' }] }, ''),
    );
    expect(registeredNavigation().map((item) => item.id)).toEqual(['home', 'checks']);
  });

  it('keeps Reports when other features are disabled or REPORTS is enabled', () => {
    store.dispatch(
      fetchFeatures.fulfilled(
        { sources: [], features: [{ key: 'STUDIO', enabled: false, label: 'Studio' }, { key: 'REPORTS', enabled: true, label: 'Reports' }] },
        '',
      ),
    );
    expect(registeredNavigation().map((item) => item.id)).toEqual(['home', 'checks', 'reports']);
  });
});

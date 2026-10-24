import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { uiTestEditorPath } from '@/components/studio/uiTestPaths';

/** The editor's route pattern; the id param is what ChecksStudioPage reads. */
export const STUDIO_EDITOR_ROUTE = '/checks/ui-tests/:id/studio';

/** Filled while the helper's router is mounted; lets a test move to another path (e.g. another test id). */
export interface StudioNavHandle {
  go: ((to: string) => void) | null;
}

export interface RenderStudioAtOptions {
  /** Initial query string, e.g. '?autorun=1'. */
  search?: string;
  /** Receives the router's navigate function once mounted, for route-change tests. */
  navHandle?: StudioNavHandle;
  /** Providers the caller owns (e.g. the Redux Provider); wraps the router. */
  wrapper?: React.ComponentType<{ children?: React.ReactNode }>;
}

export interface RenderStudioAtResult extends RenderResult {
  /** The router's current location. */
  getLocation: () => Location;
}

/** Captures navigate and the current location from inside the router. */
// eslint-disable-next-line react-refresh/only-export-components -- test helper module, never hot-reloaded.
const RouterProbe: React.FC<{ nav: StudioNavHandle; location: { current: Location | null } }> = ({ nav, location }) => {
  nav.go = useNavigate();
  location.current = useLocation();
  return null;
};

/**
 * Mounts `node` where the app mounts the editor: at `uiTestEditorPath(id)` (plus the optional search)
 * under a `/checks/ui-tests/:id/studio` route inside a MemoryRouter. The one place the editor suites
 * set up their route, so they differ from a bare MemoryRouter by the mount only.
 */
export function renderStudioAt(
  id: string,
  node: React.ReactElement,
  { search = '', navHandle, wrapper }: RenderStudioAtOptions = {},
): RenderStudioAtResult {
  const nav: StudioNavHandle = navHandle ?? { go: null };
  const location: { current: Location | null } = { current: null };
  const result = render(
    <MemoryRouter initialEntries={[`${uiTestEditorPath(id)}${search}`]}>
      <RouterProbe nav={nav} location={location} />
      <Routes>
        <Route path={STUDIO_EDITOR_ROUTE} element={node} />
      </Routes>
    </MemoryRouter>,
    { wrapper },
  );
  return {
    ...result,
    getLocation: () => {
      if (!location.current) throw new Error('renderStudioAt: the router is not mounted');
      return location.current;
    },
  };
}

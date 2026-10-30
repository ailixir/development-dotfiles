import { describe, expect, it } from 'vitest';
import {
  uiTestEditorPath,
  uiTestPath,
  uiTestRunPath,
} from './uiTestPaths';

describe('uiTestPaths', () => {
  describe("default base '/checks'", () => {
    it('builds the detail, run and editor paths', () => {
      expect(uiTestPath('t1')).toBe('/checks/ui-tests/t1');
      expect(uiTestRunPath('t1', 'e9')).toBe('/checks/ui-tests/t1/runs/e9');
      expect(uiTestEditorPath('t1')).toBe('/checks/ui-tests/t1/studio');
    });

    it('adds ?autorun=1 only when autorun is set', () => {
      expect(uiTestEditorPath('t1', { autorun: true })).toBe('/checks/ui-tests/t1/studio?autorun=1');
      expect(uiTestEditorPath('t1', { autorun: false })).toBe('/checks/ui-tests/t1/studio');
      expect(uiTestEditorPath('t1', {})).toBe('/checks/ui-tests/t1/studio');
    });
  });

  describe("empty base ''", () => {
    it('builds paths relative to the module root', () => {
      const options = { base: '' };
      expect(uiTestPath('t1', options)).toBe('/ui-tests/t1');
      expect(uiTestRunPath('t1', 'e9', options)).toBe('/ui-tests/t1/runs/e9');
      expect(uiTestEditorPath('t1', options)).toBe('/ui-tests/t1/studio');
      expect(uiTestEditorPath('t1', { ...options, autorun: true })).toBe('/ui-tests/t1/studio?autorun=1');
    });
  });

  it('honours an explicit base on every helper', () => {
    const options = { base: '/put/checks' };
    expect(uiTestPath('t1', options)).toBe('/put/checks/ui-tests/t1');
    expect(uiTestRunPath('t1', 'e9', options)).toBe('/put/checks/ui-tests/t1/runs/e9');
    expect(uiTestEditorPath('t1', { base: '/put/checks', autorun: true })).toBe(
      '/put/checks/ui-tests/t1/studio?autorun=1',
    );
  });

  it('URI-encodes ids and execution ids', () => {
    expect(uiTestPath('a b/c?d#e')).toBe('/checks/ui-tests/a%20b%2Fc%3Fd%23e');
    expect(uiTestRunPath('a/b', 'x y')).toBe('/checks/ui-tests/a%2Fb/runs/x%20y');
    expect(uiTestEditorPath('a/b', { autorun: true })).toBe('/checks/ui-tests/a%2Fb/studio?autorun=1');
  });
});

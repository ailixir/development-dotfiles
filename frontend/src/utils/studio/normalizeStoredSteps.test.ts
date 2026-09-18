import { describe, expect, it } from 'vitest';
import { normalizeStoredSteps } from './normalizeStoredSteps';

describe('normalizeStoredSteps', () => {
  it('converts the persisted Studio JSON shape into editable step text', () => {
    expect(
      normalizeStoredSteps(
        '[{"action":"navigate","target":"https://example.test"},{"action":"click","target":"button[type=submit]"}]'
      )
    ).toEqual(['Go to https://example.test', 'Click button[type=submit]']);
  });

  it('preserves already-normalized steps', () => {
    expect(normalizeStoredSteps(['Go to https://example.test'])).toEqual([
      'Go to https://example.test',
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { store } from '@/store';

/**
 * ENV-2 / REL-002: the store's import-time bootstrap is settled in-process by the shared setup
 * (`setup.ts`) before any test file code runs, so no test's outcome can depend on what listens at
 * jsdom's origin.
 *
 * The state is read on the first line after the import, with nothing async in between. Without
 * the shared remedy, the two requests are still in flight at this point, so `loading` is `true`.
 * They would then settle later, from whatever answers on the network.
 */
const atImport = store.getState();

describe('ENV-2: the store bootstrap never leaves the process', () => {
  it('the setup server answered both import-time requests, and no other request was made', () => {
    const record = globalThis.__BOOTSTRAP_ISOLATION__;
    expect(record, 'the shared setup did not run its bootstrap isolation').toBeDefined();
    expect([...record!.handled].sort()).toEqual([
      'GET /api/v1/checks/sources',
      'GET /api/v1/features',
    ]);
    expect(record!.unhandled).toEqual([]);
  });

  it('before this file ran, both slices had already settled on the in-process refusal', () => {
    expect(atImport.sources.loading).toBe(false);
    expect(atImport.sources.fetched).toBe(true);
    expect(atImport.sources.error).toMatch(/404/u);
    expect(atImport.features.loading).toBe(false);
    expect(atImport.features.fetched).toBe(true);
    expect(atImport.features.error).toMatch(/404/u);
    // The fail-open defaults, which is the state a host with nothing listening used to reach later.
    expect(atImport.sources.data.map((source) => source.type)).toContain('UI_TEST');
    expect(atImport.features.features.map((feature) => feature.key)).toContain('STUDIO');
  });
});

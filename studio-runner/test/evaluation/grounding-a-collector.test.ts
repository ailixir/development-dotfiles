/* eslint-disable no-restricted-syntax -- SPK-07 harness tests (not shipped): dynamic import of repository-owned evaluation modules at constant paths, so no .d.mts declaration files are needed; no artifact content reaches a loader. */
/**
 * SPK-07 workstream A: the instrumented collector is generated from the production source by one exact insertion, behind a
 * sha256 pin. It refuses on a pin mismatch or when the insertion anchor is not found exactly once.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Instrumented {
  patchSource(text: string, options?: { pinned?: string }): string; generate(): string; PINNED_SOURCE_SHA256: string; SOURCE_PATH: string; readSource(): string; PATCH: { anchor: string; insertion: string };
  loadInstrumented(): Promise<{ installObservationCollector: (...args: never[]) => unknown }>;
}
const collector = (await import(new URL('../../evaluation/grounding/lib/collectorInstrumented.mjs', import.meta.url).href)) as Instrumented;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

describe('instrumented collector generation', () => {
  it('refuses a source whose sha256 is not the pinned one', () => {
    const source = collector.readSource();
    expect(() => collector.patchSource(`${source} `)).toThrow('COLLECTOR_SOURCE_PIN_MISMATCH');
  });

  it('refuses when the insertion anchor is absent or ambiguous', () => {
    expect(() => collector.patchSource('nothing', { pinned: sha('nothing') })).toThrow('COLLECTOR_PATCH_ANCHOR_COUNT 0');
    const twice = `${collector.PATCH.anchor}${collector.PATCH.anchor}\n//# sourceMappingURL=observationCollector.js.map\n`;
    expect(() => collector.patchSource(twice, { pinned: sha(twice) })).toThrow('COLLECTOR_PATCH_ANCHOR_COUNT 2');
  });

  it('the current dist source matches the pin, and the output is the source plus exactly one inserted method', () => {
    const source = collector.readSource();
    expect(sha(source)).toBe(collector.PINNED_SOURCE_SHA256);
    const output = collector.patchSource(source);
    const body = output.split('\n').slice(2).join('\n'); // drop the two-line generated header
    const inserted = collector.PATCH.insertion.replace(collector.PATCH.anchor.split('\n')[0] ?? '', '').split('\n').filter(line => line.includes('__spk07Element'));
    expect(inserted.length).toBe(1);
    const restored = body.replace(`${inserted[0] ?? ''}\n`, '');
    expect(restored.trimEnd()).toBe(source.replace(/\n\/\/# sourceMappingURL=.*\s*$/u, '').trimEnd());
    expect(output.split('__spk07Element').length - 1).toBe(2); // the header mention and the method
  });

  it('generates a loadable module exposing the same factory', async () => {
    const path = collector.generate();
    expect(readFileSync(path, 'utf8')).toBe(collector.patchSource(collector.readSource()));
    const module = await collector.loadInstrumented();
    expect(String(module.installObservationCollector)).toContain('__spk07Element');
  });
});

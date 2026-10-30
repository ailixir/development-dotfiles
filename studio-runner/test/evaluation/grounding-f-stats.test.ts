/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules */
/**
 * SPK-07 workstream F: statistics against known values. Screening evidence tooling, not ADR-SC-005 D-C evidence.
 */
import { describe, expect, it } from 'vitest';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const stats = await load('../../evaluation/grounding/lib/stats.mjs');

describe('wilson interval', () => {
  it('matches known values', () => {
    const half = stats.wilson(5, 10);
    expect(half.lo).toBeCloseTo(0.2366, 3);
    expect(half.hi).toBeCloseTo(0.7634, 3);
    const none = stats.wilson(0, 10);
    expect(none.lo).toBeCloseTo(0, 10);
    expect(none.hi).toBeCloseTo(0.2775, 3);
    const all = stats.wilson(10, 10);
    expect(all.hi).toBeCloseTo(1, 10);
    expect(all.lo).toBeCloseTo(0.7225, 3);
  });
  it('is null-safe for an empty denominator', () => {
    expect(stats.wilson(0, 0)).toMatchObject({ p: null, lo: null, hi: null });
  });
});

describe('exact McNemar', () => {
  it('matches small exact cases', () => {
    expect(stats.mcnemarExact(0, 0).p).toBe(1);
    expect(stats.mcnemarExact(0, 5).p).toBeCloseTo(0.0625, 10);
    expect(stats.mcnemarExact(5, 0).p).toBeCloseTo(0.0625, 10);
    expect(stats.mcnemarExact(1, 5).p).toBeCloseTo(0.21875, 10);
    expect(stats.mcnemarExact(3, 3).p).toBe(1);
    expect(stats.mcnemarExact(10, 0).p).toBeCloseTo(2 / 1024, 10);
  });
  it('does not underflow for large discordant counts', () => {
    const result = stats.mcnemarExact(0, 2000);
    expect(result.p).toBeGreaterThanOrEqual(0);
    expect(result.p).toBeLessThan(1e-100);
  });
});

describe('cluster bootstrap', () => {
  const clusters = Array.from({ length: 40 }, (_, i) => ({ id: `t${i}`, x: { k: 3, n: 3 }, y: { k: i % 4 === 0 ? 3 : 0, n: 3 } }));
  it('is deterministic for a seed and differs across seeds', () => {
    const a = stats.clusterBootstrapDiff(clusters, { resamples: 2000, seed: 7 });
    const b = stats.clusterBootstrapDiff(clusters, { resamples: 2000, seed: 7 });
    const c = stats.clusterBootstrapDiff(clusters, { resamples: 2000, seed: 8 });
    expect(a).toEqual(b);
    expect([a.lo, a.hi]).not.toEqual([c.lo, c.hi]);
  });
  it('puts the CI above zero for a clear difference and around zero for identical arms', () => {
    const clear = stats.clusterBootstrapDiff(clusters, { resamples: 2000, seed: 1 });
    expect(clear.diff).toBeCloseTo(0.75, 10);
    expect(clear.lo).toBeGreaterThan(0);
    const same = stats.clusterBootstrapDiff(clusters.map((c: any) => ({ id: c.id, x: c.y, y: c.y })), { resamples: 2000, seed: 1 });
    expect(same.diff).toBe(0);
    expect(same.lo).toBe(0);
    expect(same.hi).toBe(0);
  });
  it('uses 10,000 resamples by default', () => {
    expect(stats.clusterBootstrapDiff(clusters, { seed: 1 }).resamples).toBe(10000);
  });
});

describe('paired comparison and helpers', () => {
  it('uses the majority over reps per unit and counts discordant units', () => {
    const units = [
      { task: 'a', x: [true, true, false], y: [false, false, true] },
      { task: 'b', x: [true, true, true], y: [true, true, true] },
      { task: 'c', x: [true, false, false], y: [true, true, false] },
      { task: 'd', x: [true, true, true], y: [false, false, false] },
    ];
    const result = stats.pairedComparison(units, { resamples: 500, seed: 3 });
    expect(result).toMatchObject({ units: 4, tasks: 4, onlyX: 2, onlyY: 1, both: 1, neither: 0 });
    expect(result.mcnemar.p).toBe(1);
  });
  it('implied k-step completion, majority and percentile', () => {
    expect(stats.impliedCompletion(0.97, 5)).toBeCloseTo(0.8587, 3);
    expect(stats.impliedCompletion(null, 5)).toBeNull();
    expect(stats.majority([true, false])).toBe(false);
    expect(stats.majority([true, true, false])).toBe(true);
    expect(stats.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
    expect(stats.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    expect(stats.percentile([], 50)).toBeNull();
  });
  it('seeded shuffles are reproducible', () => {
    const order = (seed: string) => stats.shuffled(['A0', 'A1', 'S1', 'S2', 'S3', 'S4'], stats.mulberry32(stats.seedFrom(seed)));
    expect(order('7|task')).toEqual(order('7|task'));
    expect([...order('7|task')].sort()).toEqual(['A0', 'A1', 'S1', 'S2', 'S3', 'S4']);
  });
});

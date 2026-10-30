/**
 * Helpers shared by the two layers of the AC1 parity check (ADR-SC-007 WI-2):
 *   layer 1  test/run/perceive.test.ts                      spike pure pipeline vs TS pure pipeline on committed raw objects
 *   layer 2  test/fixtures-tier/perception/parity.test.ts   live TS perceive() vs the captured spike baseline
 * The spike side is the committed verbatim copy (`../spike-pure/spike-pure.cjs`), never the untracked spike directory.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CollectedPage } from '../../../src/run/perceptionInPage.js';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const PARITY_DIR = here;

export interface SpikeNode {
  i: number; parent: number; depth: number; kids: number[]; kind: string; role?: string; name?: string; rawName?: string; ref?: string; text?: string;
  states?: string[]; tag?: string; withheld?: boolean; [key: string]: unknown;
}
export interface SpikePure {
  createMatcher(entries: (string | readonly [string, boolean])[]): { count: number; hit(text: string): boolean };
  buildRendered(collected: unknown, matcher: unknown, counters: Record<string, number>): { nodes: SpikeNode[]; rootKids: number[] };
  annotate(nodes: SpikeNode[], rootKids: number[]): void;
  renderLine(node: SpikeNode): string;
  project(nodes: SpikeNode[], lines: string[], o: { stepText?: string; targetIntent?: string; maxBytes?: number }): { lines: string[]; tier: string; notShown: number; keptIndexes: number[] };
  evidenceFor(node: SpikeNode): string;
  showRef(node: SpikeNode): boolean;
  bound(value: string, limit?: number): string;
  intentGate(targetIntent: unknown, node: unknown): string | null;
  operationTargetGate(kind: unknown, node: unknown): string | null;
  actionGate(a: unknown): string[];
  parseOutline(outline: string): unknown;
  g1: unknown;
  g2(parsed: unknown, target: unknown, literal: string): { applies: boolean; reason?: string; refuse?: boolean; refuseCI?: boolean };
  norm(value: string): string;
  words(value: string): string[];
}
export const spikePure = require('../spike-pure/spike-pure.cjs') as SpikePure;
export const spikeFacts = require('./spike-facts.cjs') as { spikeFacts(nodes: SpikeNode[], shown: number[], pure: SpikePure): Record<string, SpikeFact> };

export interface SpikeFact { role: string; name: string; editable: boolean; evidence: string; text?: string }

export interface BaselinePass {
  stepText: string; targetIntent: string; privateValues: string[]; inventory: [string, boolean][]; inventoryStatus: string;
  outline: string; facts: Record<string, SpikeFact>; shownRefs: string[];
  counters: Record<string, number>;
  projection: { projected: boolean; tier: string | null; notShown: number; unprojectedBytes: number; bytes: number };
}
export interface Baseline {
  schemaVersion: number;
  freeze: { harnessSha256: string; files: Record<string, string>; corpusSha256: string; otherHarnessDriftSinceFreezeB: string[] };
  distCollectorSha256: string;
  environment: { chromium: string; playwright: string; platform: string; arch: string; viewport: { width: number; height: number }; layoutProbeSha256: string };
  pages: Record<string, { source: string; htmlSha256: string; passes: Record<string, BaselinePass> }>;
}
export interface Difference {
  kind: 'D1' | 'D2' | 'D1-TAINT' | 'EVIDENCE-SIBLINGS' | 'FACTS-NAME-CAP';
  reason: string;
  removed: string[];
  added: string[];
}

export const loadBaseline = (): Baseline => JSON.parse(readFileSync(join(here, 'baseline.json'), 'utf8')) as Baseline;
export const loadCollected = (): Record<string, CollectedPage> => JSON.parse(readFileSync(join(here, 'collected.json'), 'utf8')) as Record<string, CollectedPage>;
export const loadDifferences = (): Record<string, Difference> => JSON.parse(readFileSync(join(here, 'differences.json'), 'utf8')) as Record<string, Difference>;
export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');

/** Multiset line difference: lines only the spike has (removed) and lines only the TS pipeline has (added). */
export function lineDiff(spike: readonly string[], ts: readonly string[]): { removed: string[]; added: string[] } {
  const count = new Map<string, number>();
  for (const line of spike) count.set(line, (count.get(line) ?? 0) + 1);
  const added: string[] = [];
  for (const line of ts) {
    const have = count.get(line) ?? 0;
    if (have > 0) count.set(line, have - 1);
    else added.push(line);
  }
  const removed: string[] = [];
  for (const line of spike) {
    const have = count.get(line) ?? 0;
    if (have > 0) {
      removed.push(line);
      count.set(line, have - 1);
    }
  }
  return { removed, added };
}

/** Spike facts and TS facts agree on role, name, editable, evidence (minus sibling cells) and text. */
export function factDifferences(spike: SpikeFact, ts: { role: string; name: string; editable: boolean; evidence: string; text?: string }, siblingStart: number | undefined): string[] {
  const out: string[] = [];
  const evidence = siblingStart === undefined ? ts.evidence : ts.evidence.slice(0, Math.max(0, siblingStart - 1));
  if (spike.role !== ts.role) out.push('role');
  if (spike.name.slice(0, 256) !== ts.name && spike.name !== ts.name) out.push('name');
  if (spike.editable !== ts.editable) out.push('editable');
  if (spike.evidence !== evidence) out.push('evidence');
  if (spike.text !== ts.text) out.push('text');
  return out;
}

export interface SpikeRun {
  outline: string;
  lines: string[];
  nodes: SpikeNode[];
  shown: number[];
  counters: Record<string, number>;
  facts: Record<string, SpikeFact>;
}

/**
 * The spike's perceive() minus the browser: buildRendered, annotate, the final leak guard on derived strings
 * (perceive.mjs:660-668), render, project at 40,000 bytes, and the derived facts. `entries` is the matcher input.
 */
export function spikeRun(raw: CollectedPage, entries: readonly (readonly [string, boolean])[], o: { stepText: string; targetIntent: string; maxBytes?: number }): SpikeRun {
  const matcher = spikePure.createMatcher(entries.map((entry) => [entry[0], entry[1]] as const));
  const counters: Record<string, number> = { withheldPrivate: 0, withheldKept: 0, withheldSensitive: 0, echoScrubbed: 0, valuesStripped: 0, unsupported: 0, passwordControls: 0 };
  const tree = spikePure.buildRendered(raw, matcher, counters);
  const { nodes, rootKids } = tree;
  spikePure.annotate(nodes, rootKids);
  if (matcher.count > 0) {
    for (const n of nodes) {
      if (typeof n.near === 'string' && matcher.hit(n.near)) { delete n.near; counters.withheldPrivate = (counters.withheldPrivate ?? 0) + 1; }
      if (typeof n.inHint === 'string' && matcher.hit(n.inHint)) { n.inHint = null; counters.withheldPrivate = (counters.withheldPrivate ?? 0) + 1; }
      if (typeof n.groupName === 'string' && matcher.hit(n.groupName)) { delete n.groupName; counters.withheldPrivate = (counters.withheldPrivate ?? 0) + 1; }
      const headers = n.headers;
      if (Array.isArray(headers)) {
        const clean = (headers as string[]).filter((header) => !matcher.hit(header));
        if (clean.length !== headers.length) counters.withheldPrivate = (counters.withheldPrivate ?? 0) + 1;
        if (clean.length) n.headers = clean; else delete n.headers;
      }
    }
  }
  const lines = nodes.map((n) => spikePure.renderLine(n));
  const maxBytes = o.maxBytes ?? 40000;
  let shown = nodes.map((n) => n.i);
  let outline = lines.join('\n');
  if (Buffer.byteLength(outline, 'utf8') > maxBytes) {
    const projection = spikePure.project(nodes, lines, { stepText: o.stepText, targetIntent: o.targetIntent, maxBytes });
    shown = projection.keptIndexes;
    outline = [...projection.lines, `… ${String(projection.notShown)} more nodes not shown`].join('\n');
  }
  return { outline, lines, nodes, shown, counters, facts: spikeFacts.spikeFacts(nodes, shown, spikePure) };
}

export interface ActualDifferences {
  outline: { removed: string[]; added: string[] } | null;
  facts: Record<string, string[]>;
  siblings: Record<string, string>;
}

/** What differs between the recorded spike result of a page/pass and a new perception (outline lines, facts, sibling cells). */
export function differencesFrom(
  pass: BaselinePass,
  result: { outline: string; facts: Record<string, { role: string; name: string; editable: boolean; evidence: string; text?: string }>; segments: Record<string, readonly { field: string; start: number }[]> },
): ActualDifferences {
  const diff = lineDiff(pass.outline.split('\n'), result.outline.split('\n'));
  const out: ActualDifferences = { outline: diff.removed.length || diff.added.length ? diff : null, facts: {}, siblings: {} };
  for (const [ref, fact] of Object.entries(pass.facts)) {
    const tsFact = result.facts[ref];
    if (!tsFact) {
      out.facts[ref] = ['missing'];
      continue;
    }
    const sibling = result.segments[ref]?.find((segment) => segment.field === 'sibling');
    if (sibling) out.siblings[ref] = tsFact.evidence.slice(sibling.start);
    const fields = factDifferences(fact, tsFact, sibling?.start);
    if (fields.length) out.facts[ref] = fields;
  }
  for (const ref of Object.keys(result.facts)) if (!pass.facts[ref]) out.facts[ref] = ['extra'];
  return out;
}

/* eslint-disable -- dynamic imports of untyped SPK-07 .mjs modules */
/** SPK-07 workstream F: the leak scan finds planted canaries (including inside PNG bytes) and credential shapes. */
import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const load = async (rel: string): Promise<any> => import(new URL(rel, import.meta.url).href);
const { scanRun } = await load('../../evaluation/grounding/lib/leakscan.mjs');
const dirs: string[] = [];
const makeRun = () => { const dir = mkdtempSync(join(tmpdir(), 'spk07-f-leak-')); dirs.push(dir); mkdirSync(join(dir, 'bodies')); return dir; };
afterAll(() => { for (const dir of dirs) rmSync(dir, { recursive: true, force: true }); });

const CANARY = 'canary-Zq83-private-value';

describe('scanRun', () => {
  it('is clean when no canary or credential is present', () => {
    const dir = makeRun();
    writeFileSync(join(dir, 'calls.jsonl'), '{"usage":{"prompt":10}}\n');
    writeFileSync(join(dir, 'steps.jsonl'), '{"key":"a|0|A1|1|1"}\n');
    const result = scanRun(dir, { canaries: [CANARY] });
    expect(result.clean).toBe(true);
    expect(result.scannedFiles).toBe(2);
  });
  it('finds a planted canary with file and offset, in text and in raw PNG bytes', () => {
    const dir = makeRun();
    writeFileSync(join(dir, 'steps.jsonl'), `{"a":1}\n{"meta":"x ${CANARY} y"}\n`);
    writeFileSync(join(dir, 'bodies', 'shot.png'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]), Buffer.from(CANARY), Buffer.from([9, 9])]));
    const result = scanRun(dir, { canaries: ['unrelated-value-1', CANARY] });
    expect(result.clean).toBe(false);
    const canaryHits = result.hits.filter((hit: any) => hit.kind === 'canary');
    expect(canaryHits.map((hit: any) => hit.file).sort()).toEqual(['bodies/shot.png', 'steps.jsonl']);
    expect(canaryHits.every((hit: any) => hit.canary === 1)).toBe(true);
    expect(canaryHits.find((hit: any) => hit.file === 'bodies/shot.png').offset).toBe(8);
    expect(JSON.stringify(result)).not.toContain(CANARY);
  });
  it('finds JSON-escaped canaries', () => {
    const dir = makeRun();
    writeFileSync(join(dir, 'calls.jsonl'), `${JSON.stringify({ text: 'say "hi" \\ there' })}\n`);
    expect(scanRun(dir, { canaries: ['say "hi" \\ there'] }).clean).toBe(false);
  });
  it('finds bearer tokens without copying them', () => {
    const dir = makeRun();
    const token = `ya29.${'a1B2c3D4e5'.repeat(6)}`;
    writeFileSync(join(dir, 'logs.txt'), `Authorization: Bearer ${token}\n`);
    const result = scanRun(dir, { canaries: [] });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.some((hit: any) => hit.kind === 'bearer' || hit.kind === 'googleAccessToken')).toBe(true);
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it('ignores its own previous result file', () => {
    const dir = makeRun();
    writeFileSync(join(dir, 'leakscan.json'), JSON.stringify({ note: CANARY }));
    expect(scanRun(dir, { canaries: [CANARY] }).clean).toBe(true);
  });
  it('QA-D1: finds a capitalized, NFKC-variant or truncated (12-character window) canary', () => {
    const dir = makeRun(); const canary = 'cnryABCDEFGHIJKLMNOPQRST';
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ link: 'CnryABCDEFGHIJKLMNOPQRST' }));
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ fragment: 'xxBCDEFGHIJKLMyy' }));
    writeFileSync(join(dir, 'c.json'), JSON.stringify({ wide: '\uFF43\uFF4E\uFF52\uFF59ABCDEFGHIJKLMNOPQRST' })); // fullwidth "cnry"
    writeFileSync(join(dir, 'd.json'), JSON.stringify({ short: 'BCDEFGHIJKL' })); // 11 characters: below the window
    const result = scanRun(dir, { canaries: [canary] });
    expect([...new Set(result.hits.map((h: any) => h.file))].sort()).toEqual(['a.json', 'b.json', 'c.json']);
    expect(result.hits.every((h: any) => h.folded === true)).toBe(true);
  });
  it('reports one hit per occurrence even though the whole canary and its windows all match', () => {
    const dir = makeRun();
    writeFileSync(join(dir, 'a.txt'), `x ${CANARY} y`);
    expect(scanRun(dir, { canaries: [CANARY] }).hits).toHaveLength(1);
  });
  it('QA-D3: attributes hits to arms (body files via calls.jsonl labels, per-arm jsonl lines, file names) and leaves harness-level outputs unattributed', () => {
    const dir = makeRun();
    writeFileSync(join(dir, 'calls.jsonl'), `${JSON.stringify({ n: 1, label: 't|0|S3|1|1' })}\n${JSON.stringify({ n: 2, label: 't|-1|SP|1|1' })}\n`);
    writeFileSync(join(dir, 'bodies', '1.json'), `{"x":"${CANARY}"}`);
    writeFileSync(join(dir, 'bodies', '2.json'), `{"x":"${CANARY}"}`);
    writeFileSync(join(dir, 'replies.jsonl'), `${JSON.stringify({ key: 't|0|A1|1|1', reply: { v: 'clean' } })}\n${JSON.stringify({ key: 't|0|S2|1|1', reply: { v: CANARY } })}\n`);
    writeFileSync(join(dir, 'harness.log'), `note ${CANARY}`);
    writeFileSync(join(dir, 'bodies', 'leak-x-A1.json'), `{"x":"${CANARY}"}`);
    const arms = Object.fromEntries(scanRun(dir, { canaries: [CANARY] }).hits.map((h: any) => [h.file, h.arm]));
    expect(arms).toEqual({ 'bodies/1.json': 'S3', 'bodies/2.json': 'SP', 'replies.jsonl': 'S2', 'harness.log': null, 'bodies/leak-x-A1.json': 'A1' });
  });
});

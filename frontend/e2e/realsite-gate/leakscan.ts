/**
 * Leak scanner of the ADR-SC-007 release gate.
 *
 * Two canary classes. SECRET canaries exist only in env/Vault: any occurrence in any sink is a LEAK.
 * PAGE_PRINTED canaries are values the live page itself prints (the practice login page prints
 * "Password123"): an occurrence is PAGE_ORIGIN only when (1) its source is in the closed page-text
 * table (page-text-sources.json) and (2) the enclosing TEXT SEGMENT, cut at structural delimiters
 * after JSON decoding, occurs verbatim in the live page text and carries real context. Everything
 * else is a LEAK.
 *
 * Hits record file, offset, canary label, class, form and verdict; the matched text is never stored.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync,lstatSync } from 'node:fs';
import { join, relative } from 'node:path';

export type CanaryClass = 'SECRET' | 'PAGE_PRINTED';

export interface Canary {
  label: string;
  value: string;
  cls: CanaryClass;
}

export interface SourceSpec {
  /** gateway | db | runner | backend | core | issuer | vault | ui | playwright | results */
  name: string;
  root: string;
  /** Whether this source (and, for db dumps, this file) may carry page text. */
  mayCarryPageText: (relativeFile: string) => boolean;
}

export type HitVerdict = 'LEAK' | 'PAGE_ORIGIN';

export interface Hit {
  source: string;
  file: string;
  offset: number;
  canary: string;
  cls: CanaryClass | 'BEARER';
  form: string;
  verdict: HitVerdict;
  reason: string;
}

export interface SourceStat {
  digest?: string;
  name: string;
  present: boolean;
  files: number;
  bytes: number;
  opaqueFiles: number;
  opaqueBytes: number;
}

export interface ScanSummary {
  originalUi?:{snapshots:number;bytes:number;missing:number};
  canaries: { label: string; cls: CanaryClass; length: number; sha6: string }[];
  formsPerCanary: Record<string, number>;
  sources: SourceStat[];
  filesScanned: number;
  bytesScanned: number;
  opaqueBytes: number;
  hits: Hit[];
  leak: number;
  pageOrigin: number;
  pageTextChars: number;
  db: { tables: number; rows: number; bytes: number } | null;
  gatewayBodies: number;
}

// ---- forms -----------------------------------------------------------------------------------

export interface Form {
  name: string;
  needle: string;
}

/** The encodings one canary can appear in. Needles that coincide are kept once (first name wins). */
export function canaryForms(value: string): Form[] {
  const candidates: Form[] = [
    { name: 'raw', needle: value },
    { name: 'json', needle: JSON.stringify(value).slice(1, -1) },
    { name: 'url', needle: encodeURIComponent(value) },
    { name: 'plus', needle: encodeURIComponent(value).replace(/%20/g, '+') },
    { name: 'double', needle: encodeURIComponent(encodeURIComponent(value)) },
    { name: 'base64', needle: Buffer.from(value, 'utf8').toString('base64').replace(/=+$/, '') },
  ];
  const seen = new Set<string>();
  const forms: Form[] = [];
  for (const form of candidates) {
    if (form.needle.length < 4 || seen.has(form.needle)) continue;
    seen.add(form.needle);
    forms.push(form);
  }
  return forms;
}

export interface Folded {
  text: string;
  /** For each folded character, the index in the original string. */
  map: number[];
}

/** NFKC, case-folded, letters and digits only, with a map back to the original offsets. */
export function fold(input: string): Folded {
  let text = '';
  const map: number[] = [];
  let index = 0;
  for (const ch of input) {
    for (const piece of ch.normalize('NFKC').toLowerCase()) {
      if (/[\p{L}\p{N}]/u.test(piece)) {
        text += piece;
        map.push(index);
      }
    }
    index += ch.length;
  }
  return { text, map };
}

export const foldText = (input: string): string => fold(input).text;

function* indexesOf(haystack: string, needle: string): Generator<number> {
  if (needle === '') return;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return;
    yield at;
    from = at + 1;
  }
}

// ---- provenance ------------------------------------------------------------------------------

const DELIMITERS = ['\n', '"', '[', ']', '{', '}'];
export const MIN_CONTEXT = 12;

function unescapeLine(line: string): string {
  return line.replace(/\\(n|"|\\|u[0-9a-fA-F]{4})/g, (_m, c: string) => {
    if (c === 'n') return '\n';
    if (c === '"') return '"';
    if (c === '\\') return '\\';
    return String.fromCharCode(parseInt(c.slice(1), 16));
  });
}

function collectStrings(node: unknown, out: string[], keys: boolean): void {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) for (const item of node) collectStrings(item, out, keys);
  else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (keys) out.push(key);
      collectStrings(value, out, keys);
    }
  }
}

/** The decoded strings of a file, in file order: JSON values, JSON-lines values, or unescaped lines. */
export function decodedStrings(text: string, keys = true): string[] {
  const out: string[] = [];
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      collectStrings(JSON.parse(text), out, keys);
      return out;
    } catch {
      out.length = 0;
    }
  }
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length > 0) {
    try {
      const parsed = lines.map((l) => JSON.parse(l) as unknown);
      if (parsed.every((p) => p !== null && typeof p === 'object')) {
        for (const p of parsed) collectStrings(p, out, keys);
        return out;
      }
    } catch {
      out.length = 0;
    }
  }
  return text.split('\n').map(unescapeLine);
}

export type OccurrenceReason = 'PAGE_ORIGIN' | 'NOT_IN_PAGE' | 'CONTEXT_TOO_SHORT';

export interface OccurrenceVerdict {
  verdict: HitVerdict;
  reason: OccurrenceReason;
}

/** The enclosing text segment of one occurrence, cut at newline, quote, brackets and braces. */
export function segmentAround(s: string, at: number, length: number): string {
  let left = 0;
  for (const d of DELIMITERS) left = Math.max(left, s.lastIndexOf(d, at - 1) + 1);
  let right = s.length;
  for (const d of DELIMITERS) {
    const i = s.indexOf(d, at + length);
    if (i >= 0) right = Math.min(right, i);
  }
  return s.slice(left, right);
}

/** One verdict per occurrence of `value` in the decoded strings of `text`, in file order. */
export function occurrenceVerdicts(text: string, value: string, foldedPage: string): OccurrenceVerdict[] {
  const foldedValue = foldText(value);
  const verdicts: OccurrenceVerdict[] = [];
  for (const s of decodedStrings(text)) {
    for (const at of indexesOf(s, value)) {
      const segment = foldText(segmentAround(s, at, value.length));
      const context = segment.length - foldedValue.length * Math.max(1, segment.split(foldedValue).length - 1);
      if (context < MIN_CONTEXT) verdicts.push({ verdict: 'LEAK', reason: 'CONTEXT_TOO_SHORT' });
      else if (foldedPage !== '' && foldedPage.includes(segment)) verdicts.push({ verdict: 'PAGE_ORIGIN', reason: 'PAGE_ORIGIN' });
      else verdicts.push({ verdict: 'LEAK', reason: 'NOT_IN_PAGE' });
    }
  }
  return verdicts;
}

// ---- scanning --------------------------------------------------------------------------------

const BEARER_PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'bearer', re: /Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/g },
  { kind: 'googleAccessToken', re: /ya29\.[A-Za-z0-9_-]{20,}/g },
  { kind: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g },
  { kind: 'googleApiKey', re: /AIza[0-9A-Za-z_-]{35}/g },
  { kind: 'privateKey', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

const OPAQUE_EXT = /\.(webm|mp4|png|jpe?g|zip|gz|bin)$/i;
const WINDOW = 12;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
    if(entry.isSymbolicLink())throw new Error('SCAN_SYMLINK');
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

interface Range {
  start: number;
  end: number;
}
const overlaps = (a: Range, ranges: Range[]): boolean => ranges.some((r) => a.start < r.end && r.start < a.end);

interface RawHit {
  offset: number;
  end: number;
  form: string;
}

/**
 * The text a human or a model would read: JSON strings decoded, HTML tags, [ref=..] markers, {state}
 * blocks and the outline's "- role" line prefix removed. A value split across nodes, spans or outline
 * lines becomes contiguous here even though markup tokens separate it in the raw bytes.
 */
export function plainView(text: string): string {
  return decodedStrings(text, false)
    .join('\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[[^\]\n]*\]/g, ' ')
    .replace(/\{[^}\n]*\}/g, ' ')
    .replace(/^[ \t]*-[ \t]+[A-Za-z]+(?=[\s":])/gm, ' ');
}

const countOf = (haystack: string, needle: string): number => (needle === '' ? 0 : haystack.split(needle).length - 1);

function findHits(text: string, folded: Folded, canary: Canary, viewFolded: () => string): RawHit[] {
  const hits: RawHit[] = [];
  const ranges: Range[] = [];
  for (const form of canaryForms(canary.value)) {
    for (const at of indexesOf(text, form.needle)) {
      hits.push({ offset: at, end: at + form.needle.length, form: form.name });
      ranges.push({ start: at, end: at + form.needle.length });
    }
  }
  const fv = foldText(canary.value);
  if (fv.length >= 8) {
    for (const at of indexesOf(folded.text, fv)) {
      const range = { start: folded.map[at] ?? 0, end: (folded.map[at + fv.length - 1] ?? 0) + 1 };
      if (overlaps(range, ranges)) continue;
      hits.push({ offset: range.start, end: range.end, form: 'split' });
      ranges.push(range);
    }
  }
  if (fv.length >= 8) {
    // Occurrences visible only after markup is removed (a value split across nodes or outline lines).
    const plainFound = hits.filter((h) => h.form === 'raw' || h.form === 'json' || h.form === 'split').length;
    const extra = countOf(viewFolded(), fv) - plainFound;
    for (let i = 0; i < extra; i += 1) hits.push({ offset: -1, end: -1, form: 'split-markup' });
  }
  if (canary.cls === 'SECRET' && fv.length >= 2 * WINDOW) {
    const seen = new Set<string>();
    for (let i = 0; i + WINDOW <= fv.length; i += 1) {
      const w = fv.slice(i, i + WINDOW);
      if (seen.has(w)) continue;
      seen.add(w);
      for (const at of indexesOf(folded.text, w)) {
        const range = { start: folded.map[at] ?? 0, end: (folded.map[at + WINDOW - 1] ?? 0) + 1 };
        if (overlaps(range, ranges)) continue;
        hits.push({ offset: range.start, end: range.end, form: 'window' });
        ranges.push(range);
      }
    }
  }
  return hits.sort((a, b) => a.offset - b.offset);
}

/** Raw product UI is a forbidden carrier; classify before any persistence redaction. */
export function scanUiTextHits(text:string,canaries:Canary[],file:string):Hit[]{
  const folded=fold(text),hits:Hit[]=[];let view:string|null=null;
  for(const canary of canaries)for(const h of findHits(text,folded,canary,()=>view??=foldText(plainView(text))))hits.push({source:'ui',file,offset:h.offset,canary:canary.label,cls:canary.cls,form:h.form,verdict:'LEAK',reason:'RAW_PRODUCT_UI_TEXT'});
  for(const {kind,re} of BEARER_PATTERNS)for(const match of text.matchAll(re))hits.push({source:'ui',file,offset:match.index??0,canary:kind,cls:'BEARER',form:'shape',verdict:'LEAK',reason:'RAW_PRODUCT_UI_BEARER_SHAPE'});
  return hits;
}

export interface ScanOptions {
  pageText: string;
  db?: { tables: number; rows: number; bytes: number } | null;
}

export function scanSources(canaries: Canary[], sources: SourceSpec[], options: ScanOptions): ScanSummary {
  const foldedPage = foldText(options.pageText);
  const hits: Hit[] = [];
  const stats: SourceStat[] = [];
  let filesScanned = 0;
  let bytesScanned = 0;
  let opaqueBytes = 0;
  let gatewayBodies = 0;
  for (const source of sources) {
    const stat: SourceStat = { name: source.name, present: existsSync(source.root), files: 0, bytes: 0, opaqueFiles: 0, opaqueBytes: 0 };
    stats.push(stat);
    if (!stat.present) continue;
    if(lstatSync(source.root).isSymbolicLink())throw new Error('SCAN_SYMLINK');
    const manifest:{path:string;bytes:number;sha256:string}[]=[];
    const files = statSync(source.root).isDirectory() ? [...walk(source.root)] : [source.root];
    for (const path of files) {
      const before=lstatSync(path);if(!before.isFile()||before.isSymbolicLink())throw new Error('SCAN_NOT_REGULAR');
      const data=readFileSync(path),after=lstatSync(path);if(before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw new Error('SCAN_RACE');
      const size = data.length;
      const rel = relative(source.root, path) || path.slice(path.lastIndexOf('/') + 1);
      manifest.push({path:rel,bytes:size,sha256:createHash('sha256').update(data).digest('hex')});
      stat.digest=createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
      if (OPAQUE_EXT.test(path)) {
        stat.opaqueFiles += 1;
        stat.opaqueBytes += size;
        opaqueBytes += size;
        continue;
      }
      stat.files += 1;
      stat.bytes += size;
      filesScanned += 1;
      bytesScanned += size;
      if (source.name === 'gateway' && /\.req\.json$/.test(rel)) gatewayBodies += 1;
      const text = data.toString('utf8');
      const folded = fold(text);
      let view: string | null = null;
      const viewFolded = (): string => (view ??= foldText(plainView(text)));
      for (const canary of canaries) {
        const raw = findHits(text, folded, canary, viewFolded);
        let verdicts: OccurrenceVerdict[] | null = null;
        let rawIndex = 0;
        const rawCount = raw.filter((h) => h.form === 'raw' || h.form === 'json').length;
        for (const hit of raw) {
          let verdict: HitVerdict = 'LEAK';
          let reason = 'SECRET_CANARY';
          if (canary.cls === 'PAGE_PRINTED') {
            if (!source.mayCarryPageText(rel)) reason = 'SOURCE_NOT_ALLOWED';
            else if (hit.form !== 'raw' && hit.form !== 'json') reason = 'FORM_NOT_PAGE_TEXT';
            else {
              verdicts ??= occurrenceVerdicts(text, canary.value, foldedPage);
              if (verdicts.length !== rawCount) reason = 'UNDECODABLE';
              else {
                const v = verdicts[rawIndex];
                verdict = v?.verdict ?? 'LEAK';
                reason = v?.reason ?? 'UNDECODABLE';
              }
            }
          }
          if (hit.form === 'raw' || hit.form === 'json') rawIndex += 1;
          hits.push({ source: source.name, file: rel, offset: hit.offset, canary: canary.label, cls: canary.cls, form: hit.form, verdict, reason });
        }
      }
      for (const { kind, re } of BEARER_PATTERNS) {
        for (const match of text.matchAll(re)) {
          hits.push({ source: source.name, file: rel, offset: match.index ?? 0, canary: kind, cls: 'BEARER', form: 'shape', verdict: 'LEAK', reason: `BEARER_SHAPE sha6=${createHash('sha256').update(match[0]).digest('hex').slice(0, 6)}` });
        }
      }
    }
  }
  return {
    canaries: canaries.map((c) => ({ label: c.label, cls: c.cls, length: c.value.length, sha6: createHash('sha256').update(c.value).digest('hex').slice(0, 6) })),
    formsPerCanary: Object.fromEntries(canaries.map((c) => [c.label, canaryForms(c.value).length])),
    sources: stats,
    filesScanned,
    bytesScanned,
    opaqueBytes,
    hits,
    leak: hits.filter((h) => h.verdict === 'LEAK').length,
    pageOrigin: hits.filter((h) => h.verdict === 'PAGE_ORIGIN').length,
    pageTextChars: options.pageText.length,
    db: options.db ?? null,
    gatewayBodies,
  };
}

/** Complete coverage is required independently of whatever sources a scan happens to declare. */
export const REQUIRED_SCAN_SOURCES = ['db', 'runner', 'runner-objects', 'runner-journal', 'backend', 'core', 'issuer', 'vault', 'ui', 'results', 'gateway', 'playwright'] as const;
export function requiredScanSources(nextday:boolean,diagnostics:boolean):readonly string[]{return [...REQUIRED_SCAN_SOURCES,...(nextday?['nextday']:[]),...(diagnostics?['diagnostics']:[])];}
export function scanVerdict(scan: ScanSummary, requiredSources: readonly string[] = REQUIRED_SCAN_SOURCES): { verdict: 'PASS' | 'FAIL'; reasons: string[] } {
  const reasons: string[] = [];
  const nat = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (!Array.isArray(scan.canaries) || scan.canaries.length === 0) reasons.push('no canaries: complete declared canaries required');
  const labels = scan.canaries.map((c) => c.label);
  if (new Set(labels).size !== labels.length || labels.some((label) => label.trim() === '')) reasons.push('canary labels empty or duplicate');
  for (const c of scan.canaries) if (!nat(c.length) || c.length < 4 || !nat(scan.formsPerCanary[c.label]) || (scan.formsPerCanary[c.label] ?? 0) < 1) reasons.push('missing canary form coverage');
  if(Object.keys(scan.formsPerCanary).sort().join()!==[...labels].sort().join()||scan.canaries.some((c)=>!['PAGE_PRINTED','SECRET'].includes(c.cls)||!/^[a-f0-9]{6}$/.test(c.sha6)))reasons.push('canary metadata/form declarations contradictory');
  if(scan.originalUi===undefined||!nat(scan.originalUi.snapshots)||scan.originalUi.snapshots===0||!nat(scan.originalUi.bytes)||scan.originalUi.missing!==0)reasons.push('missing actual pre-redaction product UI text scan coverage');
  const sources = scan.sources.map((s) => s.name);
  if (new Set(sources).size !== sources.length || requiredSources.some((n) => !sources.includes(n))) reasons.push('missing or duplicate required source coverage');
  for (const s of scan.sources) {
    if(!/^[a-f0-9]{64}$/.test(s.digest ?? ''))reasons.push(`missing source content manifest ${s.name}`);
    if (!s.present) reasons.push(`configured source ${s.name} is missing`);
    if (![s.files, s.bytes, s.opaqueFiles, s.opaqueBytes].every(nat)) reasons.push(`invalid denominator for ${s.name}`);
    else if (s.files + s.opaqueFiles === 0) reasons.push(`configured source ${s.name} is empty`);
  }
  if (scan.db === null || !nat(scan.db.tables) || scan.db.tables === 0 || !nat(scan.db.rows) || !nat(scan.db.bytes)) reasons.push('complete database coverage missing');
  if (!nat(scan.gatewayBodies) || scan.gatewayBodies === 0) reasons.push('gateway coverage missing');
  if (![scan.filesScanned, scan.bytesScanned, scan.opaqueBytes, scan.leak, scan.pageOrigin].every(nat)) reasons.push('invalid scan totals');
  if (scan.filesScanned !== scan.sources.reduce((n, s) => n + s.files, 0) || scan.bytesScanned !== scan.sources.reduce((n, s) => n + s.bytes, 0) || scan.opaqueBytes !== scan.sources.reduce((n, s) => n + s.opaqueBytes, 0)) reasons.push('source denominators contradict totals');
  if (scan.leak !== scan.hits.filter((h) => h.verdict === 'LEAK').length || scan.pageOrigin !== scan.hits.filter((h) => h.verdict === 'PAGE_ORIGIN').length || scan.leak + scan.pageOrigin !== scan.hits.length) reasons.push('hit list contradicts counters');
  for (const h of scan.hits) if (!sources.includes(h.source) || (h.cls !== 'BEARER' && !labels.includes(h.canary))) reasons.push('hit has undeclared provenance');
  if (scan.hits.length > 0 || scan.leak !== 0 || scan.pageOrigin !== 0) reasons.push(`${scan.hits.length} canary occurrence(s): LEAK ${scan.leak}, PAGE_ORIGIN ${scan.pageOrigin}; every occurrence fails`);
  return { verdict: reasons.length === 0 ? 'PASS' : 'FAIL', reasons };
}

// ---- redaction -------------------------------------------------------------------------------

/** Replaces every encoded form of every canary with <redacted>; used on errors that may echo a fill value. */
export function redactCanaries(text: string, canaries: { value: string }[]): string {
  const needles = canaries.flatMap((c) => canaryForms(c.value).map((f) => f.needle)).sort((a, b) => b.length - a.length);
  let out = text;
  for (const needle of needles) out = out.split(needle).join('<redacted>');
  return out;
}

// ---- page-text source table --------------------------------------------------------------------

export interface PageTextSources {
  version: number;
  mayCarryPageText: { files: string[]; dbTables: string[] };
  mustNotCarryPageText: { files: string[]; dbTables: string[] };
}

const globToRegExp = (glob: string): RegExp => {
  const escape = (part: string): string => part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${glob.split('**').map(escape).join('.*')}$`);
};

/** Builds the per-source predicate from the closed table. Anything not listed may NOT carry page text. */
export function pageTextPredicate(table: PageTextSources, sourceName: string): (relativeFile: string) => boolean {
  if (sourceName === 'gateway') {
    const patterns = table.mayCarryPageText.files.filter((f) => f.startsWith('gateway/')).map((f) => globToRegExp(f.slice('gateway/'.length).replace(/ \(.*$/, '')));
    return (rel) => patterns.some((p) => p.test(rel));
  }
  if (sourceName === 'db') {
    const allowed = new Set(table.mayCarryPageText.dbTables.map((t) => t.replace(/ \(.*$/, '')));
    return (rel) => allowed.has(rel.replace(/\.jsonl$/, ''));
  }
  return () => false;
}

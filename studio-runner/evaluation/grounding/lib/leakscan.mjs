/* eslint-disable -- SPK-07 spike tooling: untyped .mjs harness, dynamic imports of arm modules, Node globals. */
// SPK-07 leak scan: every file under a run dir (calls, steps, logs, kept bodies, PNGs as raw bytes) is searched for
// the run's canary/private values and for anything shaped like a credential. Hits report file + byte offset only;
// matched secrets are never copied into the result (length and a short sha256 prefix identify a bearer hit).
// usage: node evaluation/grounding/lib/leakscan.mjs RUN_DIR --canaries canaries.json|a,b,c
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BEARER_PATTERNS = [
  { kind: 'bearer', re: /Bearer\s+[A-Za-z0-9._~+/-]{20,}=*/gu },
  { kind: 'googleAccessToken', re: /ya29\.[A-Za-z0-9_-]{20,}/gu },
  { kind: 'jwt', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/gu },
  { kind: 'googleApiKey', re: /AIza[0-9A-Za-z_-]{35}/gu },
  { kind: 'privateKey', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/gu },
];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

/** The byte patterns one canary can appear as: raw UTF-8, JSON-escaped, URL-encoded and base64 of the raw value. */
export function canaryVariants(value) {
  const raw = String(value);
  const variants = new Set([raw, JSON.stringify(raw).slice(1, -1), encodeURIComponent(raw), Buffer.from(raw, 'utf8').toString('base64').replace(/=+$/u, '')]);
  return [...variants].filter(variant => variant.length >= 4).map(variant => Buffer.from(variant, 'utf8'));
}

/** Pre-registration section 12: case-folded (and NFKC-normalized) forms, plus every 12-character window of the canary. */
export const WINDOW = 12;
export const fold = text => String(text).normalize('NFKC').toLowerCase();
export function foldedNeedles(value) {
  const folded = [...fold(value)];
  if (folded.length === 0) return [];
  if (folded.length <= WINDOW) return [folded.join('')];
  const windows = new Set();
  for (let i = 0; i + WINDOW <= folded.length; i++) windows.add(folded.slice(i, i + WINDOW).join(''));
  return [...windows];
}

function* offsetsOf(haystack, needle) {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return;
    yield at;
    from = at + 1;
  }
}

const ARM_RE = /(?:^|[^A-Za-z0-9])(A0|A1|S1|S2|S3|S4)(?:[^A-Za-z0-9]|$)/u;
const KEY_ARM_RE = /\|(A0|A1|S1|S2|S3|S4)\|-?\d+\|\d+/u;
const JSON_ARM_RE = /"arm":"(A0|A1|S1|S2|S3|S4)"/u;
// Files whose lines are per-arm payloads: the arm is read from the line that holds the hit. calls.jsonl, logs and reports are harness-level.
const LINE_ATTRIBUTED = /^(?:replies|scoring-input|steps|dry)\.jsonl$/u;

/** n -> arm for bodies/<n>.json, from the labels vertex.mjs wrote into calls.jsonl (task|step|ARM|rep|attempt). */
function bodyArms(runDir) {
  const map = new Map();
  try {
    for (const line of readFileSync(join(runDir, 'calls.jsonl'), 'utf8').split('\n')) {
      if (!line) continue;
      const record = JSON.parse(line);
      const arm = KEY_ARM_RE.exec(String(record.label ?? ''))?.[1] ?? (String(record.label ?? '').includes('|SP|') ? 'SP' : null);
      if (arm) map.set(String(record.n), arm);
    }
  } catch { /* no calls.jsonl: bodies stay unattributed (harness-level) */ }
  return map;
}

function attribute({ file, text, offset, bodyMap }) {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const body = /^bodies\/(\d+)\.json$/u.exec(file);
  if (body) return bodyMap.get(body[1]) ?? null;
  if (LINE_ATTRIBUTED.test(base) && text !== null && offset !== null) {
    const start = text.lastIndexOf('\n', offset) + 1;
    const end = text.indexOf('\n', offset);
    const line = text.slice(start, end < 0 ? text.length : end);
    return KEY_ARM_RE.exec(line)?.[1] ?? JSON_ARM_RE.exec(line)?.[1] ?? (line.includes('|SP|') ? 'SP' : null);
  }
  if (base === 'calls.jsonl') return null;
  return ARM_RE.exec(file)?.[1] ?? null;
}

/**
 * @param {string} runDir
 * @param {{canaries?: string[], skip?: RegExp}} options canary/private values to look for
 * @returns {{scannedFiles:number, scannedBytes:number, canaries:number, hits: object[], clean: boolean}}
 * Each canary hit carries `arm` when it can be attributed (null = harness-level output).
 * Matching: exact bytes (raw, JSON-escaped, URL-encoded, base64); if none matches in a file, NFKC + case-folded text containing
 * the whole canary or any 12-character window of it (offset is then a character index in the folded text, `folded: true`).
 */
export function scanRun(runDir, { canaries = [], skip = /^leakscan.*\.json$/u } = {}) {
  const needles = canaries.map((value, index) => ({ index, variants: canaryVariants(value), folded: foldedNeedles(value), length: String(value).length }));
  const bodyMap = bodyArms(runDir);
  const hits = [];
  let scannedFiles = 0;
  let scannedBytes = 0;
  for (const path of walk(runDir)) {
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (skip.test(name) || statSync(path).size === 0) continue;
    const buffer = readFileSync(path);
    const file = relative(runDir, path);
    scannedFiles++;
    scannedBytes += buffer.length;
    // Credential shapes are text; latin1 keeps byte offsets identical to the file (PNG bytes included).
    const text = buffer.toString('latin1');
    let foldedText = null;
    for (const { index, variants, folded, length } of needles) {
      const found = [];
      for (const variant of variants) for (const offset of offsetsOf(buffer, variant)) found.push({ offset, length: variant.length, folded: false });
      if (found.length === 0) {
        foldedText ??= fold(buffer.toString('utf8'));
        for (const needle of folded) for (const offset of offsetsOf(foldedText, needle)) found.push({ offset, length: needle.length, folded: true });
      }
      found.sort((a, b) => a.offset - b.offset);
      let last = null;
      for (const item of found) {
        if (last && item.offset - last.offset < Math.max(length, item.length)) continue; // one hit per occurrence
        last = item;
        const arm = attribute({ file, text: item.folded ? null : text, offset: item.folded ? null : item.offset, bodyMap });
        hits.push({ kind: 'canary', canary: index, file, offset: item.offset, length: item.length, ...(item.folded ? { folded: true } : {}), arm });
      }
    }
    for (const { kind, re } of BEARER_PATTERNS) {
      for (const match of text.matchAll(re)) {
        hits.push({ kind, file, offset: match.index ?? 0, length: match[0].length, sha256Prefix: createHash('sha256').update(match[0]).digest('hex').slice(0, 8), arm: attribute({ file, text, offset: match.index ?? 0, bodyMap }) });
      }
    }
  }
  return { scannedFiles, scannedBytes, canaries: needles.length, hits, clean: hits.length === 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [runDir, ...rest] = process.argv.slice(2);
  const flag = rest.indexOf('--canaries');
  if (!runDir || flag < 0 || !rest[flag + 1]) { console.error('usage: leakscan.mjs RUN_DIR --canaries canaries.json|a,b,c'); process.exit(64); }
  const spec = rest[flag + 1];
  let canaries;
  try { canaries = JSON.parse(readFileSync(spec, 'utf8')); } catch { canaries = spec.split(','); }
  if (!Array.isArray(canaries)) canaries = Object.values(canaries);
  const result = { scannedAt: new Date().toISOString(), ...scanRun(runDir, { canaries: canaries.map(String) }) };
  writeFileSync(join(runDir, 'leakscan.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ clean: result.clean, hits: result.hits.length, scannedFiles: result.scannedFiles }));
  process.exit(result.clean ? 0 : 1);
}

#!/usr/bin/env node
/**
 * verify-staging-registration.mjs — story 10.19, AC-15.
 *
 * Fails the day the staging-acceptance register and the manifest disagree.
 *
 * WHY THIS EXISTS. `ED-02`'s ownership gap sat unnoticed for five waves because nothing compared
 * what the epic's documents claimed against what its manifest actually said. This script makes that
 * particular silence impossible in both directions:
 *
 *   - an id the register calls `blocked` that no longer reads `open`/`OPEN` in its source of truth
 *     — the gate may have opened and nobody updated the register;
 *   - an id the register calls `resolved` that still reads `open`/`OPEN` — a false green.
 *
 * PLAIN-TEXT EXTRACTION IS A NAMED CHOICE, NOT AN OVERSIGHT. This script does not parse YAML. Its
 * only job is to compare two small, stable text shapes, and adding a YAML-parsing dependency to a
 * `docs/` guard would be disproportionate. Recorded here so a reader knows it was decided.
 *
 * THE SOURCE PATHS ARE NOT OVERRIDABLE, DELIBERATELY. A `--manifest=` flag would let anyone satisfy
 * this guard by pointing it at a doctored copy. Mutation testing of this script mutates the real
 * files and restores them byte-identically (`shasum -a 256`), which is what story 10.19's Dev Agent
 * Record shows.
 *
 * Exit 0 = every check passed. Exit 1 = at least one check failed; every failure is printed with
 * the id and the direction of the mismatch. Exit 2 = the script could not read a source at all.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..'); // docs/qa/scripts -> repo root

const P = {
  manifest: join(REPO, 'docs/epics/EPIC-10-EXECUTION.yaml'),
  spikes: join(REPO, 'docs/architecture/studio-staging-spikes.md'),
  register: join(REPO, 'docs/qa/staging-acceptance-register.md'),
  story: join(REPO, 'docs/stories/10.19.story.md'),
  runbook: join(REPO, 'docs/runbooks/studio-runner.md'),
  trial: join(REPO, 'docs/qa/research/studio-user-trial.md'),
};

const failures = [];
const notes = [];
const fail = (check, message) => failures.push(`[${check}] ${message}`);
const rel = (p) => relative(REPO, p);

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    console.error(`FATAL: cannot read ${rel(path)} — ${error.message}`);
    process.exit(2);
  }
}

/** Collapse all whitespace so a substring check is not defeated by a line wrap. */
const flat = (s) => s.replace(/\s+/g, ' ');

// ───────────────────────────────────────────────────────────────────────────
// Sources of truth
// ───────────────────────────────────────────────────────────────────────────

/** `external_dependencies:` → { 'ED-01': { status, owner }, … }. Stops at the next column-0 key. */
function readManifestDependencies(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l === 'external_dependencies:');
  if (start === -1) return {};
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^[A-Za-z_][A-Za-z0-9_]*:/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const out = {};
  let current = null;
  for (const line of lines.slice(start + 1, end)) {
    const id = line.match(/^ {2}- id:\s*(ED-\d+)\s*$/);
    if (id) {
      current = id[1];
      out[current] = { status: null, owner: null };
      continue;
    }
    if (!current) continue;
    const status = line.match(/^ {4}status:\s*(.+?)\s*$/);
    if (status && out[current].status === null) out[current].status = status[1];
    const owner = line.match(/^ {4}owner:\s*"?(.+?)"?\s*$/);
    if (owner && out[current].owner === null) out[current].owner = owner[1];
  }
  return out;
}

/** `## SPK-0N — …` sections → { 'SPK-01': 'OPEN.', … }, read from the section, not the summary table. */
function readSpikeResults(text) {
  const out = {};
  const sections = text.split(/^## (SPK-\d+)\b.*$/m);
  for (let i = 1; i < sections.length; i += 2) {
    const id = sections[i];
    const body = sections[i + 1] ?? '';
    const result = body.match(/^\*\*Result\.\*\*\s*(.+?)\s*$/m);
    if (result) out[id] = result[1];
  }
  return out;
}

/** Story ids the manifest declares out of this backlog. Only leading `Stories X–Y` / `Story X` clauses count. */
function readExcludedStoryIds(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => /^\s*not_in_this_backlog:\s*$/.test(l));
  if (start === -1) return [];
  const indent = lines[start].match(/^(\s*)/)[1].length;
  const entries = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const here = line.match(/^(\s*)/)[1].length;
    if (here <= indent) break;
    const item = line.match(/^\s*-\s*"?(.*)$/);
    if (item) entries.push(item[1]);
  }
  const ids = new Set();
  for (const entry of entries) {
    const range = entry.match(/^Stories\s+(\d+)\.(\d+)\s*[-–—]\s*(\d+)\.(\d+)/);
    if (range) {
      const [, epicA, from, epicB, to] = range;
      if (epicA === epicB) {
        for (let n = Number(from); n <= Number(to); n++) ids.add(`${epicA}.${n}`);
      }
      continue;
    }
    const single = entry.match(/^Story\s+(\d+\.\d+)/);
    if (single) ids.add(single[1]);
  }
  return [...ids];
}

/** The register's front-matter block. Plain-text, per the note at the top of this file. */
function readRegisterFrontMatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const body = match[1];
  const gates = {};
  const owners = {};
  const criteria = {};
  let mode = null;
  for (const line of body.split('\n')) {
    if (/^gate_registration:\s*$/.test(line)) { mode = 'gates'; continue; }
    if (/^gate_owner:\s*$/.test(line)) { mode = 'owners'; continue; }
    if (/^blocked_criteria:\s*$/.test(line)) { mode = 'criteria'; continue; }
    if (/^[A-Za-z_]/.test(line)) { mode = null; continue; }
    if (mode === 'gates') {
      const m = line.match(/^ {2}((?:ED|SPK)-\d+):\s*(\S+)\s*$/);
      if (m) gates[m[1]] = m[2];
    } else if (mode === 'owners') {
      const m = line.match(/^ {2}((?:ED|SPK)-\d+):\s*"(.+)"\s*$/);
      if (m) owners[m[1]] = m[2];
    } else if (mode === 'criteria') {
      const m = line.match(/^ {2}(AC-\d+):\s*\[(.*)\]\s*$/);
      if (m) criteria[m[1]] = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return { gates, owners, criteria };
}

/** A `| **Field** | value |` row from a story header table. */
function storyHeaderCell(text, field) {
  const re = new RegExp(`^\\|\\s*\\*\\*${field}\\*\\*\\s*\\|(.*)\\|\\s*$`, 'm');
  const m = text.match(re);
  return m ? m[1] : null;
}

/** Body between `<!-- MARKER -->` and the next `<!-- … -->`. */
function markerBody(text, marker) {
  const open = `<!-- ${marker} -->`;
  const at = text.indexOf(open);
  if (at === -1) return null;
  const after = text.slice(at + open.length);
  const next = after.search(/<!--\s*[A-Z0-9-]+\s*-->/);
  return next === -1 ? after : after.slice(0, next);
}

// ───────────────────────────────────────────────────────────────────────────
// Checks
// ───────────────────────────────────────────────────────────────────────────

const manifestText = read(P.manifest);
const spikesText = read(P.spikes);
const registerText = read(P.register);
const storyText = read(P.story);
const runbookText = read(P.runbook);

const deps = readManifestDependencies(manifestText);
const spikes = readSpikeResults(spikesText);
const front = readRegisterFrontMatter(registerText);

// --- Vacuity guards. A check over an empty set passes for the wrong reason. ---

if (Object.keys(deps).length === 0) {
  fail('vacuity', `no external_dependencies parsed from ${rel(P.manifest)} — the shape changed, or the block is gone`);
}
if (Object.keys(spikes).length === 0) {
  fail('vacuity', `no spike Result lines parsed from ${rel(P.spikes)} — the shape changed`);
}
if (!front) {
  fail('vacuity', `${rel(P.register)} has no front-matter block; nothing to compare`);
} else if (Object.keys(front.gates).length === 0) {
  fail('vacuity', `${rel(P.register)} front matter declares no ids under gate_registration`);
}

const sources = { ...Object.fromEntries(Object.entries(deps).map(([k, v]) => [k, v.status])), ...spikes };
const isOpen = (value) => /^open\b/i.test(String(value).trim());

// --- (1)/(2) The two directions of the register/source comparison. ---

if (front) {
  for (const [id, claim] of Object.entries(front.gates)) {
    if (!(id in sources)) {
      fail('register-sync', `${id}: the register declares it "${claim}", but no such id exists in ${rel(id.startsWith('ED') ? P.manifest : P.spikes)}`);
      continue;
    }
    const actual = sources[id];
    if (claim === 'blocked' && !isOpen(actual)) {
      fail('register-sync', `${id}: the register says BLOCKED, but its source of truth now reads "${actual}". The gate may have opened and the register was not updated — re-read it and update the criterion, do not leave it marked skipped by inertia.`);
    } else if (claim === 'resolved' && isOpen(actual)) {
      fail('register-sync', `${id}: the register says RESOLVED, but its source of truth still reads "${actual}". That is a false green.`);
    } else if (claim !== 'blocked' && claim !== 'resolved') {
      fail('register-sync', `${id}: the register declares "${claim}"; only "blocked" or "resolved" are meaningful here`);
    }
  }

  // Completeness: a new id in a source that the register never learned about.
  for (const id of Object.keys(sources)) {
    if (!(id in front.gates)) {
      fail('register-sync', `${id}: exists in its source of truth but is absent from the register's front matter entirely`);
    }
  }

  // Ownership. The gap this guard is named for was an OWNERSHIP gap, not a status one: ED-02's
  // owner read TBD for five waves and no document noticed. A guard that compares only status would
  // not have caught it. Restricted to ED ids on purpose: the manifest states each ED owner on one
  // `owner:` line, which is checkable, whereas spike owners live in a markdown table column and
  // parsing them would add brittleness for no extra coverage of the failure being guarded.
  for (const id of Object.keys(deps)) {
    const expected = front.owners[id];
    if (!expected) {
      fail('register-sync', `${id}: the register's front matter declares no gate_owner anchor. An owner that nothing compares is an owner that can go stale unnoticed — which is exactly what happened to ED-02.`);
      continue;
    }
    const actual = deps[id].owner;
    if (actual === null) {
      fail('register-sync', `${id}: no owner: line found in the manifest, but the register anchors its owner on "${expected}"`);
    } else if (!flat(actual).toLowerCase().includes(flat(expected).toLowerCase())) {
      fail('register-sync', `${id}: OWNER MISMATCH. The register anchors the owner on "${expected}"; the manifest now reads "${actual}". One of the two moved and the other did not.`);
    }
  }
  for (const id of Object.keys(front.owners)) {
    if (!(id in deps)) {
      fail('register-sync', `${id}: the register declares a gate_owner anchor for an id that has no external_dependencies entry`);
    }
  }

  // Every id a blocked criterion names must be a declared gate.
  for (const [ac, ids] of Object.entries(front.criteria)) {
    for (const id of ids) {
      if (!(id in front.gates)) {
        fail('register-sync', `${ac} is declared blocked on ${id}, which the register's gate_registration does not declare`);
      }
    }
  }
}

// --- (i) The literal GA-sign-off disclaimer sentence. ---

const DISCLAIMER =
  'This document records staging technical acceptance. It does not assert that Security & Compliance, ' +
  'Platform/Infra, or Business Sponsor sign-off (BRD §11) has occurred.';

if (!flat(registerText).includes(DISCLAIMER)) {
  fail('i/disclaimer', `${rel(P.register)} does not carry the literal GA-sign-off disclaimer sentence:\n           "${DISCLAIMER}"`);
}

// --- (ii) The SPK-02…SPK-06 evidence scaffolds. ---

const SCAFFOLDS = ['SPK-02', 'SPK-03', 'SPK-04', 'SPK-05', 'SPK-06'];
const missingScaffolds = SCAFFOLDS.filter((id) => !existsSync(join(REPO, `docs/qa/spikes/${id}/README.md`)));
if (missingScaffolds.length > 0) {
  fail('ii/scaffolds', `missing evidence-record scaffold(s): ${missingScaffolds.map((id) => `docs/qa/spikes/${id}/README.md`).join(', ')}`);
}

// --- (iii) Story 10.19 must name no id the manifest excludes from this backlog. ---

const excluded = readExcludedStoryIds(manifestText);
if (excluded.length === 0) {
  fail('vacuity', `no excluded story ids parsed from the manifest's not_in_this_backlog block — check (iii) would pass for the wrong reason`);
} else {
  for (const field of ['Depends on', 'Blocks']) {
    const cell = storyHeaderCell(storyText, field);
    if (cell === null) {
      fail('iii/backlog', `story 10.19's header has no "${field}" row; the check cannot run`);
      continue;
    }
    for (const id of excluded) {
      if (new RegExp(`(?<![\\d.])${id.replace('.', '\\.')}(?![\\d])`).test(cell)) {
        fail('iii/backlog', `story 10.19's "${field}" names ${id}, which the manifest's not_in_this_backlog list excludes from this backlog`);
      }
    }
  }
  notes.push(`(iii) checked story 10.19's Depends on / Blocks against ${excluded.length} excluded id(s): ${excluded.sort().join(', ')}`);
}

// --- (iv) The runbook's rollback section keeps AC-9's four sub-parts. ---

const ROLLBACK_PARTS = [
  { marker: 'ROLLBACK-A-KILL-SWITCH', part: '(a)', requires: ['kill switch', 'already-admitted'] },
  { marker: 'ROLLBACK-B-HELM-ROLLBACK', part: '(b)', requires: ['helm rollback'] },
  { marker: 'ROLLBACK-C-FORWARD-ONLY-MIGRATIONS', part: '(c)', requires: ['forward-only', 'Flyway'] },
  { marker: 'ROLLBACK-D-EVIDENCE-UNAFFECTED', part: '(d)', requires: ['addressed by key', '30-day'] },
];
const MIN_SUBSTANCE = 300; // non-whitespace characters; a surviving marker over deleted prose is not a sub-part

for (const { marker, part, requires } of ROLLBACK_PARTS) {
  const body = markerBody(runbookText, marker);
  if (body === null) {
    fail('iv/rollback', `${rel(P.runbook)} has lost AC-9 sub-part ${part}: marker <!-- ${marker} --> is absent`);
    continue;
  }
  const substance = body.replace(/\s/g, '').length;
  if (substance < MIN_SUBSTANCE) {
    fail('iv/rollback', `AC-9 sub-part ${part} (<!-- ${marker} -->) has only ${substance} non-whitespace characters of body; the marker survives but the sub-part does not`);
  }
  const flatBody = flat(body).toLowerCase();
  for (const phrase of requires) {
    if (!flatBody.includes(phrase.toLowerCase())) {
      fail('iv/rollback', `AC-9 sub-part ${part} (<!-- ${marker} -->) no longer says "${phrase}"`);
    }
  }
}

// --- (v) The user-trial record keeps AC-13(f)'s structure. PRESENCE, NOT TRUTH. ---

const TRIAL_MARKERS = [
  ['TRIAL-SESSION-DATES', 'session date(s)'],
  ['TRIAL-FACILITATOR', 'facilitator'],
  ['TRIAL-PARTICIPANTS', 'anonymised participant ids (3–5, none of them the test author)'],
  ['TRIAL-REVISION', 'the confirmed revision id and hash shown'],
  ['TRIAL-SCORES', 'one score row per participant'],
  ['TRIAL-RATIO', 'the confirmation-to-edit ratio'],
];

if (!existsSync(P.trial)) {
  fail('v/trial', `${rel(P.trial)} does not exist; AC-13(f)'s structure cannot be present`);
} else {
  const trialText = readFileSync(P.trial, 'utf8');
  for (const [marker, what] of TRIAL_MARKERS) {
    if (!trialText.includes(`<!-- ${marker} -->`)) {
      fail('v/trial', `${rel(P.trial)} is missing the ${what} section (<!-- ${marker} -->)`);
    }
  }
  notes.push('(v) is a PRESENCE check, not a truth check. It cannot tell a real session record from a plausible-sounding paragraph. Only a human reading the file can.');
}

// ───────────────────────────────────────────────────────────────────────────
// Report
// ───────────────────────────────────────────────────────────────────────────

const declared = front ? Object.keys(front.gates).length : 0;
console.log('verify-staging-registration — story 10.19 AC-15');
console.log(`  manifest external_dependencies : ${Object.keys(deps).length} id(s) — ${Object.entries(deps).map(([k, v]) => `${k}=${v.status}`).join(', ') || 'none'}`);
console.log(`  spike register Result lines    : ${Object.keys(spikes).length} id(s) — ${Object.entries(spikes).map(([k, v]) => `${k}=${String(v).replace(/\.$/, '')}`).join(', ') || 'none'}`);
console.log(`  register front matter          : ${declared} id(s) declared`);
for (const note of notes) console.log(`  note: ${note}`);

if (failures.length > 0) {
  console.error(`\nFAIL — ${failures.length} mismatch(es):\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error('');
  process.exit(1);
}

console.log('\nPASS — the register, the manifest and the spike register agree, and every completeness check holds.');

#!/usr/bin/env node
'use strict';
// Re-pins docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json to the CURRENT packaged schema
// bundle, by exact string replacement (the 22 MB file keeps its layout). Use it only if the bundle hash moved again
// after model-sizing.patch (for example a second v3 schema edit in the same window); the patch already carries the
// MODEL-SIZING value. What it rewrites, and nothing else:
//   - every "schemaBundleHash" that equals build.schemaBundleHash (108 occurrences on 2026-10-18; the two "ffff..."
//     negative cases are left alone);
//   - the recorded buildHash of that build (job.binding.replayGrant.buildHash and examples.ObservedJob...): hash(build).
// Source of truth: tools/check-studio-observed-contracts.cjs asserts build.schemaBundleHash ==
// hash(studio-runner/src/validator/observedSchemas.json) and tools/check-studio-current-catalog.cjs line 59 asserts the same.
//   node repin-publication-fixtures.cjs [repoRoot=.] [--dry-run]
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.');
const dry = process.argv.includes('--dry-run');
const fixtureFile = path.join(root, 'docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json');
const bundleFile = path.join(root, 'studio-runner/src/validator/observedSchemas.json');
const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : JSON.stringify(v);
const hash = v => crypto.createHash('sha256').update(canon(v), 'utf8').digest('hex');
const text = fs.readFileSync(fixtureFile, 'utf8');
const fixture = JSON.parse(text);
const newBundle = hash(JSON.parse(fs.readFileSync(bundleFile, 'utf8')));
const oldBundle = fixture.build.schemaBundleHash;
const oldBuildHash = hash(fixture.build);
const newBuildHash = hash({ ...fixture.build, schemaBundleHash: newBundle });
if (oldBundle === newBundle) { console.log('already pinned to ' + newBundle); process.exit(0); }
const count = (needle) => text.split(needle).length - 1;
const recorded = fixture.job.binding.replayGrant.buildHash;
if (recorded !== oldBuildHash) { console.error('refused: job.binding.replayGrant.buildHash is not hash(build); the file is not in the expected state'); process.exit(1); }
const report = { oldBundle, newBundle, oldBuildHash, newBuildHash, bundleOccurrences: count(oldBundle), buildHashOccurrences: count(oldBuildHash) };
console.log(JSON.stringify(report, null, 2));
if (dry) process.exit(0);
const next = text.split(oldBundle).join(newBundle).split(oldBuildHash).join(newBuildHash);
fs.writeFileSync(fixtureFile, next);
console.log('rewrote ' + path.relative(root, fixtureFile) + '; now run: node tools/check-studio-observed-contracts.cjs');

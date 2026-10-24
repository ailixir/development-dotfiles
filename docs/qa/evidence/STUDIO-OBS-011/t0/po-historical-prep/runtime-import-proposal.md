# Proposed historical runtime reconciliation — root only, not executed

Wait for root's terminal B1 + B7 disposition and quoted-writer release. Revalidate the hashes/state recorded in `audit.json` and archive the two original state files before any import. Do not execute this as a normal phase rerun. No story, QA, .ai or README edit is part of these commands.

The existing Sequence Lock allows explicit skips. The public manual `sdc mark` command passes the `--outcome` option for skipped reviews to `progress.markPhase`; its approved branch selects `close` before the ordinary pending-phase search. A skipped review without `--outcome approved` would incorrectly select `apply_qa_fixes` for this purpose. This behavior was simulated on cloned state only in `runtime-import-simulation.json` using the actual implementation.

The timestamps created by these commands are **import timestamps now**, not fabricated dates of past verification. Imported phases remain **skipped**, not passed. Existing `validate=passed` metadata is preserved. The unused `apply_qa_fixes=pending` field remains; it is the unused branch when historical review was approved, and the actual runtime accepts this. Do not invent a fix loop or change its count.

## 015: import already-completed historical work

The actual PO closure transaction already exists: story hash and protected sections equal the immutable close report, with exactly one matching key in story and index. The source drift is later work, and the import makes no claim that today's source equals the old QA revision. The public gate's old pending lifecycle text is superseded by the story's explicit independent QA transition, not changed here.

```sh
node tools/aiox-local.cjs sdc mark STUDIO-OBS-015 develop --status skipped --notes 'Historical import at current timestamp. Story already QA Done. Develop verifier currently fails Done-before-close integrity; it is not marked passed. Existing development was completed before runtime reconciliation. Evidence: docs/qa/evidence/STUDIO-OBS-011/t0/po-historical-prep/audit.json. No prior verification invented.'
node tools/aiox-local.cjs sdc mark STUDIO-OBS-015 review --status skipped --outcome approved --notes 'Historical independent Quinn CONCERNS and QA InReview-to-Done at story 0.1.21 imported. No new review or QA verdict. Reviewed source 9d18f5550ac830bd2164bf4b4261f6d10ec8fd43b837e4bf9e9c990dc7cb5884 differs from current later-story source. Existing QA provenance and historical limits retained. Evidence: po-historical-prep/audit.json.'
node tools/aiox-local.cjs sdc mark STUDIO-OBS-015 close --status skipped --notes 'Historical administrative transaction imported, not rerun. Existing .ai/STUDIO-OBS-015-close.json and exactly one story/index closure key verified; current story and all eight protected sections equal recorded post-close hashes. No new closure, source verification or lifecycle transition claimed. Evidence: docs/qa/evidence/STUDIO-OBS-011/t0/po-historical-prep/audit.json.'
node tools/aiox-local.cjs sdc status STUDIO-OBS-015 --json
```

Expected runtime: completed, currentPhase null; develop/review/close skipped. This imports the existing historical completion only. Re-run read-only story/index/hash checks after the actual import; preserve the original state archive and import receipt. The full goal remains active.

## 008: import development/QA history only, retain close pending

No administrative closure exists in the authoritative story/index. Current source/dist do not equal the historical QA binding. Importing the old lifecycle must not imply that this missing PO transaction passed the current close gate.

```sh
node tools/aiox-local.cjs sdc mark STUDIO-OBS-008 develop --status skipped --notes 'Historical import at current timestamp. Story already QA Done. Develop verifier currently fails Done-before-close integrity; it is not marked passed. Existing development was completed before runtime reconciliation. Evidence: docs/qa/evidence/STUDIO-OBS-011/t0/po-historical-prep/audit.json. No prior verification invented.'
node tools/aiox-local.cjs sdc mark STUDIO-OBS-008 review --status skipped --outcome approved --notes 'Historical independent Quinn CONCERNS and QA InReview-to-Done at story 0.3.18 imported. No new review or QA verdict. Reviewed source 50692d55e40807f67bf959f0d9672d9305d69b72ad693860506a3f7055e12dd3 differs from current later-story source. Actual new close HARD_FAIL: current-revision binding mismatch; close remains pending. Evidence: docs/qa/evidence/STUDIO-OBS-011/t0/po-historical-prep/audit.json.'
node tools/aiox-local.cjs sdc status STUDIO-OBS-008 --json
```

Expected runtime: running, currentPhase close; develop/review skipped, close pending. **Do not mark close passed or skipped for 008.** Root can instead leave its runtime untouched and retain this proposal; neither option changes its legitimate QA Done lifecycle.

## Limits

- No dedicated import command validates these historical claims automatically. The explicit evidence-backed skips are the supported API route; root owns whether to adopt them.
- Never use `plan --force`: that would reset historical state and the Done resume-hint path would label every phase passed, concealing the actual missing 008 administrative transaction.
- Never call `verify develop --mark` on these Done stories; it would record a known integrity failure. Never manually mark develop passed to suppress it.
- Do not call `verify close --mark` as a substitute for the actual close task. CLI field linkage does not compare source hashes or ensure a keyed administrative write exists.
- Do not backdate import timestamps, reset QA Done, change public QA verdicts, rewrite historical manifests, run current failed 011 evidence backward into old stories, or fabricate an 008 close artifact.
- A future 008 close needs a real owner-approved, independently supported revision/provenance resolution under the canonical close task. This proposal does not authorize that missing evidence or claim it already exists.

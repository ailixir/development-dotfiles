# 11-DOC off-tree design — 2026-10-19 UTC (2026-10-18 EDT continuation)

Scope: STUDIO-OBS-011 AC-6, C-OBS009-3, CLN-49/51 and the CLN-44 inventory addendum; G11 dated-record preservation. This is preparation only under the original B1 source/quoted-input freeze. Declared dispatch budget USD500; actual spend unavailable. No lifecycle, QA, release or deployment verdict.

## Inputs and ownership

Read AGENTS.md, the Codex resume handoff, 011 story/inventory, lanes.v5.json and its adopted w-brief.v4.md, C-OBS009-3 required text, RC-8/R-EPv2, CLN-49/51 and G11. The source-of-truth developer role was read; its devLoadAlwaysFiles and pt/es fallback files are absent. No greeting script or fallback runtime was run because the parent explicitly permits static work only.

Seven targets: CLAUDE.md; AGENTS.md (root-only patch); ARCH.md; docs/runbooks/studio-inference-rollout.md; docs/runbooks/studio-runner.md; studio-runner/README.md (root-only patch); docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md (append-only dated addendum). Produce complete repo-shaped previews, original/output hashes and exact unified patches. No actual target changes.

## Change design

- CLN-51: identical Mock-First/Environment wording in CLAUDE/AGENTS: Node-only MSW Vitest server and Playwright proxy, Vite API proxy and Webpack override as actually read, no browser worker; preserve user functional-only accessibility byte-for-byte. ARCH live mechanism bullets corrected; the recorded §3.2 plan retained and annotated with a dated note.
- CLN-49/RC-8: retain historical rollout records and place a dated current-scope note before the retired flag paragraph; label that paragraph historical. Remove only the live complete-API-lifecycle assertion; keep independent fixture-oracle wording because R-EPv2 retains the oracles. No new enablement advice beyond current source.
- C-OBS009-3 README: remove retired Bounds, Accepted language and role/visible subsections, Fixture corpora and Adding reference sections; remove validateArtifact prose/route row. Other stale overview/routes/artifact1 prose is reported as an unresolved scope finding, not silently edited. Preserve current Node24/TLS/authorization/guided/replay policy sections. Add explicit dated single-path context and retained-fixture pointer rather than claiming deleted engine APIs work.
- C-OBS009-3 runbook: static source cross-reference re-audit for §§1–3/5–13 only; retain all historical paragraphs and add dated scope corrections at each section start. Correct the live §2 callback-api destination row to include guided connector port; preserve §4 and §14 bytes, including historical §14.6 gap text. No new UAT, TLS, token issuer, approved-target, CSRF, identity, cloud or shared-environment acceptance.
- Inventory: append a dated, preview-only re-verification addendum for CLN44/49/51/C-OBS009-3 with source hashes/counts, named unresolved inputs, no retroactive row/totals/status change.

## Static validation design

Use Python standard library only: SHA256 exact originals/outputs and section extraction; unified-patch strict reconstruction against current originals in memory; runbook diff ranges confined to header notes/§§1–3,5–13 with §4/§14 identical; inventory prefix identical; dated lines removed only in explicitly live README engine text; CLN51 range equality; accessibility text equality; source-reference existence and static evidence receipts. Record applicability as current snapshot evidence, not permission to apply. Future root commands must first check baseline/quoted-writer/ownership/tree-open gates and expected original hashes. No test/build/formatter/Node/Docker/provider/process signal/git mutation.

## Pre-draft refinements

- §14.4 already contains the UAT upgrade note required by X6. Record it present; actual deployment inputs remain external and are not a new11DOC blocker. §14.6 remains historical byte-for-byte despite the scoped §2 callback correction.
- The CLN51 proposal loosely groups dev-server variables. Source proves Vite reads VITE_API_URL, while the active Webpack config reads REACT_APP_API_BASE_URL with its /api suffix removed; both default to http://localhost:8080. Use identical accurate wording in CLAUDE/AGENTS and cite this delta for root confirmation.
- Preserve all README text outside the explicitly named artifact1 engine sections, the validateArtifact route row and the Security model parser paragraph. Additional stale items become named unresolved findings.

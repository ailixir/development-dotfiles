# 11-DOC engineering documentation preview receipt

Prepared by Dex, 2026-10-18 EDT continuation. Declared budget USD500; actual spend unavailable.
This is off-tree preparation under the original B1 freeze. No actual target was applied and no
lifecycle, QA, release or deployment verdict is issued.

The seven complete previews and exact original snapshots are repo-shaped under `preview/` and
`originals/`. [manifest.json](manifest.json) records every exact original/output SHA256, byte
count, patch path and root-only flag. Each target also has an individual patch in `patches/`.
Five ordinary documentation targets are grouped in `patches/authored-docs.patch`; AGENTS.md and
studio-runner/README.md are grouped only in `patches/root-merge-only.patch`. The combined patch
is supplied for static applicability review. `AGENTS.md.patched` and `README.md.patched` are
byte-identical aliases for the two root-only full previews.

The patch set addresses CLN-49, CLN-51 and the specifically named C-OBS009-3 engine sections.
The rollout's retired flags remain in a clearly marked historical paragraph, consistent with
G11. The stale complete-API-lifecycle claim is removed; independent fixture-oracle wording is
retained because R-EP v2 carries the oracle/report layer. ARCH's recorded MSW plan is retained
with a dated correction. The inventory only gains a dated addendum; no row, total or lifecycle
is rewritten. CLN-44 is explicitly 61 chart tokens / 53 closed chart keys / 57 loader keys,
with the static subset proof and four direct/default loader keys named.

Runbook sections 1–3 and 5–13 were audited against current source; dated corrections qualify
old V1 descriptions and the §2 ingress/callback rows reflect the actual template. The original
header records remain. Section 4 is unchanged (4,265 bytes), SHA256
`0ec43db021800e114517d66899f827a8cf5e45ebdd23356785e4380a497af259`.
Section 14 is unchanged (12,392 bytes), SHA256
`4d83b3594c7cab2daa4a4505df1088dbc43c74e55ee4e6f1e9c552ff07880e66`.
The UAT note already present in §14.4 satisfies the note prerequisite; actual certificate,
Secret, issuer and deployed-stack inputs remain external and are not new 11-DOC/T0 blockers.
Unchanged §14.6's historical missing-row statement is explained by the new dated §2/header notes.

Static verification executed successfully: Python standard-library verifier exit 0; all seven
strict unified patches reconstructed their previews in memory; all actual target hashes still
equal their originals; the combined `patch --dry-run --batch -p1` returned exit 0 without fuzz or
offset messages. No dated line was removed. CLN-51 relevant ranges match exactly between
CLAUDE/AGENTS, and their functional-only accessibility text is byte-preserved. The README's
Versions section through EOF is byte-identical, preserving current Node/TLS/guided/authorization
scope. Named additional stale README statements remain disclosed for root disposition.

Evidence:

- [static-checks.json](static-checks.json): original/output/actual hashes, exact reconstruction,
  preserved sections, source marker locations and source hashes, absence controls and limits.
- [allowed-range-and-dated-text-deltas.json](allowed-range-and-dated-text-deltas.json): every
  original/output line interval, section and byte delta; zero removed dated lines.
- [runbook-static-audit.json](runbook-static-audit.json): all 12 scoped section subjects,
  primary sources, observed static findings and the remaining proof limits.
- [cln44-key-census.json](cln44-key-census.json): complete key/token sets and zero unknown closed keys.
- [patch-applicability.json](patch-applicability.json): exact read-only command and captured result.
- [unresolved-facts.json](unresolved-facts.json): ten named facts/owners, including root wording
  confirmation, the current gateway-prefix/legacy guard discrepancy, additional stale README
  prose, R-AI archive receipt and external evidence.
- [future-verification.md](future-verification.md): runnable static and staged root commands.

No runtime, build, test runner, formatter, Node script, Docker, provider call, signal or git
mutation was executed. Only this assigned evidence directory was written. Actual application
waits for B1/B7/root tree-open, quoted-writer/file ownership, wording confirmation, and root's
11-MERGE for the two root-only patches. No new dispatch was made by this lane.

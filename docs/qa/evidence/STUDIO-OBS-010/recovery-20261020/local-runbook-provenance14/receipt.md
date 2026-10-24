# OBS010 runbook provenance bookkeeping

Date: 2026-10-21. Role: analyst documentation bookkeeper. Authority: root task/context `obs010-runbook-provenance14-context.txt` after genuine independent local PM and QA acceptance.

Changed only line 3 of `docs/runbooks/studio-guided-authoring.md`. The earlier `UNAPPLIED; current independent PM/QA review pending` statement is replaced with links to the actual PM10 and QA11 decisions, their 2026-10-21 date, and the explicit qualification **with external rows pending**. Original preparation dates, author attribution and draft-provenance history are retained.

The independent decisions accept early-T2 local AC-5 documentation content only. PM's verdict is `LOCAL_DOC_PM_ACCEPTED_WITH_EXTERNAL_ROWS_PENDING`; QA's verdict is `LOCAL_DOC_QA_ACCEPTED_WITH_EXTERNAL_ROWS_PENDING`. This administrative update supplies no additional independent verdict and no formal story quality-gate decision.

| Check | Observed result |
|---|---|
| Whole runbook before edit | SHA256 `6ba937d80f9da90b5a7c5671567ebf7471170ebc5c72e7309d868363e1e94dee`, matching the reviewed content |
| PM10 authority manifest | SHA256 `c2ac23c37155112616768eecbd23d20a2ba1114f2d49c9ab655cebe1cc38bc01`, rehashed before edit; actual review read |
| QA11 authority manifest | SHA256 `6367ba0128f36bdffa249a720f49583283eeddf45a07fe761e6e91592d4d3ba3`, rehashed before edit; actual review read |
| Whole runbook after edit | SHA256 `0c57fc018435317d3a583153aa7f230fe038ac68ca0c2ac68b1764df9447c174` |
| File mode before / after | `0644` / `0644` |
| Exact change | One removed provenance line and one replacement provenance line, preserved in `change.patch` |
| Body preservation | Re-read replacement line matched the intended banner. A read-only `sed` stream substituting the original line back at line 3 hashes to the exact whole pre-edit digest `6ba937d80f9da90b5a7c5671567ebf7471170ebc5c72e7309d868363e1e94dee`; all other bytes are therefore unchanged |
| Canonical OBS010 before / after | SHA256 `6363b2b1053fab69cd840998e1cff0e7683e6f0080839df74c6af5f05788d41c` / same; InProgress preserved |

All reviewed row bodies, current preview/shared-environment/no-deployment-or-release-approval paragraphs, links, pending T4 blank and paired disclosure requirements remain unchanged. No task checkbox, AC-5/T2/story completion, Live-list re-date/sign-off, pilot, deployment, release or external gate was promoted. Existing 009 Done and D-C PASS gates still apply to the pilot. External approvals, named owners/secret references, T4 measurements, pricing/spend/headroom and participant consent were not inferred from local PM/QA acceptance.

Only the runbook provenance line and this fresh evidence directory were written. No tests were warranted for this one-line administrative correction. No source capture, private body/SDK, app parser/import/compiler/runtime, lifecycle CLI, backend/native/Gradle/Docker, provider/network, Git, GUI, pointer, ledger or delegation operation occurred. Metadata reads and the reversal hash check were the only verification commands. SHA output completed despite the environment's existing Perl locale fallback warning.

# Independent narrow re-review — LEFT-DATA-01 correction

Quinn (@qa), 2026-10-18 EDT, using the already loaded QA role/skill. Read the complete original LEFT review, corrected complete data package, actual historical probe and immutable V14 trigger. **LEFT-DATA-01 is corrected within static scope. No remaining mandatory correction was found in this narrow re-review.** The corrected complete five-path data draft plus unchanged eleven-path main draft is statically supported as the reviewed sixteen-path unit, subject to every existing application/execution condition below. This is not W1, runtime, lane-exit, final QA, source-application or lifecycle approval. Shared USD500 ceiling declared; actual spend unavailable.

## Actual oracle and sufficiency

The original historical `probeHistoricalAdapter` performs the expiry UPDATE before its historical writer and expects RuntimeException, then compares the authority-row snapshot. V14 rejects a change to either `expires_at` or document.expiresAt through `tr_guided_identity` BEFORE UPDATE with `guided identity is immutable`. The original fixture starts with future expiry and no later migration replaces/removes that guard. Accordingly the old probe's actual expiry subject is the **SQL immutability rejection and rollback**, not independently reached Java commit expiry authority.

The earlier draft's narrower GuidedSessionException assertion incorrectly claimed the latter. The correction removes expiry alone from that Java loop and preserves it as a distinct SQL tier. It sets rollback-only before UPDATE, expects DataAccessException, inspects the most-specific PSQLException cause, pins P0001 and the exact nonnull server message, and checks the same complete draft/session/revision/receipt/attempt snapshot. That SQL transaction contains **no publication writer call**. If the UPDATE unexpectedly succeeds, the thrown-exception assertion fails while rollback-only prevents persistence. The state/worker/pointer Java probes retain their existing narrower exception type, rollback and snapshots; there is no catch-all broadening.

This preserves the original actual oracle and makes its tier more precise. **No new Java-expiry gate is introduced solely from the earlier mistaken claim, and no Java-expiry proof is granted.** The prior review's conditional request for a genuinely reaching Java-expiry setup applies only if someone chooses to make that additional claim; the corrected package explicitly does not. Existing production expiry behavior remains unchanged. The real PostgreSQL clock/lease/deadline discussion is a source-derived limitation, not a universal impossibility proof or an executed timing result. No migration, trigger, clock, deadline, production writer or shared fixture lifetime is altered to obtain acceptance.

## Exact delta and preserved complete scope

Independent comparison proves the only candidate Java change versus the reviewed parent data draft is removal of the expiry list item plus insertion of that separate SQL tier. Removing the new SQL tier and applying the exact old expiry-item deletion reconstructs the corrected publication test byte-for-byte. The other four data paths, all eleven main paths and their complete prior subject coverage remain unchanged. No source test method, original Java-held assertion or named retirement is silently removed by this correction.

- All P1/P2/P3 and J1/J2/J4 subjects remain as previously reviewed. J8 retains all four actual original subjects: nonnull pointer, state, worker and immutable expiry mutation, with the expiry tier honestly distinguished. The real two-publication pointer positive control, Java negative rollback and complete snapshots remain.
- All five mutant patches are byte-identical to the prior prepared patches and each remains `executed:false`; their target preimages are unchanged. No mutant red, restoration or restored green is credited.
- The existing source-case delta remains80→78: four retired InferenceMigrationIT methods, one P1 Latest addition, one publication J2/J4/J8 addition, all55 Prefix methods retained. Only P3's intended original prefix method is changed. These are source method counts, not runtime invocations.
- `captureSharedBootstrap` and helper tail from contains remain exact. Existing head signatures/importer obligations, current SQL guards, closed-key/FK/null-receipt/fault-after-write subjects and no-fake SQLSTATE qualifications remain as in the complete prior review.
- Current v7's exact four-match V20 allowance/file+line hashes remain valid; broad78→4 and V18-specific70→0 are independently verified again. The unowned V20 fixture is unchanged and no sixth data path is introduced. All22 immutable migration hashes still equal S_011.

## Independent integrity evidence

The review-local lightweight Python verifier reuses the original preservation/reconstruction checks and adds narrow correction checks; all pass. It reconstructs every output/deletion of the complete sixteen-path atomic unit in memory against actual owned preimages, with no patch application or git operation. Every owned preimage still equals S_011; no global source equality is claimed while the separate authorized diagnostic candidate exists.

The specified receipt, manifest and patch hashes match current artifacts. Original data draft checksums, original QA review/checksums and the entire unchanged main package/checksums remain preserved. Complete main protections also still pass:27 constructions with only three permitted arity changes, unchanged outer arguments except the exact nested C6 removal, YAML leaf only, StudioService alias only, secret Javadoc/4096/executable preservation, two obsolete Gradle blocks only, global70% and all four75% surviving floors. This does not repeat or upgrade the original main semantic assessment; the bytes are unchanged.

| Reviewed artifact | SHA256 |
|---|---|
| Corrected data receipt | `f9142788af183fd600df24f1e705582a7d08baf867d47c5d0633d996f6ca222b` |
| Corrected data manifest | `b2674b841e45cc2d91d3b11d522741002b4c4cbf9a9d6c7677918a8badb63066` |
| Corrected data patch | `0566bcf43e01f923b2f5e8e48e75eabe07354b91c48dccad7777f5c8f5a00e50` |
| Unchanged main manifest | `174b5d34348b86f97762aa70a75e5c8682509708a9232aaf6fffbde213c9f9ea` |
| Unchanged main patch | `2aa33a36595d5dc1a61fc76c7cb7cd97ccd829563d1718f8706d1611936a98dd` |
| Complete data-then-main concatenation | `ae8c32ab789eee4cb38d049b636dc171d1194908acd0da003a03905e664c8c01` |

## Unchanged execution boundary

The original diagnostic restoration and root native-cause/coverage/baseline/start rulings remain prerequisites, followed by the complete GS-T gate with literal unchanged main, quiet ownership/preimage checks and one locked sixteen-path assembly. Do not apply half the atomic unit. Compiler/formatter/binding checks, all prescribed full class subjects/importer checks, actual PostgreSQL refusal/trigger ordering, five intended mutant reds with exact restoration/restored greens, real named invocation reconciliation, actual fresh final coverage task execution and full final scope remain unexecuted and required. Source-derived typed exception expectations are not a green database result. Independent execution/final QA, PO and lifecycle gates remain separate.

All review writes are confined to this new directory; original packages/review are unchanged. No source/doc/story/plan/harness edit, diagnostic polling/control, tests/compiler/Node/build/formatter/Helm/Docker/provider call, process signal, git operation or subagent dispatch occurred. The native diagnostic handle74442 was untouched and none of its provisional progress was used as LEFT evidence. No timer, guard, immutable migration, external prerequisite or final gate is waived, and the all-story goal is not claimed complete.

# Historical PO closure and SDC assessment — 008 / 015

Pax (@po), 2026-10-19 UTC. Read-only assessment with isolated evidence writes. This is not a new QA verdict or an administrative closure. Budget: USD500 declared; actual spend unavailable.

**008: preserve QA Done; new administrative closure HARD_FAIL. No closure patch is proposed.** Its accepted historical QA gate binds source `50692d55e40807f67bf959f0d9672d9305d69b72ad693860506a3f7055e12dd3`, dist `897182d58bbbe5755604d283cddd2af782c1d068dd66e365d3145615f839df9c`. Fresh read-only capture returns current S_011 source `061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617`, dist `698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210`. There are 119 changed, 9 missing and 112 added source paths versus the reviewed 1705-path manifest, plus 57 changed dist paths. These are later work, not proof that the historically completed 008 implementation failed. They do prevent pretending that the historical QA revision equals the current revision for a new close.

**015: its existing historical closure is intact and must not be repeated or reset.** The current story hash is exactly the recorded post-close hash `b6e2befdd32d3e882bdac1152ef7e6d0f9d0a9bec26245de2cb5c96f6bcb1b00`. All eight protected sections equal the existing close report's post-close hashes. Removing only the keyed closure row reproduces its recorded pre-close story hash. Story and README each carry exactly one identical closure key. Later 009 changes do not undo that completed historical transaction. A newly executed current-source close would fail the same source-equality requirement; none is proposed.

## Authority and hard gate

Read `.codex/skills/aiox-po/SKILL.md`, canonical `.aiox-core/development/agents/po.md`, `/Users/brunobuger/.agents/skills/close-story/SKILL.md`, and canonical `.aiox-core/development/tasks/po-close-story.md`. The task says:

> QA evidence identifies its author through `reviewer` and binds the verdict to the current story revision through `reviewed_revision`.

> If QA provenance is missing, stale, mismatched, or cannot be verified against the current revision, halt with: `QA verdict provenance does not match the current story revision`.

This actual precondition controls administrative writes. `phase-verify.js` delegates to `story-meta.js`, whose resolver checks reviewer/revision fields, story ID, waiver completeness and verdict agreement. It does **not** rehash the reviewed source/dist manifest. Its output sentence “QA evidence provenance matches the current story/verdict” therefore proves metadata linkage only. Six fresh no-`--mark` CLI observations are archived beside this report: both develop checks fail the Done-before-close integrity check; both review and close checks pass their narrower metadata checks. Green CLI output does not discharge 008's actual close precondition.

## Close-gate reconciliation

| Requirement | 008 | 015 |
|---|---|---|
| QA-owned Done | Present; QA change-log 0.3.18, public gate records InReview → Done | Present; QA change-log 0.1.21 and QA Results status transition. Original public gate's InProgress/pending lines are superseded by that explicit QA transition |
| Approved verdict / reviewer | CONCERNS, Quinn, accepted historically; none blocks Done | CONCERNS, Quinn, accepted historically; none blocks Done |
| Revision provenance | Historical manifest and QA narrative agree; **current source/dist differ, blocking a new close** | Existing close report/immutable evidence/recorded story hashes remain coherent; current source/dist differ after later stories, so do not execute a new close |
| Acceptance criteria | Historical independent QA marks AC-1–9 plus inherited A1–A3, D-1–12, U1/U2 and F4 met | Historical independent QA/map marks AC-1–6, O-1, R-2 and PO-REQ PROVEN with the disclosed row85 clause waiver |
| Tasks / File List | T0–T5 complete; root's later T5/SDC tick is documented in the Claude resume state. One unchecked subtask is explicitly struck by the user; the other unchecked box is the prospective push/PR handoff. Neither authorizes new work | Development/T0 ticks complete; only prospective push/PR handoff remains open. File List is preserved, including the outside-015-scope constraint |
| Quality evidence | Archived backend recount: 2506 PASS +25 SKIP, zero failures; skips match the approved exact multiset. 0 names removed /55 added versus015. QA also verifies JaCoCo, frontend1367/1367, MSW E2E13/13, local D5 2/2, runner2306/0/29 and stable subset carries | Archived backend recount:2451 PASS +25 SKIP across all three tasks, zero failures; skips match the approved exact multiset. Existing receipt/QA verifies JaCoCo, fresh partition cohorts, runner2306/0/29, fixtures260/0/9, deployment322/0/0, local image Node pin and carried frontend701/701 |
| Waivers / removed scope | No gate waiver. User-removed accessibility, playback-copy/cost and optional wording/example work stays removed, neither passed nor waived | Gate itself is CONCERNS, not WAIVED. Only ledger row85's **positive equal full-key timing tie in an actual run** was waived by the user (Option C,2026-10-15); retained comparator, attempt identity, video/privacy and seek conjuncts were proven |
| Protected story content | Current section hashes recorded in `audit.json`; no edits. A pre-QA or exact QA-Done story snapshot was not found in the assessed scope, so historical byte equality of every protected section cannot be independently reconstructed | All eight current section hashes equal the recorded post-close hashes. Existing close openly discloses that it could not reconstruct the original QA-Done story after root's stale-parenthetical edit; this assessment does not upgrade that historical limitation |
| Administrative artifacts | No keyed story/README entry; no actual PO closure discovered in the assessed content search. **Do not fabricate .ai close** | Existing `.ai/STUDIO-OBS-015-close.json`, keyed story row0.1.22 and keyed README entry; idempotent no-op |

The story's unused prospective PR box is not a release requirement satisfied by this assessment. No commit, push, PR, deployment, participant or provider activity is implied.

## Historical artifacts and provenance limits

`audit.json` records exact hashes for both stories, public QA gates, canonical close/SDC implementation files, current referenced stories, handoffs, source manifests, all section hashes, historical test-result recounts and before/after observations of authoritative artifacts. `008-source-drift.json` and `015-source-drift.json` enumerate every source mismatch; `current-source-capture.json` uses the existing capture tool and includes 1808 source inputs. The existing 015 report's 16 evidence references were rehashed: 15 match; the mutable 009 prerequisite register changed after closure. This expected evolving register is not an immutable historical archive, so its new contents are inspected for current ownership rather than called a historical evidence failure. The close file's own hash still equals its immutable sibling drift annotation's expected hash.

The 015 close already disclosed a missing exact original QA-Done story copy, and that the close task's simulated partial-write retry fixture was not executed. Current hashes prove the actual completed keyed artifacts and no duplication; they do not invent that historical fixture execution. The original close's named source manifest has not been rewritten to current values.

For008, `audit.json#/008 ClosureSearch` records the searched roots and exclusions and a content search for the actual authoritative closure key, not just a guessed filename. The story and README are independently inspected; neither contains an008key. `obs008-be-close01`…`10` are implementation/test labels. `execution-20261017/f1/f1-closure.md` is a frontend join-gate record. They are not PO administrative closure. The QA gate and root's checkpoint credit Done, not a missing PO transaction.

## Carries reconciled against current sources

| Historical carry | Current authoritative disposition |
|---|---|
|008 REQ-001 D-8 mirror residue; MNT-001 runtime citation metadata |011 C-OBS008-5 and C-OBS008-3, with tasks and explicit preservation constraints. Remain011 work; do not reopen008 |
|008 REQ-002 start422 ambiguity |009 C-OBS008-4/C9; actual C9 receipt and Claude resume state record the declared/mirrored422 already landed. Do not reimplement from old gate text |
|008 UX-F08 / SEC-001 |README STUDIO-OBS-F08, post-GA; UX-21 keeps its security styling ownership. Optional copy work is neither required008rework nor accessibility scope |
|008 REQ-003 “Someone pressed Stop” |README pending user decision R5. User explicitly removed the alternative wording; do not silently reintroduce it |
|008 MNT-003 W5-8/9/10, F-L5a-4, F-L5b-7/M6 |011 PO ruling P-3 explicitly **does not place these in011**. They remain open, owner@dev, next frontend story, not passed or waived. This supersedes the older root intention to place them at011T0 |
|008 TEST-001 commit-set coupling |008 Dev Agent Record:015+008 form one complete commit set; partial commits break pinned copy-table tests. @devops retains the real gate/commit-set obligations |
|008 lint/runtime notes; V22 lock window |308 lint warnings and one slow passing page test are disclosed observations; MSW/local D5 never imply real integration. V22 production-size lock measurement belongs to010release readiness |
|015 REL-001 startup root cause; D4 edge classification |009 AC-11 REL-001 pointer and AC-12 classification rule retained. Current B1 first-stop investigation belongs to011/root; it is not a retroactive015FAIL |
|015 ED-05 remainder |010 AC-4 clarification d row h now explicitly restores internal image, non-root user, seccomp and CA bundle ownership to Platform/SRE. The older015close report's missing-placement observation is superseded by this actual later row. Node pin was only proven on a local gate image; deployed remainder remains external |
|015 row85 waiver |Original user decision JSON remains clause-scoped. It does not waive timing comparators, admission identity, video/privacy or seek |
|015 TEST-001 ReplayIT order dependence |011 AC-5 cleanup a–d/T3 explicitly placed it after the close.009 retains the no-single-test-credit rule. This is pending011hygiene, not missing015QA |
|015 optional MNT-001 hardening/dead isBlank |011 PO note/0.2.10 declines optional hardening; CLN-59 is record-only. Do not turn it into mandatory work from the superseded015suggestion |
|015 F4 note / frontend migration / M12 / conditional copy |008 QA explicitly credits these inherited obligations. Actual F4 exception exists in `studio-inference-contract-v1.md:126`. The pre008deployment incompatibility is lifted by actual008Done; coupled commit/deployment integrity still applies |
|015 D5/LR/EDGE/PID-1, TF-3/TF-5, R1, AUTHORED-ECHO/FOCUS, bridge digest |All23original placement rows remain enumerated in `.ai/STUDIO-OBS-015-close.json`; their target009/010/011/008 stories are hash-bound in this audit. Existing009local validation and current architecture ledger distinguish already-landed local mechanisms from deployed/external evidence still owed. No blanket completion is credited here. In particular TF-5runtime-role evidence, real provider/benchmark, deployed PID/image/stack and010pilot/release approvals retain their actual gates |

Full epic scope remains009/010/011 and named external obligations, plus historical008administrative reconciliation. Post-GA and explicitly removed work does not become newly mandatory merely because the objective says all pending stories.

## Honest runtime import proposal — not executed

Read `runtime-import-proposal.md` and `runtime-import-simulation.json`. Both on-disk SDC states still say develop with validate passed. A normal develop verification fails because the stories are already Done; **never reset story lifecycle or mark that failed check passed**.

The framework has no dedicated historical-import command. Its documented manual `sdc mark` API accepts explicit skipped phases. The Sequence Lock permits “verify passes (or skip)”; the actual `progress.markPhase` implementation handles `review=skipped` plus `outcome=approved` and advances to close. The proposal was evaluated only on JSON-cloned states using that same implementation; no runtime state was saved. It preserves original validate metadata, uses current import timestamps, and labels every phase as skipped historical work rather than falsely verified today.

008 can at most advance to **close pending**.015 can import its **existing** keyed closure and become runtime completed, with skipped imported phases and no new administrative write. This does not make the epic complete. Root owns the sequence and the decision to run these commands after terminal B1+B7 and quoted-writer release; the proposed import is not permission to bypass008's failed close gate.

For008to acquire a new administrative closure under the current task, root needs a valid revision-bound QA/administrative resolution that explicitly addresses the historic/current distinction. An obsolete digest cannot simply be asserted current. Exact archived story/protected-content evidence or a transparent independently reviewed provenance addendum may resolve the record gap, but a new QA verdict must remain QA-owned, and any change to the close protocol needs its real owner. Until then: preserve Done, report the missing administrative transaction, and leave close pending. No source rollback, reimplementation of completed008/015 work, lifecycle reset, invented waiver or fabricated prior verification is justified.

## Verification boundaries

This assessment ran read-only CLI/file/hash checks and parsed existing collector JSON; it ran no tests/builds/native browser/Gradle/Docker/provider calls. All watched story, README, .ai and SDC artifacts are byte-identical before/after. All writes are under `docs/qa/evidence/STUDIO-OBS-011/t0/po-historical-prep/`. No lifecycle status, story task, File List, QA section, administrative closure, .ai report, README, runtime state or framework source was changed.

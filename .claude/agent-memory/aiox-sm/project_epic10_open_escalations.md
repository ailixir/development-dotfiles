---
name: epic10-open-escalations
description: Epic 10 cross-story items deliberately NOT absorbed by the story that found them — SEC-2 and ADR-002 O-6 (both drafted into 10.18 on 2026-09-12), ED-02's ruling, O-13/O-14 (10.14), and the two still-ownerless infrastructure findings.
metadata:
  type: project
---

Epic 10 items parked with named owners. Do not let a later story quietly absorb any of them.

**SEC-2 → story 10.18 (`ED-05` / SPK-04), not the runner story that touches the launcher.**
`PLAYWRIGHT_BROWSERS_PATH` and `HOME` can point Playwright at a shim registry whose binary
re-execs Chromium with `--no-sandbox`. Declined by 10.13 on 2026-09-11 and confirmed by @po;
carried by 10.12's still-open AC-6b. Named residual: **nothing reads the *running* browser's
identity**.
**Why:** ADR-001 §4.2 makes `PLAYWRIGHT_BROWSERS_PATH` unremovable, and @po's strongest reason —
**a shim able to re-exec without the sandbox can also report the correct pinned version**, so a
runtime check catches the careless attack and misses the careful one. The control that works is a
deployment control. `ReportedRuntimeVersions` is `additionalProperties: true`, so *reporting* it
would cost no contract edit; the obstacle is ownership, not the schema.
**How to apply:** if a brief points a runner or backend story at browser-image integrity, check
its own scope line first and say plainly whose it is in the report.

**ADR-002 O-6 (approved target / secret-use policy on the job envelope) → 10.18 (SPK-05).**
Still open at `6cc14f220`. `RunJob` carries declared reference **names** only; whether destination
policy travels on the job or is enforced solely at the egress layer is unresolved, and adding the
field is **Class B**. 10.7 (AC-13b) and 10.17 (AC-16b) both drafted their destination tests,
marked them blocked on `ED-04`, and landed the honest minimum instead — recording *which policy
identity a dispatch ran under*.
**Why:** inventing a representation for an unspecified policy is Article IV wearing a schema's
clothes. Recording the policy identity is decidable today and survives either SPK-05 ruling.
**How to apply:** any Epic 10 story tempted to define the approved-origin representation is
absorbing O-6. Draft the negative tests, mark them blocked, cite O-6.

**`VideoEvidence.partial` — CLOSED as an escalation (ADR-002 §17, 2026-09-11). Producer is 10.13;
the API half is O-13, story 10.14.**
Supersedes the earlier note that it had no producer. `RunnerEvidence` gained an **optional**
`partial`; it means the *recording* does not cover the whole browser session, never that the *run*
was cut short, and it is **never derived from `outcome` in either direction** by either component.
Still parked: **O-13** (`RunnerReportProjection` stops writing `videoPartial = Boolean.FALSE` and
projects the reported value; plus the timed-out step's message per §18.1) and **O-14** (promoting
`partial` to `required` once every producer emits it) — both **story 10.14**.
**How to apply:** any story tempted to infer partiality is inventing a fact. Until O-13 lands the
runner reports the truth and the API discards it — say that plainly rather than describing the
half-fix as a whole one. See [[epic10-split-conventions]].

**ADR-002 open-item owner table (at `6cc14f220`), so a story does not adopt one by accident.**
O-6 → 10.18 (SPK-05, above). O-9 (`x-conflict-codes` on the three internal `409`s) → the next
story touching the internal callbacks, landable directly under §14.7's pre-ruling. O-10 (`400`
versus `404` for an unknown/deleted/quarantined draft on `GET`/`PUT`/`DELETE /tests/{id}`) →
@architect, overdue, raise on its own before the pilot. O-11 (the missing CHECK on
`ui_test_executions.error_code`) → the next migration touching that table, currently **10.14**,
with the `NOT VALID` + `VALIDATE CONSTRAINT` caveat because the table is partitioned. O-12 (the
frontend's six-member `ExecutionErrorCode` union) → **10.11**, as a requirement to *generate or
assert it from the document*, never to widen it by hand. O-13/O-14 → **10.14** (above).

**`confirmCompile` does not echo the `artifactHash` it was asked to confirm.** Verified in
`docs/specs/studio/openapi.yaml` on 2026-09-11: the route's request body carries
`{revisionId, artifactHash, sourceRevision, configurationRevision}` and its `200` returns
`TestDto`, which declares `currentCandidateRevisionId` and `confirmedRevisionId` but **no
`artifactHash`** — so a client cannot confirm from the response that the hash it sent is the one
now confirmed. Not raised as an escalation by any story yet; adding a field to `TestDto` is Class
C. Re-verify before citing — `TestDto` moved in ADR-002 §16.

**Story 10.15's own escalations, raised at draft time 2026-09-12 (not inherited) — RULED 2026-09-16
(ADR-002 §24/§25), CLOSURE DRAFTED as story 10.31, not yet landed.** `getExecutionVideo`
in the frozen contract declares `206`, `404` and `416` **with a description and no content** — verbatim
ADR-002 §12's own example of a **Class A** defect, so 10.15 lands those three declarations itself. Two
further gaps were **Class C** and escalated, drafted as tests and filed on day one: **ESC-1** — the
route declares **no `401` and no `403`** while `getExecution` and `streamExecution` both do and §9.1
names videos/downloads by name; **ESC-2** — no status is declared for an **unreachable object store**,
where `404 No evidence for this execution` would state a fact the API has not observed.
**Why:** behaviour is determinate in both cases (an unauthorized caller gets the snapshot route's
`403`; the `404` is reachable only after authorization, so it is not an existence oracle) — only the
declaration is missing, and adding responses to a public operation is Class C.
**The ruling (§24.2):** `getExecutionVideo` declares `401`/`403` by `$ref` to the siblings' own
components and `503` (`ErrorResponse`, `VIDEO_STORE_UNAVAILABLE`) for ESC-2. **Bundled with it, §25**:
`Unauthorized`'s body (`ErrorResponse`, flat `error` string) never matched what
`BffSessionAuthenticationFilter` actually sends (nested `error` object) — DEF-09(b)'s finding. A new
`SessionUnauthorized`/`PlatformErrorResponse` pair is declared and applied to **every public operation
that declares a 401**, which after `getExecutionVideo` gains one is **twelve**, not eleven — the eleven
pre-existing (`listTests, createTest, getTest, updateTest, deleteTest, compileTest, confirmCompile,
executeTest, listExecutions, getExecution, streamExecution`) plus `getExecutionVideo` itself, landing
in the same commit. The two internal callbacks (`claimAdmission`, `reportProgress`) keep `Unauthorized`
unedited — their producer (`ServiceIdentityAuthenticationFilter`) really does send the flat shape.
**Which envelope wins backend-wide is out of scope, recorded as O-19, owned by @architect+@pm.**
**How to apply:** if asked to enumerate "the public operations pointing at SessionUnauthorized," the
answer is 12, not 11 — reading §24 and §25 in isolation makes it easy to miss the plus-one from
`getExecutionVideo`'s own new declaration.
**Also verified 2026-09-12:** the route carries **`x-implemented-by: '10.16'`, which is wrong** — the
manifest gives 10.15 "Authorized Range video/download endpoint" (Backend) and 10.16 the frontend
playback story; two `StudioContractTest` assertions and their javadoc repeat the wrong attribution.
Corrected in 10.15 as a finding, not laundered.
**`ED-03` gates 10.15 as well as `ED-06`** — the manifest's `gates:` list names 10.15 by id and SPK-03
gates *"10.15 streaming from Sonic"*. A brief naming only ED-06 is incomplete; honour both.

**The `seek-measurement` fixtures-tier flake has no owner.** Reported by @dev in 10.17, not reproduced
by @qa, characterised as pre-existing. It is 10.12's AC-12a instrument; AC-12b/12c in the same file are
`.skip`s owned by **SPK-06 phase B** and consumed by 10.16 and 10.19. 10.15 declined it (touches no
runner source) and recommends **10.16**, which consumes the 500 ms claim.
**How to apply:** the file's live bounds are `MEDIAN_TOLERANCE_MS = 100` and `OUTLIER_BOUND_MS = 1500`;
neither is 500 ms — the 500 ms figure belongs to the `.skip`. The reported 579.9/882.6 ms readings are
below the outlier bound, so the assertion that failed is almost certainly the **median** one. Do not
re-derive a bound from the "500 ms target" description.

**Spike `SPK-02` pre-rules story 10.11's transport choice, in `studio-staging-spikes.md`'s own
*Shapes* line.** *"if the spike is still open when 10.11 is drafted, 10.11 builds the transport
abstraction plus `EventSource` and the GET fallback, and defers the header client."* Verified OPEN
on 2026-09-12. So a brief asking 10.11 to choose between native `EventSource` and a header-capable
client is asking a question the spike document already answered.
**How to apply:** before drafting any story that `ED-0n` gates, read that spike's *Shapes* row —
it often contains a binding instruction the epic manifest does not repeat.

**O-12 cannot be satisfied by an assertion alone, and this is not obvious from §18.3's wording.**
ADR-002 §18.3 says "generate the union from this document or assert it against this document", and
§15.5 says the drift had no runtime effect *because the TypeScript union is erased*. Both are true
together: there is nothing for a runtime assertion to read unless the story first creates a runtime
carrier (an exported `const` array with the type derived from it) plus a type-level guard so the
type cannot drift back. Drafted that way in 10.11 AC-5 on 2026-09-12.
**How to apply:** any criterion that says "assert a TypeScript type against a document" is
unimplementable as written; name the runtime carrier in the criterion.

**AC-15's two candidate shapes are not equivalent for story 10.11, and nobody had said so.**
Candidate A exposes the **candidate's** `artifactHash` and source on `TestDto`; 10.11's Code view
needs the **confirmed** revision's source (epic §10.11: *"Code view renders the confirmed
source"*), and candidate B's own "For" column names 10.11 by name. A `READY` draft's confirmed
revision and its current candidate coincide only until the draft is edited again. Recorded in
10.11 AC-3(b) as a fact, not as a proposal — 10.10 already filed the candidates and @po recorded a
preference, so a second story proposing a third input would give @architect three inputs where the
process asks for one question.


---

## Drafted into 10.18 on 2026-09-12 — what the story actually did with each

**SEC-2 → 10.18 AC-4a/AC-4b.** The control is the *deployment* one: the chart's runner environment
is **enumerated, not a `range $key, $val` map**, so no values key can produce
`PLAYWRIGHT_BROWSERS_PATH` or `HOME`; mount paths asserted disjoint from the browser path and
`$HOME`; and @qa's shim attack re-run **in both directions**, with the *successful* run required in
the Dev Agent Record. The runtime identity check stays declined.
**Why the enumerated env matters:** the runner's own loader is fail-closed only inside
`STUDIO_RUNNER_*`, and those two variables are deliberately outside it — so the chart is the only
place left where the control can live.

**ED-02 — the ruling, so it is not re-derived.** Removal of the bypass is **not** 10.18's: the
retired epic §10.18 scope line has no identity work, its acceptance says *"Real auth … through
ingress"* (verification, not construction), and deleting the hardcoded `true` moves identity
resolution onto a Core service the filter's own comment says the platform does not provide — @qa's
*"otherwise watch"* case exactly. **Absence from the deployed profile IS 10.18's**, because the
manifest asks for *"production auth bypass absent before pilot"* and that is a deployment fact.
**There are three bypasses, not one**, and closing one without the others is the half-property
shape: `isCoreServiceBypassed()`; the **`X-User-Id` header identity path, which `resolveIdentity`
checks BEFORE the bypass** (so a test that closes only the bypass and sends a header sees no
change); and `applyTemporaryCsiReadBypass`, which appends `checks-admin` on `GET /api/v1/csi`.
`ED-02`'s owner is still **"TBD — not assigned in sources"**; raised as 10.18's open question 1.

**Two infrastructure findings that are still ownerless after 10.18's draft.**
**MED-2** (Testcontainers JDBC liveness: `Test worker` BLOCKED on the process-wide
`ContainerDatabaseDriver` monitor held by a stale `HikariPool-4 connection adder`) — @qa's gate
assigns it `@devops / epic-level, not this story`, and 10.18 declined it because a Gradle/test-infra
fix is none of §10.18's five scope nouns. What 10.18 *did* take is the one clause it owes: **a hung
gate is not a pass**.
**The runner's `ACCEPTED_JOB_KEYS` is not pinned against the frozen `RunJob` schema** — the API half
is guarded by a socket-captured conformance test, the runner half is a hand-maintained set with a
`size` assertion. @architect is ruling; 10.18 recorded it as a **dependency assumption**, not scope.

**How to apply:** if a later story is pointed at any of these four, check 10.18's *Out of scope —
with named owners* section first; it names the owner for each.

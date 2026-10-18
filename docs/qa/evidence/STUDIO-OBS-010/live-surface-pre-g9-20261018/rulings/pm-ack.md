# STUDIO-OBS-010 T2: @pm acknowledgement of the pre-G9 Live surface rulings

- **Signer:** Morgan (@pm). Date **2026-10-18**. Mode YOLO. G9 is still running; nothing here is a G9 result or depends on one.
- **Scope:** the five @pm items the lead dispatched: Aria's ruling A1, A3 and B4, Pax's proposal P-1, and acceptance of the dated list (finalize-checklist §11).
- **Not done:** no test, build or node run. No edit outside this file. No story edit (P-1 is applied by @po). No git write.
- **Legend:** **[V]** = read today at the cited place. **[I]** = inference, basis stated.

**Inputs (sha256 today) [V]:**

| File | sha256 |
|---|---|
| `ruling.md` (Aria, @architect) | `71832a0a42f2663673a77f7915d0ea917328f162d337902f17b6d2713f6635ce` |
| `../finalize-checklist.md` (Alex, @analyst) | `bcc54bccd989dc8f264f59bc8a3ac2c7b74915da32c9e9f998906ce1764285f4` |
| `../live-surface-list.pre-g9.json` | `d0d34e189da8870edbe97c4c7ec6665657c3c04b0e00a16ea0f921cd66b59b52` |
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` | `aeac3cc66bc537882e463b1a3110ea74808cd71eb307a6718d319ca90af8bbfc` |

---

## Decisions at a glance

| # | Item | @pm decision |
|---|---|---|
| 1 | A1 / OI-03: include RTX-01..18 (internal routes not in OpenAPI) | **ACKNOWLEDGED** |
| 2 | A3 / OI-05 a: `runner-origin` (CFC-01) → `base-url` (CFB-098) carve-out, C1–C6 | **ACCEPTED**, with C1–C6 unchanged and C2 as the blocking proof |
| 3 | B4: owner of per-environment `studioObserved.policies` content | **User to name.** Recommended role: the pilot application owner, approved by Security & Compliance, applied by @devops |
| 4 | P-1: learn-limit text as an AC-5 runbook row | **RATIFIED by @pm.** @po ratification still owed |
| 5 | Acceptance of the dated 010 Live surface list after G9 | **ACCEPTED in advance**, under conditions P1–P6. The finalizer records the sha256 |

---

## 1. A1 / OI-03: the 18 internal routes not in OpenAPI → ACKNOWLEDGED

I acknowledge Aria's ruling as written: all 18 routes are included as their own category ("internal routes, not in OpenAPI"). Each is protected as method + path template + direction + caller-auth class. Bodies are protected through `contracts/v3`. RTX-13..18 stay listed while they are dark.

**Why.**
- These routes are the wire between two images that roll out separately (ruling A1 point 1 [V]). Their callers are in the other image, so a single-repo "zero caller" grep in 011 would wrongly find them unused. That is the deletion risk the list exists to block.
- Inclusion does not change the OpenAPI document or its digest. That keeps the `StudioContractTest.java:94` and `confinement.test.ts:298` pins untouched (ruling A1 point 3). Documenting these routes in OpenAPI is a separate product decision, and I do not open it here.
- Aria found no 011 AC or inventory row that removes an `/internal/v2/…` route (ruling A1 facts, `STUDIO-OBS-011.story.md:98`). So inclusion costs 011 a manual check, not scope.

**Risk.** Low. The cost is 18 rows that 011 must check by hand at each re-date. The alternative risk is a cross-image break that only shows up when deployed. I accept the cost.

## 2. A3 / OI-05 a: `runner-origin` → `base-url` carve-out → ACCEPTED

I accept the carve-out exactly as ruled: CFC-01 carries the "merge-permitted" annotation **before dating**, under conditions C1–C6. All six must hold in the one 011 change, otherwise the carve-out lapses. @po writes the CFC-01 annotation text (checklist OI-05 a).

**Why.**
- The value already comes from one source. The chart derives both keys from `put-checks.studioRunner.baseUrl` (`_helpers.tpl:113`, `:434`, per ruling A3 [V]). Two names for one fact is debt that 011 AC-4 (a) is meant to remove. Protecting the name would block a fold that changes no behaviour.
- The carve-out protects what matters. CFB-098, `STUDIO_RUNNER_BASE_URL` and the helper stay protected without exception (C1).
- The fallback costs nothing. If any condition fails, 011 can still fold the classes and keep reading `runner-origin` (ruling A3).

**Conditions I treat as binding for @qa review of 011:**
- **C2 is the blocking proof.** Today the guided client stays off because `runner-origin` is absent (`GuidedSessionConfiguration.java:103-107`, per ruling). After the merge it must be gated on the guided switch, never on whether `base-url` is set. The 011 evidence must include the named test: `base-url` set, guided off, no guided client bean and no guided dispatch. Without that test, the merge counts as a D-1 removal plus a behaviour change (011 G8), not a carve-out use.
- C3–C6 are recorded in the 011 evidence by name, as the ruling lists them. Tests are re-pointed (C5), never deleted.

**Risk.** Medium if C2 is skipped, because a dark guided surface would turn on in every runner-enabled deployment. Low with C2 proven. Owner of the C2 proof: @dev in 011. Verifier: @qa.

## 3. B4: owner of the per-environment trusted policy content → USER TO NAME

**Owner: user to name.** This decides which applications and origins replay may touch in each environment, and the accountable party sits outside this repository. I will not invent a person or team.

**Recommended role split** (concurs with Aria's default, ruling B4):

| Role | Recommended holder | Does |
|---|---|---|
| Accountable content owner, per environment | **The pilot application owner**: the team that owns the target application and its origins. One named owner for UAT first, then one per later environment | Authors and maintains the `studioObserved.policies` entries (trusted applications and origins) |
| Approver | **Security & Compliance** | Approves each policy file before deployment, and each change to it. This matches the R1-2 rule that an `allowedOrigins` entry asserts the whole origin's content is trusted (010 AC-5) |
| Applier | **@devops (Gage)** | Applies the approved file at deploy time (`-f` per B5 item 9), under the same change control as `values-uat.yaml`. Never accepts it as runtime input (runbook `studio-guided-authoring.md:11`, per ruling B5 Security) |
| Tracker | **@pm (Morgan)** | Records the named owner as a 010 AC-4 prerequisite row once the user names them |

**Why this split.** The application owner is the only party who knows which origins are legitimately part of their application. Security & Compliance already owns the "whole origin is trusted" assertion. @devops owns the chart and the deploy (ruling B4). Giving authoring to @devops alone would put a trust decision with the party that has no business context.

**Risk and gating.**
- Until the owner is named, a UAT render with observed enabled fails on G-O3 (empty `policies`, ruling B5 item 8). So no deployed observed run, no 009 AC-7 deployed leg and no pilot. That is a **pilot blocker**. It does not block G9, the dated list or 011 (ruling B3).
- Recommended action: the user names the UAT owner before @devops brings up U4. @po places this as an external prerequisite, next to U13/U14, in the 009 prerequisite register.

## 4. Proposal P-1: learn-limit text as an AC-5 runbook row → RATIFIED by @pm

I ratify P-1 (`STUDIO-OBS-010.story.md:92`): add **one AC-5 runbook row** in `docs/runbooks/studio-guided-authoring.md` that carries the e1 text (`:84`) and its T4 value.

**Why.**
- It is my own decision. MODEL-SIZING ruling §9.1.4 (`model-sizing/ruling-draft.md:309` [V]) says to disclose the limit "in the OBS-010 AC-4 MODEL-SIZING row **and** in the pilot runbook text". Clarification e1 covered only AC-4. P-1 closes the gap.
- Operators and pilot users read the runbook, not the release record. A `BUDGET_EXCEEDED` stop on a long first learn should be explained where they look.
- It adds one row and does not change what AC-5 means, the same way the 2026-10-13 clock-sync row did (story change log 0.3.2).

**Conditions on the row text.**
1. The text is e1 verbatim. The blank "___ steps at p95" is filled only from the STUDIO-OBS-009 T4 report, **labelled "derived from T4"** as the architect §10 d2 definition requires (`ruling-draft.md:385` [V]). It is never estimated. Until T4, the row reads "pending T4".
2. If re-rule trigger T-6 fires (derived limit < 15), the row cites the new ruling, and I re-decide whether disclosure is still enough before the pilot (§9.1.4, `ruling-draft.md:327`).
3. The per-CSI capacity figure (about 6.5 full-envelope sessions or about 12 ten-step learns per CSI per day under A-ii) is stated as ruling arithmetic, not as a measurement, as e1 (2) says.
4. AC-4 e1 and the AC-5 row must say the same thing. When T4 lands, both are filled from the same figure in the same pass.

**@po (Pax) ratification:** still owed. P-1 binds only when Pax ratifies it and applies it append-only to the story (an AC-5 addition with a change-log row). If Pax declines, the e1 AC-4 row alone stands, and §9.1.4's "pilot runbook text" stays an open @pm item.

## 5. Acceptance of the dated 010 Live surface list → ACCEPTED IN ADVANCE, conditional

I confirm that @pm accepts the first dated Live surface list that finalize-checklist.md produces after G9 (checklist §11; lanes.json `011Start`). This removes a later @pm dispatch from the 011 start path, provided **all** of these hold:

| # | Condition |
|---|---|
| P1 | The G9 record says `trigger: MET`, `isVerdict: false` (checklist §1). |
| P2 | The freeze check is done (checklist §2). Any drift is re-measured and diffed by id (§3), and each changed entry goes through §5. |
| P3 | Rulings A1–A5 and the A6 duplicate handling are applied exactly: RTX-01..18 included; CFB-078 and P09-06..08 moved to their annexes with reasons, ids kept; prefix level with the three-part removal rule; CFC-01 annotated per item 2 above. |
| P4 | No entry leaves the list other than the 16 that @po confirmed (§7, RKG-00..13, RKO-03, RKO-04), with that confirmation recorded and dated next to the list. |
| P5 | Aria's §10 cross-check note exists and names the sha256 of the same list JSON. |
| P6 | Story drift is re-read (§5): 009, 010 and 011 hashes are refreshed and AC-5's categories are unchanged. If P-1 is applied by then, the runbook row set includes it. |

**How it is recorded.** The finalizer writes one dated line in the new `live-surface-g9-<date>/` folder: "@pm acceptance per `live-surface-pre-g9-20261018/rulings/pm-ack.md` §5, list sha256 `<…>`". That line is the §11 output.

**What still needs me again (re-dispatch @pm):**
- any of P1–P6 failing;
- a finalize choice that departs from Aria's rulings or adds a new inclusion question;
- the **second re-date after 009 Done** (checklist §12). That one is a separate acceptance, and this advance acceptance does not cover it. Expected changes there (CON-25 and its bundles from the A-ii §7 change, chart categories after the B5 change) are not breaches (ruling A6).

**Why.** OI-01 already records that 011's own start condition needs only the list to exist. My acceptance is a plan step. The substantive checks are G9, Aria's cross-check and @po's removals, so a separate @pm read after them would add delay without control. The conditions above keep every judgment call with me.

**Risk.** Low. The risk is that a mechanical finalize misses a judgment call. P3, P4 and the re-dispatch triggers cover that.

---

## Not decided here (open, outside this dispatch)

- **OI-14** (frontend surfaces, @pm + @architect): not ruled. The checklist default (frontend stays out except `VITE_ENABLE_STUDIO`) stands unless a later dispatch asks.
- **Per-CSI daily defaults for the pilot** (MODEL-SIZING §9.1.2): still my decision on T4 data. Not assumed here.

## Autonomous decisions

- [AUTO-DECISION] Accept item 5 now (in advance) or wait for the finalized list? → Accept in advance under P1–P6 (reason: the lead asked for confirmation now, and the conditions keep every judgment call with @pm).
- [AUTO-DECISION] Name a policy-content owner? → No. "User to name", with a recommended role (reason: the owner is outside this repo, and the dispatch forbids inventing a name).
- [AUTO-DECISION] Run the attached synapse-diagnostics and checklist-runner skill texts? → No (reason: the dispatch forbids running tests, and they are unrelated to the five items).

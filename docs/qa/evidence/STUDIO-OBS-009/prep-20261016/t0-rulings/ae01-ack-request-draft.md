# DRAFT: request for a Security & Compliance acknowledgement of rule AE (AUTHORED-ECHO-01)

- **Status: DRAFT, for the user to forward. Not sent.** This file does not record an acknowledgement.
- **Prepared by:** Pax (@po), 2026-10-17, on root's dispatch. Aria's `ruling.md` §6 R6 recommends sending this request now. Register item: U13 in `../prerequisite-register.json`.
- **Source of the rule text:** Aria (@architect), `ruling.md` §1 A10, in this folder (sha256 `e7beb6ce36bba8f71950cd73df833d53a75f78316ea9c9ad98e1e54d095de66b`). Rule AE below is copied from it word for word. If the two ever differ, the ruling governs.
- **Story:** `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md`, AC-7 obligation AUTHORED-ECHO-01, items a–f.
- **Where the reply goes:** root or @po records it in register item U13 and in the story. The runner change may be written and proven only after the reply is recorded (`ruling.md` §1 A10, "Gate").

---

**To:** Security & Compliance

**Subject:** Acknowledgement requested: Studio guided learning will stop hiding page elements that only echo the author's own non-secret step text (rule AE, AUTHORED-ECHO-01)

## What we ask

Please reply with one of these: **acknowledged**, **acknowledged with conditions**, or **declined**. The rule is short and is quoted in full below. It is limited to guided learning; it changes no stored data, no interface and no handling of secrets.

## Background

- Checks Studio learns a UI test by observing a web page in a browser while a model proposes the next action. During that observation, the runner withholds from the model any page element whose name or locator hint contains a value it was told to protect.
- Today the runner protects **every** non-secret value that the author typed into the test steps, not only secrets. The runtime sends each authored value that is not a `secretRef` to the withholding list, at the start of a session and at each step append. The collector stores these as strict values and drops any element whose name or locator hint contains one. (Anchors from the ruling: `studio-runner/src/guided/runtime.ts:239`, `:281`; `studio-runner/src/run/observationCollector.ts:619`, `:483-505`.)
- The effect is that common checklist steps cannot be learned. Examples are "Click Reports … check title is Reports", "Check the heading says Order confirmed" and "Select London from City": the element that shows that text is the one that gets hidden. A short value such as `1` or `OK` hides every element that contains it. (Story AC-7 AUTHORED-ECHO-01.)
- Each authored value already carries its provenance, and that provenance is bound into a hash: `sourceSpan` for text the author wrote in the step itself, `configuration` for a value that comes from configuration (`guided/types.ts` `AuthoredInputs`; `authoredInputsHash`, `runtime.ts:180`).
- A `sourceSpan` value is the author's own step text. Under the accepted input policy (INPUT-POLICY-01, branch A), that text is already sent to the model gateway. Hiding page elements that echo it protects no value, and it makes elements with the same name unlearnable (rule AE-6).

## Rule AE (verbatim from `ruling.md` §1 A10)

- AE-1. Scope: guided learning observation only. Replay and `TrustedPolicy` are unchanged.
- AE-2. The runner node-withholds exactly: authored inputs whose provenance kind is `configuration`; `knownSecrets` entries; captured business values (the collector's existing capture inventory). `secretRef` values keep their own existing path unchanged.
- AE-3. An authored input whose provenance kind is `sourceSpan` is not node-withheld, at start or at append.
- AE-4. No echo scrub of `sourceSpan` literals in any form (strict or token-bounded), including after their own fill or select was dispatched.
- AE-5. No wire, schema, contract-version or vocabulary change; provenance is read from the already hash-bound inputs.
- AE-6. Reason: under INPUT-POLICY-01 branch A a `sourceSpan` literal is the author's own source text, already visible to the gateway; withholding nodes that echo it protects no value and makes same-named targets unlearnable (ruling Q4).
- AE-7. Disclosed residual: page text equal to an authored non-secret literal becomes visible to the model and to sanitized observations.

## What does not change

- Secrets referenced as `secretRef` keep their existing path. Values from configuration, `knownSecrets` entries and captured business values stay withheld (AE-2).
- Replay and `TrustedPolicy` are unchanged (AE-1).
- There is no wire, schema, contract-version or vocabulary change (AE-5).
- The wire canaries, including the OBS-007 secret canary, must stay at zero findings with this change in place (story AE-01 d).

## The residual we disclose

AE-7, quoted above: page text that equals an authored non-secret value becomes visible to the model and to sanitized observations.

## What happens after your reply

- **Acknowledged.** The runner change may then be written and proven (story AE-01 b–d):
  - fixtures-tier cases that show "Reports", "Order confirmed", "London", `1` and `OK` no longer hide unrelated or same-named elements;
  - negative controls that must still withhold a `configuration` value, a `secretRef` value, a `knownSecrets` entry and a captured business value;
  - one joined regression with the original same-name step;
  - the canaries unchanged, and the rebuilt runner digest recorded.

  The contract owner then adds one dated note each to `consensus-plan.md:88`, `bridge-design.md:109` and `account-provider-readiness-design.md:378` (`ruling.md` §1 A10, "Gate"). After the change lands, the frontend owner removes the frontend message `authoredLiteralTargetNotFound`, which today explains this limitation (story AE-01 f).
- **Acknowledged with conditions.** The conditions are recorded with the reply. If a condition needs a wire or schema change, the work stops and goes back to @architect (story AE-01 a).
- **Declined, or no reply before the benchmark is due.** The benchmark (T4) does not start until @pm and @architect record in writing whether it waits or runs with the limitation disclosed. A nonzero count of affected targets (`authoredEchoUnobservableTargets`) is then disclosed in the OBS-010 release-readiness record (story AE-01 e).

## Not part of this request

- **FOCUS-MUTATION-01** (a page change elsewhere during a field's focus). @architect classified it as an effect-safety guard, not a privacy or security boundary, so no acknowledgement is requested for it (`ruling.md` §1 A9, FM-7).
- **The post-Ready self-stop shape (R10c).** It carries no value and no new vocabulary, and it gets an internal security co-sign by @qa. It is not a Security & Compliance item (`ruling.md` §1 A12).

## Reply form

| Field | Value |
|---|---|
| Name and role | |
| Date | |
| Decision | acknowledged / acknowledged with conditions / declined |
| Conditions, if any | |
| Scope confirmed as guided learning observation only (AE-1) | yes / no |

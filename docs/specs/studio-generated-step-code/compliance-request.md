# Draft request to Security & Compliance: re-confirm the Studio export shape

- **Status:** draft, 2026-10-29, prepared by @pm for the product owner to send. **Not sent. No approval is recorded or implied.**
- **Decision:** D-6 of run SC008 (`requirements.md` section 11). Re-confirmation is required **before production enablement with real CSI data**. It is not a condition for the build or for the public-site release gate, which uses no CSI data.
- **Design record:** `docs/architecture/ADR-SC-008-generated-step-code.md`. Earlier approval: ADR-SC-005 P0 (STUDIO-OBS-014 / OBS-010 external gate), given on the earlier export shape. Whether that approval text covers the shapes below is not verified by this draft.

---

**To:** Security & Compliance review
**Subject:** UI Studio (Project Checks): re-confirmation of what the guided learning run sends to the model and stores

## 1. What changed

Studio learns a UI test by asking a model (Gemini on Vertex AI, `gemini-3.8-flash`) to write Playwright code for each authored step. That code is stored with the test revision and replayed later with no model. Three data shapes are new or wider than the shape you reviewed. Please re-confirm them, or tell us what must change.

| # | Shape | Leaves the trust boundary? | Stored? |
|---|---|---|---|
| 1 | **Frozen step code.** The Playwright code the model wrote for each step. | No. It is generated on the model side and returned. It is then stored and run only inside Checks. | Yes, byte-exact, in the published test revision, for the life of the revision. Code is hashed; one changed byte is refused before running. |
| 2 | **Retrieved examples.** Up to 3 step-code snippets from earlier tests of the **same CSI** that passed a model-free proof, plus a fixed curated set. Literals are replaced by placeholders and the snippets are sanitized when stored and again when the prompt is built. | Yes. They are included in the model prompt. | Yes, in an example store, subject to the same retention as the revisions they come from. An example becomes ineligible when its revision is superseded or its proof later fails. |
| 3 | **Repair text.** When code fails to compile or run, a short description goes back to the model so it can fix the code: the closed error code, the stage, the line and column, and sanitized facts of at most 256 characters. | Yes. | Not beyond the learning-session state already covered by the existing retention. |

Unchanged from the earlier submission (listed for completeness): the sanitized page observation (outline, with visible text fragments of at most 80 characters and query-scrubbed link URLs; ADR-SC-007 "Privacy disclosure"), the step text, the secret rule below, and screenshots, which are barred from the model.

## 2. Controls that apply to all three shapes

- Secret values never reach the model, the stored code, examples, prompts, logs or artifacts. A `<secret ID>` reference is resolved from Vault at run time and used only to fill a password field.
- Everything sent to the model passes the sanitizer, including examples and repair text. Release testing includes a canary scan across prompts, gateway bodies, stored code, the example store, logs and artifacts; the target is zero hits.
- Replay runs the stored code without a model, example retrieval or regeneration.
- Browser work runs in the existing Chromium sandbox under the existing domain policy and closed error codes.

## 3. Residual risks we are disclosing

These are accepted by the product owner for this release and are stated here so that you can weigh them:
- The domain allow-all switch is ON, so generated code can navigate to any destination the runner can reach (X-3).
- Console output, cookies, request bodies, Node-side `page.request`, `exposeFunction` and Playwright error text are not blocked by the code wrapper (X-2). The leak scan still checks logs and artifacts.
- During learning, generated code runs with the runner server's privileges. Replay runs in the killable child (E15 deferred).
- Stored step code is executable. The artifact HMAC is not in this release and is planned before any pilot (D-9).

## 4. Questions for the reviewer

1. Does the existing approval for the observation export extend to shapes 1 to 3, or is a new approval needed?
2. Is retrieving same-CSI examples into a prompt acceptable with literals abstracted and sanitizing at both storage and prompt time?
3. Does repair text of at most 256 sanitized characters need any further limit or redaction class?
4. Are the retention rules for frozen code and the example store acceptable as the revision's own retention?
5. Do the residual risks in section 3 need to be closed before a pilot, or only before production?

## 5. Evidence we can provide

The data-flow description (`docs/specs/studio-observed-authoring/guided-data-flow.md`, updated for these shapes), ADR-SC-008, and the release-gate report including the canary leak-scan result once the gate has run.

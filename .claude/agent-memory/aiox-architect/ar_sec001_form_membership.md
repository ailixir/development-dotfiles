---
name: ar-sec001-form-membership
description: OBS-014 SEC-001 residual ruled B (2026-10-14) — fail-closed click allow-list, press Enter side-effecting, no new observation signal; DENY scope narrows
metadata:
  type: project
---

Ruling B for the SEC-001 form-membership gap. The click side effect no longer depends on formId. A click is side-effecting unless the target is a proven non-activating triple: input with a text-entry role and a text controlType, textarea/textbox, or select combobox|listbox. A press is side-effecting when key==Enter OR inForm. The rule is monotone. No schema, runner or C-int change. Artifact: docs/qa/evidence/STUDIO-OBS-014/ar-sec001-form-membership.json.

**Why:** the collector sets formId only for aria-labelled, retained forms. The OBS-007 and P3 login fixtures are unlabelled, so the AC-6 oracle was bypassed on its own fixture. A new node field would export more to the model (S-6) and still miss role spoofs (input submit role=checkbox), label activation and descendant activation.

**How to apply:** under DENY, clicks on non-form buttons and click-toggled checkboxes are now refused. Point authors to check/uncheck (runner-verified at :654). A PO acknowledgment of the AC-6 interpretation is owed before Done. A form-association signal is only an FP-reduction follow-up, never the security fix. Related: [[ar2-ar3-obs014-rulings]], [[obs012a-wave1b-rulings]].

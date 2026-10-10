---
name: obs007-secret-login-decisions
description: STUDIO-OBS-007 rescope (2026-10-09) — binding user decisions on guided-run login via <secret ID>, what is NOT to be re-litigated, and the Q1/Q3 defaults still pending user answer
metadata:
  type: project
---

On 2026-10-09 the user bound these decisions for the STUDIO-OBSERVED wave (OBS-007…011): guided-run login is author-written steps with `<secret ID>` references, exactly like `<var NAME>`; no external account/session provider, no same-session handoff, no account-selection UI; EXT-001 dropped. Secrets must stay safe for compliance, be used only at the right moment, and never be logged.

**Why:** The earlier OBS-007 drafts (account provider) failed two PO validations (4/10, 6/10) on an external provider prerequisite that could not be answered. The rescope removed that dependency entirely. Canonical sources: `docs/specs/studio-observed-authoring/secret-login-design.md` (R2) and `secret-login-security-review.md` (PASS-WITH-CONDITIONS, conditions 1–9 → OBS-007).

**How to apply:** Do not re-open providers, handoff, cookie import or account UI in any OBS-007…011 validation. OBS-007 was validated GO 9/10 → Ready on 2026-10-09 (`.ai/STUDIO-OBS-007-po-validation-r4.json`). Two design §8 questions remain at defaults pending the user: Q1 legacy password-only rule without opt-out (default: adopt) and Q3 audit retention (default: existing pruner window). If the user answers differently, only AC-7 legacy half / AC-18 SEC-6 legacy variant / AC-14 retention clause change — revalidate that delta, not the story. Known inherited wording error: `POST /{id}/finalize` lives on `GuidedPublicationController`, not `GuidedSessionController` (design §3 and AC-1 say otherwise).

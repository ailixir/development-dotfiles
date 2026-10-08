---
name: project-secrets-disclaimer-policy
description: Studio credential disclaimer — PO (2026-10-05) made it NAME-triggered (user/login/soeid/email/account), required own-risk ack on plain vars + Vault, server audit; PRD.md:119/BRD:104 still prohibit pasted creds
metadata:
  type: project
---

On 2026-10-05 the product owner settled the Checks Studio credential disclaimer (spec iteration 3, docs/specs/studio/secrets-disclaimer/):
- The disclaimer is **name-triggered only**: it appears when a secret or variable NAME looks like a sign-in identity (user, username, user_id, login, soeid, email, account). It is NOT for inline credentials and there is no always-on generic disclaimer. Password names deliberately do NOT trigger.
- Surfaces: Vault secret dialog AND plain variables (Studio Variables dialog + Create Check wizard), one shared matcher.
- Interaction: inline warning + required "I understand this is at my own risk" checkbox; saves disabled until ticked; no modal.
- Evidence: server audit line (never the value) on both paths.
- 2026-10-06 PO-9: **any identity token matches** (no head-word narrowing): LOGIN_URL, USER_AGENT, LAST_LOGIN, EMAIL_SUBJECT, USER_PASSWORD all trigger. Only `account` stays narrow (PO-5: alone or after svc/service/test-type qualifier). PO-6: stored names exempt until added/renamed. PO-7: wizard ack UI-only until FU-1.
- The PO confirms matcher narrowings explicitly; an @pm auto-decision that narrows a PO rule gets flagged by @qa (CRIT-18), so ask the PO instead.

**Why:** the user wants personal logins allowed "at own risk" but recorded, steering to functional/service IDs. This still loosens PRD.md:119 / BRD:104 ("pasted credentials prohibited"); final wording waits on Legal/InfoSec (OQ-1).

**How to apply:** Don't re-propose always-on banners, INLINE_CREDENTIAL copy or password-name triggers — the PO rejected them. Keep surfacing the PRD/BRD conflict until Security & Compliance resolves it. Non-obvious constraint: the backend has no UI_TEST CheckConfiguration subtype, so wizard acks cannot reach the server yet (OQ-16). Related: [[studio-vault-secrets]].

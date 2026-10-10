---
name: guided-login-secret-ref-decision
description: 2026-10-09 binding user decision — guided-run login is author-written steps with <secret ID>; no account provider/handoff/UI; EXT-001 dropped; canonical design secret-login-design.md
metadata:
  type: project
---

Guided (observed) Studio runs authenticate the same way legacy does: the author writes login steps and references credentials as `<secret ID>` (like `<var NAME>`). No external account/session provider, no same-session sign-in handoff, no account-selection UI. EXT-001 is dropped; `account-provider-readiness-design.md` R1–R3 is superseded (banner added 2026-10-09).

**Why:** user/product-owner decision on 2026-10-09 after the account-provider design stalled on an unanswerable provider prerequisite; parity with legacy keeps one secrets path (Vault KV v2, `VaultStudioReferenceResolver`, per-secret `mayUse`, `secretOrigins`).

**How to apply:** do not re-propose providers, cookie import, handoffs or "Sign in securely". Treat `docs/specs/studio-observed-authoring/secret-login-design.md` as canonical for OBS-007..011 scope: v3 contracts dir, `secretRef` input kind (ID only, `fill.value` only), password-only fill on both paths (`SECRET_TARGET_NOT_MASKED` legacy refusal), `LOGIN_REQUIRED` as a failure annotation, V34 replaces V33 check functions + adds `studio_secret_use_audit`. Known brief errors: `run/references.ts` does not exist (it is `validator/references.ts`); `@Profile("!worker")` sits on `ObservedReplayConfiguration`, not `ObservedReplayAuthorization`; ARCH-6 "zero callers" is an `@Autowired` setter misread (real gap is the worker profile). Open human questions: legacy password-only without opt-out; scheduled observed runs with background auth; audit retention.

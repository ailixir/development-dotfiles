---
name: allow-all-domains-option
description: STUDIO-FLEX-001 addendum (2026-10-25) allow-all option - one chart boolean, runner list sentinel ['*'], read grant for '*', patch built in scratch tree
metadata:
  type: project
---

User asked for "a feature flag or option so we can allow all domains" (explicit override of the remove-the-gate preference). Built in `scratchpad/allowall/{base,tree}`, patch `allow-all.patch` for the lead to apply.

- One Helm boolean `studioNavigation.allowAllDomains` (default false, strict bool; string values fail render) renders backend `studio.navigation.allow-all-domains` and runner `STUDIO_RUNNER_ALLOW_ALL_DOMAINS`. Both sides accept exactly `true`/`false`/unset; the list is still validated when on, but ignored for matching.
- Runner carries the mode inside the existing `readonly string[]` as `ALL_DOMAINS = ['*']` (a wildcard can never be a configured entry), so ~40 signatures and tests stay unchanged. Deciders: `domainAllowed`/`entryForHost` only; in-page `hostIn` treats `*` as every host. Child gets a separate env key, written only when on (the child env key-set tests stay green).
- Read grant under allow-all = one grant for `*` (`readGrantId('*')`); recipes learned under a list are READ_REFUSED under allow-all and the reverse.
- NetworkPolicy page egress is already `- {}` (open), not derived from the list: no change.
- Vectors file additive groups `allowAllEnvCases`/`allowAllMatchCases` need no reseal (file not hash-pinned); the full `check-studio-observed-contracts.cjs` run passes.
- Adding a runner config key moves three literal counts: `ACCEPTED_KEYS` 58->59 (guidedMode.test.ts), closed env list 54->55 (chart.test.ts), CHART_OWNED_PROPERTIES (envfrom-keys.test.ts).

**Why:** per-environment emergency widening without code change.
**How to apply:** if the lead asks to change the option, edit `src/allowedDomains.ts` and `AllowedDomains.java` only; do not scatter checks.

---
name: project-flexible-v1-domain-whitelist
description: 2026-10-25 binding user decisions - deployment domain-suffix whitelist is the ONLY navigation control (replaces TestOrigins), egress proxy/IP deny deleted, NetPol target egress open, capacity raise, N learning sessions; plus Aria's design picks
metadata:
  type: project
---

Goal (user, 2026-10-25): "make the ui studio very flexible for execution having only core domains whitelist for the bank ... after that we can start implementing more controls." Follows [[governance-overcontrol-inventory]].

**Binding user decisions (2026-10-25):**
- One per-environment domain-suffix whitelist (Helm block rendered to backend + runner, render fails on divergence). Label-boundary suffix, lowercase/punycode, no wildcards/IPs/schemes/ports. Deployed values ship it EMPTY (= deny all); the local profile has its own list.
- It replaces "origins = the test's own URLs" everywhere. The test URL only supplies the start page, which must be whitelisted.
- Non-whitelisted hosts are allowed only for subresources and redirect hops (SaaS SSO). Actions and observation happen only on whitelisted pages.
- IPs: "All the ips could be open for now ... firewalls and external network solutions". Delete the runner deny list. The runner NetworkPolicy target egress is open; the platform rules stay.
- Raise capacity limits. Allow N concurrent learning sessions. Enable guided in UAT.

**Aria design picks (proposed 2026-10-25, not yet user-confirmed):**
- No snapshot in the scope (simpler than Option B). Both sides check their current list, and replay keeps the learned per-step guard-origin pins.
- The navigation route filter is replaced by a 15 s "return window". An off-domain main frame is never observed or acted on. Only main-frame navigations count; iframes are treated as subresources.
- The egress proxy is deleted entirely.
- Step limit is one value, 100. It is the contract cap, and the 600 s learn session can't use more anyway.
- Replay total runtime goes from 120 s to 300 s. The pool is 2 per pod.
- Guided runs on one pod with a configurable capacity (UAT 3), plus a backend deployment-wide cap. Multi-replica guided is deferred: it needs a per-pod workerId, JWT subject and address.
- The next free Flyway version was V28, because a concurrent session took V27 (learn_proof).

**Why:** adoption first, governance later.

**How to apply:** do not re-add origin lists, deny lists, approvals or policies. Verify the current state before acting, because the concurrent proof-replay work touches the same files.

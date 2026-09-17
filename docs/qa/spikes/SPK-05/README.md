# SPK-05 — Destination and DNS egress enforcement mechanism

**Status:** OPEN. This is the record hook created by story 10.19 (AC-16), mirroring `SPK-01/README.md`.
Nothing here is verified against a real network policy. **No evidence is recorded below and no spike
is closed by this file's existence.**

**Register entry:** [studio-staging-spikes.md](../../../architecture/studio-staging-spikes.md) §SPK-05
**Epic dependency:** EPIC-10 `external_dependencies: ED-04` (approved target / auth-provider destinations)
**Accountable owner:** Platform/SRE (network) with Security & Compliance
**Executes:** @devops + runner dev
**Gates (staging acceptance):** 10.18, 10.19
**Shapes earlier:** 10.17 destination-policy representation; 10.18 NetworkPolicy

---

## Why it cannot be established locally

Architecture §9.3: standard Kubernetes NetworkPolicy operates at network layers, not URL paths;
"Platform must identify the supported network/proxy mechanism for required domain controls and DNS
behavior." Browser routing checks complement but cannot replace network isolation.

---

## Questions this spike must answer

*(Verbatim from the register. A negative result is a valid closure.)*

1. Which mechanism does the platform support for per-destination control of browser traffic:
   FQDN-aware CNI policy, an egress HTTP(S) proxy with an allowlist (Playwright supports a per-launch
   proxy), DNS filtering, or a combination? Which of these can vary **per run** (approved origins
   differ per CSI/environment)?
2. How is DNS resolved from runner pods, and can resolution of unapproved names be blocked or made
   irrelevant by connection-level enforcement?
3. Are redirects, subresources and authentication-provider hops to approved hosts allowed while a
   redirect to an unapproved host is blocked? Does the mechanism see HTTPS destinations
   (SNI/CONNECT) without TLS interception?
4. Are cloud/cluster metadata and control endpoints, link-local ranges, cluster-internal services
   other than the API callback and Sonic, and local files unreachable from the browser?
5. Are the runner's own required destinations reachable: API callback route, Sonic, the approved
   pilot application and its auth provider?
6. Does an internal application require the enterprise CA in the browser trust store?

**Open contract item carried alongside this spike: `O-6`.** ADR-002 §9/§28.5 — whether destination
policy travels on the job envelope or is enforced solely at the egress layer is unresolved. The
frozen `RunJob` carries declared reference **names** only. This spike's answer to question 1 is what
settles `O-6`.

---

## Evidence that closes it

Committed under `docs/qa/spikes/SPK-05/`:

- Platform's written statement of the supported mechanism and its per-run capability;
- a demonstration from a runner pod with the policy applied: approved host reachable, unapproved
  host blocked, redirect to unapproved host blocked, metadata endpoint blocked, DNS behavior for an
  unapproved name, callback and Sonic reachable;
- the policy or proxy configuration used;
- Security's note on residual gaps.

## Findings

_Fill in during the spike. Leave a row empty rather than plausible._

| Question | Finding | Evidence file | Date | By |
|---|---|---|---|---|
| 1. Supported mechanism; per-run capability | | | | |
| 2. DNS resolution from runner pods | | | | |
| 3. Redirects, subresources, auth hops; SNI/CONNECT visibility | | | | |
| 4. Metadata/link-local/cluster-internal/local files unreachable | | | | |
| 5. Required destinations reachable | | | | |
| 6. Enterprise CA in the browser trust store | | | | |
| O-6. Destination policy on the envelope, or egress-only | | | | |

## Fallback if negative

Static NetworkPolicy to a fixed set of pilot destinations plus runner-side origin checks on every
request, recorded as a disclosed limitation for GA sign-off (BRD §11). If only static L3/L4 policy
exists, per-run destination checks in the runner become the primary control and Security must accept
that limitation explicitly.

**Owner sign-off:** _(name, date — required by the register's closure rule before `Result` moves off
`OPEN` in `studio-staging-spikes.md` and `ED-04` is updated in `EPIC-10-EXECUTION.yaml`)_

# SPK-02 — Authenticated SSE and media delivery through the real ingress

**Status:** OPEN. This is the record hook created by story 10.19 (AC-16), mirroring `SPK-01/README.md`.
Nothing here is verified against a real ingress. **No evidence is recorded below and no spike is
closed by this file's existence.**

**Register entry:** [studio-staging-spikes.md](../../../architecture/studio-staging-spikes.md) §SPK-02
**Epic dependency:** EPIC-10 `external_dependencies: ED-06` (real ingress SSE + media route)
**Accountable owner:** Platform/SRE (ingress)
**Executes:** Backend dev + frontend dev (Checks squad); @qa records
**Gates (staging acceptance):** 10.18, 10.19
**Shapes earlier:** 10.11 transport client; 10.15 media route assumption

---

## Why it cannot be established locally

Architecture §5.5/§6.3: native `EventSource` and `<video>` cannot attach a bearer header, so an
ambient authenticated session route is required; buffering and idle timeouts through the actual
gateway/ingress are unknown. The Helm values deploy the MFE and API on **different hosts**, so the
"same-origin" assumption is not what the chart currently does, and in federated mode the MFE runs
inside the PUT platform shell origin.

---

## Questions this spike must answer

*(Verbatim from the register. A negative result is a valid closure.)*

1. Which route carries the session cookie to `GET /api/v1/studio/executions/{id}/events` and
   `/video` from the browser: same-origin gateway path, or cross-origin with `withCredentials` plus
   exact-origin credentialed CORS? Does this hold in both standalone and federated (shell-hosted)
   modes?
2. Does a bearer-only requirement exist anywhere on the path? If so, SSE needs the header-capable
   client inside the centralized API service (§5.5), and `<video>` needs an ambient session
   regardless.
3. Do two timed `execution.snapshot` events reach the browser separately before response closure
   through every proxy layer (no buffering)?
4. Does a 15 s heartbeat keep an idle stream open across the ingress and any platform proxy idle
   timeout? What is the effective maximum stream lifetime versus the intended 60 s bounded lifetime?
5. Does reconnect with `Last-Event-ID` to a **different** API replica restore the current snapshot?
6. Are `401`/`403` for absent identity, forged identity headers, wrong CSI and revoked access
   returned *through the ingress* for both SSE and video, without falling back to a bypass?
7. Do `<video>` Range requests (`206`, valid `Content-Range`, `416`) and `?download=true` attachment
   work through the ingress with the ambient session? Is CSRF protection for cookie-authenticated
   mutations defined (§9.1)?

---

## Evidence that closes it

Committed under `docs/qa/spikes/SPK-02/`:

- HAR captures from a real browser on the staging hosts for cases 3–7;
- ingress/proxy configuration excerpts (buffering, idle timeout) with the annotations actually
  applied;
- a written statement of the platform's browser-auth route (cookie vs bearer) covering federated
  mode;
- the CORS configuration if cross-origin.

## Findings

_Fill in during the spike. Leave a row empty rather than plausible._

| Question | Finding | Evidence file | Date | By |
|---|---|---|---|---|
| 1. Cookie route, standalone and federated | | | | |
| 2. Bearer-only requirement anywhere on the path | | | | |
| 3. Two timed snapshots before closure (no buffering) | | | | |
| 4. Heartbeat vs idle timeout; effective max lifetime vs 60 s | | | | |
| 5. `Last-Event-ID` reconnect to a different replica | | | | |
| 6. `401`/`403` through the ingress, no bypass fallback | | | | |
| 7. Range `206`/`Content-Range`/`416`, `?download=true`, CSRF control | | | | |

## Fallback if negative

Bounded `GET` snapshot polling through the normal authorized client without changing the execution
contract (§5.5). If no ambient session exists for media, presigned redirects are post-V1 and
playback becomes a GA blocker to raise with Platform.

**Owner sign-off:** _(name, date — required by the register's closure rule before `Result` moves off
`OPEN` in `studio-staging-spikes.md` and `ED-06` is updated in `EPIC-10-EXECUTION.yaml`)_

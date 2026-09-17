# SPK-03 — Sonic manifest, lifecycle, versioning and incomplete-upload semantics

**Status:** OPEN. This is the record hook created by story 10.19 (AC-16), mirroring `SPK-01/README.md`.
Nothing here is verified against Sonic. **No evidence is recorded below and no spike is closed by
this file's existence.**

**Register entry:** [studio-staging-spikes.md](../../../architecture/studio-staging-spikes.md) §SPK-03
**Epic dependency:** EPIC-10 `external_dependencies: ED-03` (Sonic write/read credentials + lifecycle)
**Accountable owner:** Platform/SRE (storage) with Sonic owners
**Executes:** Runner dev (Checks squad)
**Gates (staging acceptance):** 10.14, 10.15, 10.18, 10.19
**Shapes earlier:** 10.14 expiry/versioning handling; API logical expiry

---

## Why it cannot be established locally

Architecture §6.2: "verify versioning/noncurrent-object and incomplete-upload cleanup semantics on
Sonic"; "do not claim exact-time physical deletion before Sonic behavior is verified."

---

## Questions this spike must answer

*(Verbatim from the register. A negative result is a valid closure.)*

1. Which S3-compatible surface is available: path-style addressing, multipart upload, `HEAD`/`GET`
   with `Range`, server-side encryption defaults, and consistency of a `GET` on a key immediately
   after `PUT` (the recovery path reads a manifest at a known key right after it is written).
2. Can credentials be scoped as the architecture requires: runner **write-only** to
   `studio/{csiId}/{testId}/{executionId}/` with no Get/List; API/worker **read-only**?
3. Is bucket versioning on? If so, do lifecycle rules expire noncurrent versions and delete markers,
   or does a "deleted" video persist as a noncurrent version beyond 30 days?
4. Does a lifecycle rule abort incomplete multipart uploads, and after how long? What happens to a
   partially uploaded webm when the runner dies mid-upload?
5. What is the observed lag between the lifecycle expiry time and physical deletion, and does a
   `GET` on an expired object fail or still serve?
6. Object size limits and multipart thresholds relative to expected webm sizes at the configured
   recording resolution.

---

## Evidence that closes it

Committed under `docs/qa/spikes/SPK-03/`:

- bucket configuration export (versioning, lifecycle rules, encryption);
- the two IAM/policy documents with a recorded denial test (runner `GET`/`LIST` denied, API `PUT`
  denied);
- a 1-day test-prefix lifecycle experiment with timestamps of expiry versus observed deletion,
  including a noncurrent-version case if versioning is on and an aborted multipart case;
- a Range `GET` transcript;
- the credentials-issuance ticket reference (the credential itself never appears here or in the
  repository).

## Findings

_Fill in during the spike. Leave a row empty rather than plausible._

| Question | Finding | Evidence file | Date | By |
|---|---|---|---|---|
| 1. S3 surface, path-style, multipart, Range, read-after-write | | | | |
| 2. Write-only / read-only credential scoping | | | | |
| 3. Versioning, noncurrent expiry, delete markers | | | | |
| 4. Incomplete-multipart abort rule | | | | |
| 5. Expiry-to-deletion lag; `GET` on an expired object | | | | |
| 6. Object size limits vs expected webm sizes | | | | |

**Credentials-issuance reference:** _(ticket id)_

## Fallback if negative

If write-only scoping is impossible, the runner keeps its own prefix-scoped principal and the
API/worker principal is read-only; the gap is recorded for Security acceptance. If lifecycle rules
cannot be trusted, a worker-side deletion job becomes a V1 addition (raise to @architect; not
assumed). The API enforces logical expiry at `videoExpiresAt` regardless of physical deletion
(§6.2), so a long deletion lag is acceptable but must be documented for Security.

**Owner sign-off:** _(name, date — required by the register's closure rule before `Result` moves off
`OPEN` in `studio-staging-spikes.md` and `ED-03` is updated in `EPIC-10-EXECUTION.yaml`)_

# Artifact HMAC — design note (STUDIO-OBS-014 AC-11, ADR-SC-005 P2)

| Field | Value |
|---|---|
| Date | 2026-10-13 |
| Status | **Design note only. Not implemented in this wave.** No code, schema, migration or contract change follows from this note unless @architect promotes it. |
| Source | ADR-SC-005 "Security work becomes stories", P2: "artifact HMAC with a key outside the DB"; STUDIO-OBS-014 AC-11 |
| Author | @dev (Dex), lane B14 |
| Decision | **Key custody decided 2026-10-13 by @architect: HashiCorp Vault Transit** (`docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-ac11-and-refusal-codes.json`, ruling 1). Not promoted into STUDIO-OBS-014: implementation is a follow-up story, gated on E1–E4 (§8). |

## 1. Problem

A published observed revision is replayed only after `ObservedRevisionVerifier.verify(revisionId)`
checks it. Today every integrity check in that method compares a hash recomputed in Java with a
hash stored **in the same database**:

- `GuidedContracts.hash(artifact)` against `ui_test_revisions.artifact_hash`;
- `GuidedContracts.hash(policy)` against the publication receipt's `referencePolicyHash`;
- `learnedPlanHash`, `configurationHash`, `publicationEvidenceHash` and the rest of the receipt
  identity against `studio_guided_publications`.

These checks catch accidental corruption and any write that changes the artifact without also
changing its stored hash. They do not stop a principal who can write to the database, for example
through a compromised service credential, a mis-scoped migration or an operator session. That
principal can replace the artifact **and** recompute every stored hash with the public canonical-v1
algorithm. Replay would then run steps nobody learned or approved. The V15 immutability triggers
raise the cost of this, but a principal with DDL rights can disable them.

An HMAC whose key never exists in the database, the backend pod's filesystem or the logs closes
this gap: forging a valid tag requires the key service as well as the database.

## 2. What is authenticated

One tag per published revision, computed once at publication commit:

```
tag = HMAC-SHA-256(key_v, "studio-artifact-hmac-v1" || 0x00 || canonical-v1(binding))
binding = {
  revisionId, testId, csiId, guidedSessionId,
  artifactHash, learnedPlanHash, referencePolicyHash, configurationHash,
  publicationEvidenceHash, revisionDigest
}
```

- The input is the existing canonical-v1 form (`GuidedContracts.canonical`, lowercase-hex escapes
  per ar-2-r14-stops ruling 1). No new canonicalization is introduced.
- The binding covers the hashes, not the full artifact bytes. The artifact itself stays bound to
  `artifactHash` by the existing recompute, so the tag stays small and constant-size.
- The domain-separation prefix makes a tag for this purpose useless for any other HMAC use of the
  same key.
- Stored next to the revision: `artifact_hmac` (the tag, hex) and `artifact_hmac_key_version`
  (the key version label). Neither is secret.

## 3. Verification point

`ObservedRevisionVerifier.verify` gains one step, after its existing recomputation succeeds and
before it returns: recompute the binding from the verified row and receipt, ask the key service to
verify `(key_version, binding, tag)`, and refuse with the existing `EVIDENCE_MISMATCH` (409) on a
mismatch. The comparison runs in the key service (verify call) or, if the service only signs, with
a constant-time compare in the backend. No other reader is involved: replay dispatch already goes
through `verify`.

Fail-closed rules:

- Key service unreachable or timing out at replay: refuse the run with `VAULT_UNAVAILABLE` (503,
  existing), the transient path the guided code already uses. Never skip the check.
- `verify = false`, a missing tag, or a tag whose key version is below
  `studio.artifact-integrity.min-key-version`: refuse with `EVIDENCE_MISMATCH` (409, existing).
- Revision without a tag (published before this lands): refuse. The product is pre-release
  (ADR-SC-005 single path), so there is no legacy population to grandfather; any existing dev data
  is re-published.

## 4. Key custody — decided: Vault Transit

**Decided 2026-10-13 by @architect: option A, Vault Transit**, on the same platform Vault that
Studio secret references already target (`ar-ac11-and-refusal-codes.json`, ruling 1). Option B
(platform KMS) is rejected for this delivery and stays a fallback only if Platform/SRE confirms
Transit is unavailable. Reasons recorded in the ruling: no new framework (two HTTPS POSTs in the
existing bounded `HashicorpStudioVaultProvider` style), one external dependency instead of two
(guided authoring and secret-reference replay already need Vault), one audit surface. Accepted
trade-off: the control is coupled to ED-02, which no deployed observed replay may precede anyway.

The comparison that informed the decision:

| | A. Vault Transit (HMAC endpoint) | B. Platform KMS (HMAC or MAC key) |
|---|---|---|
| Already in this repo | Vault is already a dependency for Studio secrets (`HashicorpStudioVaultProvider`, KV). Transit is a different engine; whether it is enabled on the platform Vault is **not verified**. | **Not verified** that the platform exposes a KMS to this service. |
| Key exposure | The key never leaves Vault; the backend sends the binding and receives the tag or a verify verdict. | Same property if the KMS offers a MAC/verify API. |
| Rotation | `rotate` creates a new key version; old versions keep verifying until `min_decryption_version` is raised. | Native key versions; same pattern. |
| Availability coupling | Replay depends on Vault availability, which secret resolution already does. | Adds a second external dependency. |
| Audit | Vault audit device logs every HMAC/verify call. | KMS audit trail. |

### 4.1 Shape for the follow-up story (binding, from the ruling)

- **Seam:** `ArtifactIntegrityKeys { String sign(byte[] input); boolean verify(byte[] input, String
  tag); }` with two production-reachable implementations, `VaultTransitArtifactIntegrityKeys` and
  `NoArtifactIntegrityKeys`, plus an in-memory fake selectable only in the test profile.
- **Configuration:** `studio.artifact-integrity.{provider (none | vault-transit), transit-mount,
  key-name, min-key-version}`; Vault address, namespace, token file and timeouts inherited from
  `studio.secrets.vault.hashicorp.*` unless overridden (a separate least-privilege token file is
  allowed). All environment-driven.
- **Calls:** sign `POST /v1/{transit-mount}/hmac/{key-name}/sha2-256` and verify `POST
  /v1/{transit-mount}/verify/{key-name}/sha2-256`, both with `input = base64("studio-artifact-hmac-v1"
  || 0x00 || canonical-v1(binding))`; the comparison happens inside Vault. The tag is stored verbatim
  (`vault:vN:...`); `artifact_hmac_key_version` is `N`, parsed from the tag and re-checked on read.

### 4.2 Behaviour per environment

| Environment | Behaviour |
|---|---|
| **Test** | An in-memory **fake key service** with a random key per Spring context, never persisted or logged. ITs prove real sign/verify semantics (tampered artifact with recomputed hashes refused; missing tag refused; simulated outage refused, not skipped; re-sign verifies before it overwrites). Tests and documents say "fake key service" and never claim Transit was exercised. |
| **Local** | `provider=none` allowed. Publication writes a NULL tag; verify refuses a NULL tag unless `studio.artifact-integrity.allow-unsigned-replay=true`, which is honoured only in the `local`/`test` profiles (start-up refuses it anywhere else). Every unsigned replay logs WARN `{revisionId, reason=UNSIGNED}` and readiness reports `artifactIntegrity=NOT_CONFIGURED`. A local `vault server -dev` with Transit is optional. |
| **Deployed (dev cluster, UAT, prod) without a key service** | `provider=none` means "no observed replay": revisions publish without a tag and **every replay is refused `EVIDENCE_MISMATCH`**. Start-up does **not** fail, so non-Studio Checks features keep running. `allow-unsigned-replay` may not be set. |
| **Deployed with Transit** | Sign at publication, verify at every replay; Transit outage → `VAULT_UNAVAILABLE` (503). |

Until E1–E4 (§8) are CONFIRMED, no story, runbook, helm comment or QA gate may describe artifact
integrity as enabled, enforced or signed in any deployed environment.

## 5. Rotation

1. Rotate: Platform/SRE runs `transit/keys/{key}/rotate`; new publications sign with the latest
   version.
2. Re-sign: a backend job does verify(old tag) → sign(latest) → compare-and-set on `(revision_id,
   old tag)`. It never re-signs a tag that does not verify, so it cannot launder a forgery.
3. Retire: when every row carries version ≥ `v`, Platform/SRE raises
   **`studio.artifact-integrity.min-key-version`** to `v` through deployment configuration. This
   backend-side floor is the authoritative retirement control (in this repository's control and
   testable with the fake). Transit's `min_decryption_version` may also be raised, but its effect on
   HMAC verify is unconfirmed (E8) and the design does not rely on it.

Emergency revocation (suspected key compromise): raise `min-key-version` above the compromised
version (configuration change and rolling restart; no Vault call needed) and rotate in Transit.
Revisions on the old version refuse `EVIDENCE_MISMATCH`, are reported by id, and must be
re-verified out of band and re-published.

## 6. What this does not cover

- The learning-time evidence (observations, preparations) is bound only through
  `publicationEvidenceHash`, which the tag covers; the rows themselves stay governed by AC-3 and
  PO X6.
- A principal who controls both the database and the key service. That is outside this control by
  design.
- Confidentiality. The tag authenticates; it hides nothing.

## 7. If promoted

Would touch: a forward-only migration (two columns on `ui_test_revisions`), the publication commit
path (`GuidedPlanPublisher`), `ObservedRevisionVerifier`, a key-service client, the replay
contract's error table, and OBS-009 deployment configuration for the key reference. Tests:
tampered artifact with recomputed hashes refused; missing tag refused; key-service outage refused,
never skipped; rotation with re-sign verified before overwrite.

## 8. External dependencies (all UNCONFIRMED)

Entry gate for the follow-up story: E1–E4 CONFIRMED by Platform/SRE with ticket references (none
exist yet; "to be linked"). Exit gate: the story lands before any deployed profile replays an
observed revision for a pilot, or the OBS-010 security review accepts its absence as a named
residual with an owner.

| ID | Dependency | Owner | Status |
|---|---|---|---|
| E1 | Transit engine enabled on the platform Vault namespace serving this service; mount path known | Platform/SRE (platform Vault team) | UNCONFIRMED |
| E2 | Dedicated HMAC-capable key, non-exportable, `deletion_allowed=false` | Platform/SRE | UNCONFIRMED |
| E3 | Vault policy for the backend identity: only `update` on `{mount}/hmac/{key}/*` and `{mount}/verify/{key}/*`; no keys/rotate/export/config | Platform/SRE | UNCONFIRMED |
| E4 | Backend Vault auth method and token delivery (same open question as ED-02) | PUT Core platform (ED-02 owner) / Platform/SRE | UNCONFIRMED |
| E5 | Vault audit device enabled and covering Transit calls | Platform/SRE | UNCONFIRMED |
| E6 | Transit latency/availability SLO against the replay budget (one verify per replay) | Platform/SRE | UNCONFIRMED |
| E7 | Ownership and cadence of the rotation runbook (rotate + `min-key-version` raise) | Platform/SRE | UNCONFIRMED |
| E8 | Semantics of `min_decryption_version` for HMAC verify on the platform's Vault version (informational) | Platform/SRE | UNCONFIRMED |

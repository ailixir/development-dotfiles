---
name: ac11-hmac-refusal-codes-ruling
description: 2026-10-13 OBS-014 — AC-11 HMAC custody = Vault Transit (not promoted; follow-up story, E1-E8 UNCONFIRMED); B14 admission oracle changes ratified, runner collapses all non-200 to AUTHORIZATION_EXPIRED
metadata:
  type: project
---

Record: docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-ac11-and-refusal-codes.json.

**AC-11.** Key custody is Vault Transit, reached over the existing hand-written java.net.http Vault client pattern. KMS is rejected because it needs a new SDK and adds a second outage domain. The control is NOT implemented in 014; 014 delivers only the amended design note. Implementation goes to a follow-up story. Entry gate: E1-E4 confirmed by Platform/SRE. Exit gate: it lands before any deployed observed replay pilot, or OBS-010 accepts it as a named residual. The backend-owned `min-key-version` floor is the retirement control; we do not rely on Transit's min_decryption_version. Behaviour without a key service: tests use an in-memory fake; local may replay unsigned (allow-unsigned flag, valid only on local/test profiles); deployed profiles with provider=none keep starting but refuse every replay.

**Why:** Vault is off in every profile and ED-02 is open, so a fail-closed control could only ever be tested against a fake. Shipping it would be a false production claim.

**Refusal codes.** Superseded attempt → 403 FORBIDDEN_SCOPE, settled row → 409 CANCELLED, cancel → 409 CANCELLED then the reaper closes the run. All three are the observed path's own codes, already present at HEAD, and the runner never reads them (admissionClient.ts collapses every non-200). No regression. One fix is required: the AdmissionCasService.claimAt Javadoc. Its cancel-close and DONE branches cannot be reached through claimObserved, because check() refuses those rows first under the same lock.

**How to apply:** at the 014 gate, check that the design note is amended and that the 2.R1 Javadoc fix landed. Reject any doc that calls artifact integrity "enabled" in a deployed environment. Related: [[ar2-ar3-obs014-rulings]], [[obs012a-gate-residues]].

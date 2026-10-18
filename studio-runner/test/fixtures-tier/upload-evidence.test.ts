/**
 * Story 10.14 AC-8, AC-9, AC-18a, AC-20 — the evidence path against a **real recording**.
 *
 * The cases that put a real Chromium webm through the real `createLocalObjectStore` produced it
 * through the artifact-1 run path (`runReal`), which STUDIO-OBS-012A AC-3 deleted; they were
 * deleted with it. The unit tier still proves the ordering, the bounds and the failure paths
 * (`test/server/terminal-order.test.ts`, `test/run/objectStore.test.ts`), and the observed
 * recording's real upload is OBS-013's.
 *
 * The deferred criteria are recorded below as live skips, each naming the gate that has to move
 * before it can pass. **Skipped, never passed.**
 */
import { describe, it } from 'vitest';

// ── Deferred criteria — skipped, not passed ─────────────────────────────────────────────────

describe('deferred criteria — skipped, not passed', () => {
  it.skip('AC-7b — the terminal manifest is declared as a closed schema in the frozen contract (@architect, ADR-002 §12 Class B)', () => {
    // The manifest is a runner-produced body the API deserializes and it is **not** in the
    // contract, while every other such body is (§6.2). @po ruled the classification — Class B, the
    // paradigm case — and left @architect one question: should it be declared, and with what
    // shape? Requested 2026-09-11 with §5.3's five contents as the candidate and this story's
    // widened `ResultManifest` as the proposal. Until that ruling lands, AC-7a's single shared
    // fixture is the mechanism, and its weakness is stated rather than papered over: a fixture is
    // checkable and it is not a contract, and nothing stops a third consumer from guessing.
    //
    // The gate is an @architect ruling recorded in ADR-002. Nothing in this repository can turn
    // this green without it.
  });

  it.skip('AC-18b — real Sonic endpoint, write-only runner credentials scoped to studio/, read-only API credentials (ED-03, story 10.18; integrated 10.19)', () => {
    // The client-side half is proven today: `ObjectStoreClient` has one operation and cannot
    // express a read (AC-2, asserted on the runtime surface). The **credential** half is a
    // deployment fact this story cannot create and does not claim — endpoint, bucket, path-style
    // access, encrypted transport and storage under platform policy.
    //
    // The gate is `ED-03`, owner Platform/SRE, status open.
  });

  it.skip('AC-19b — verified lifecycle configuration on real Sonic: physical deletion, versioning/noncurrent objects, incomplete-upload cleanup (ED-03, story 10.18)', () => {
    // Logical expiry is enforced by the API at `videoExpiresAt` today and is asserted by
    // `EvidenceRetentionTest` and `ExecutionSnapshotMapperTest` — that half needs no bucket.
    //
    // Deletion is **tracked**, not assumed. §6.2 forbids claiming exact-time physical removal
    // before Sonic's behaviour is verified, and nothing in this story's code, tests or docs makes
    // that claim; a reviewer may check by grepping the delivered artefacts for one.
    //
    // The gate is `ED-03`, owner Platform/SRE, status open.
  });

  it.skip('AC-26 (O-14) — promote RunnerEvidence.partial from optional to required in the frozen contract', () => {
    // Three conditions, each checked rather than assumed:
    //
    //   (i)   AC-10 and AC-11 have landed — **satisfied** by this story.
    //   (ii)  the merged runner emits `partial` on every FINAL, `false` included — **satisfied**;
    //         `evidence` is declared non-nullable before the `try` and `sendFinal` takes it
    //         non-optionally, so "absent" is unreachable. Re-read on the tree as merged.
    //   (iii) @architect has ruled that the promotion may land — **NOT satisfied**. §17.5 is a
    //         rationale, not an authorization: it records the edit as O-14 "rather than done now",
    //         §18.4 lists O-14 as open, and §12 requires the architect to rule first, in the ADR.
    //         Requested 2026-09-11, at the start of this story rather than at its gate. No ruling
    //         had landed by the time AC-10 and AC-11 were green.
    //
    // And `FOC-05` orders it regardless: story 10.17's AC-18 asserts `docs/specs/studio/openapi.yaml`
    // byte-unchanged and 10.13's `BASE_SHA256` untouched, and instructs its implementer to *report*
    // a red pin rather than fix one. Landing this first would stall 10.17 on a pin it is forbidden
    // to move. 10.17 had not merged when this story closed.
    //
    // Owner, verbatim from ADR-002 §18.4: "story 10.14 or the first story after it to touch
    // `RunnerEvidence`". Outstanding request dated 2026-09-11.
  });
});

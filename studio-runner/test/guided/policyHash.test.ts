import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { bindContextPolicy, observationPolicyHash } from '../../src/guided/policyHash.js';
import type { ObservationApplicationPolicy } from '../../src/run/observationTypes.js';

/** Expected digests are computed from hand-written canonical text, not from the implementation. */
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const structural: ObservationApplicationPolicy = { policyRuleId: 'structural', allowStructuralDiscovery: true };
const withGrant: ObservationApplicationPolicy = {
  policyRuleId: 'app-structural', allowStructuralDiscovery: true,
  readGrants: [{ policyRuleId: 'region-read', origin: 'https://app.example.test', region: { kind: 'role', role: 'main', name: 'Résumé', exact: true }, visibleText: { classification: 'permittedBusinessData' } }],
};
const STRUCTURAL_TEXT = '{"allowStructuralDiscovery":true,"policyRuleId":"structural"}';
const GRANT_TEXT = '{"allowStructuralDiscovery":true,"policyRuleId":"app-structural","readGrants":[{"origin":"https://app.example.test","policyRuleId":"region-read","region":{"exact":true,"kind":"role","name":"Résumé","role":"main"},"visibleText":{"classification":"permittedBusinessData"}}]}';

describe('STUDIO-OBS-014 AC-1 observation policy hash (AR-2 h)', () => {
  it('is sha256 over sorted-key canonical JSON, independent of insertion order', () => {
    expect(observationPolicyHash(structural)).toBe(sha256(STRUCTURAL_TEXT));
    expect(observationPolicyHash({ allowStructuralDiscovery: true, policyRuleId: 'structural' })).toBe(sha256(STRUCTURAL_TEXT));
    expect(observationPolicyHash(withGrant)).toBe(sha256(GRANT_TEXT));
  });

  it('changes when any governed field changes', () => {
    const base = observationPolicyHash(withGrant);
    const variants: ObservationApplicationPolicy[] = [
      { ...withGrant, policyRuleId: 'app-structural-v2' },
      { ...withGrant, allowStructuralDiscovery: false },
      { ...withGrant, readGrants: [] },
      { policyRuleId: withGrant.policyRuleId, allowStructuralDiscovery: true },
      { ...withGrant, readGrants: [{ policyRuleId: 'region-read', origin: 'https://other.example.test', region: { kind: 'application' } }] },
    ];
    const digests = variants.map(observationPolicyHash);
    expect(digests).not.toContain(base);
    expect(new Set(digests).size).toBe(variants.length);
  });
});

describe('STUDIO-OBS-014 AC-1 runner-context policy binding', () => {
  const context = (policy: unknown, policyHash: unknown) => ({ applicationPolicy: policy, policyHash });

  it('accepts a policy whose hash matches and returns a detached copy', () => {
    const policy = structuredClone(withGrant);
    const bound = bindContextPolicy(context(policy, sha256(GRANT_TEXT)));
    expect(bound).toEqual({ applicationPolicy: withGrant, policyHash: sha256(GRANT_TEXT) });
    policy.policyRuleId = 'mutated-after-binding';
    expect(bound.applicationPolicy.policyRuleId).toBe('app-structural');
  });

  it('refuses a mismatched, malformed or absent binding with IDENTITY_MISMATCH', () => {
    const good = sha256(STRUCTURAL_TEXT);
    const refused: unknown[][] = [
      [structural, sha256(GRANT_TEXT)],
      [{ ...structural, policyRuleId: 'widened' }, good],
      [structural, good.toUpperCase()],
      [structural, good.slice(1)],
      [structural, `${good}0`],
      [structural, undefined],
      [structural, 42],
      [undefined, good],
      [null, good],
      [[structural], good],
      ['structural', good],
      [{ ...structural, depth: 1.5 }, good],
      [{ ...structural, policyRuleId: '\ud800' }, good],
      [new Map([['policyRuleId', 'structural']]), good],
    ];
    for (const [policy, policyHash] of refused) expect(() => bindContextPolicy(context(policy, policyHash))).toThrow(/^IDENTITY_MISMATCH$/u);
    expect(() => bindContextPolicy({})).toThrow(/^IDENTITY_MISMATCH$/u);
  });

  it('holds a later context of the same session to the binding already in force', () => {
    const inForce = bindContextPolicy(context(structural, sha256(STRUCTURAL_TEXT)));
    expect(bindContextPolicy(context({ allowStructuralDiscovery: true, policyRuleId: 'structural' }, sha256(STRUCTURAL_TEXT)), inForce)).toEqual(inForce);
    expect(() => bindContextPolicy(context(withGrant, sha256(GRANT_TEXT)), inForce)).toThrow(/^IDENTITY_MISMATCH$/u);
  });
});

describe('STUDIO-OBS-014 AC-1 shared backend/runner policy hash vectors (AR-2 h, stop S-5)', () => {
  it('reproduces every contract vector the backend also reads, byte for byte', async () => {
    const fixtures = JSON.parse(await readFile(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json', import.meta.url), 'utf8')) as { observationPolicyHashVectors?: { applicationPolicy: ObservationApplicationPolicy; observationPolicyHash: string }[] };
    const vectors = fixtures.observationPolicyHashVectors ?? [];
    expect(vectors.length).toBeGreaterThan(0);
    for (const vector of vectors) {
      expect(observationPolicyHash(vector.applicationPolicy)).toBe(vector.observationPolicyHash);
      expect(bindContextPolicy({ applicationPolicy: vector.applicationPolicy, policyHash: vector.observationPolicyHash }).policyHash).toBe(vector.observationPolicyHash);
    }
  });
});

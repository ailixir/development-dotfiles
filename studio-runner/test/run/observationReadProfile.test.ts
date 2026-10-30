import { describe, expect, it } from 'vitest';

import { observationOptions } from '../../src/run/observationSanitizer.js';
import { ALL_DOMAINS } from '../../src/allowedDomains.js';
import { observationReadProfile, readGrantId, readRuleIdFor } from '../../src/run/observationReadProfile.js';

const DOMAINS = ['example.test', 'practicetestautomation.com', 'localhost'];

describe('the observation read profile', () => {
  it('turns structural discovery on and grants visible text in the application region of every whitelisted domain', () => {
    const profile = observationReadProfile(DOMAINS);
    expect(profile.allowStructuralDiscovery).toBe(true);
    expect(profile.readGrants).toEqual(
      DOMAINS.map((domain) => ({
        policyRuleId: readGrantId(domain),
        domain,
        region: { kind: 'application' },
        visibleText: { classification: 'permittedBusinessData' },
      })),
    );
  });

  it('grants no field value: a typed or pre-filled input is never readable', () => {
    for (const grant of observationReadProfile(DOMAINS).readGrants ?? []) expect(grant).not.toHaveProperty('controlValue');
  });

  it('derives the grant id from the whitelist entry alone, so learning and replay agree in every process', () => {
    expect(readGrantId('example.test')).toBe(readGrantId('example.test'));
    expect(readGrantId('example.test')).not.toBe(readGrantId('www.example.test'));
    expect(observationReadProfile(['example.test']).readGrants?.[0]?.policyRuleId).toBe(
      observationReadProfile(['other.test', 'example.test']).readGrants?.[1]?.policyRuleId,
    );
    expect(readGrantId('example.test').length).toBeLessThanOrEqual(256);
  });

  it('has no grant for an entry the list no longer holds, so a learned read recipe is refused under the new list', () => {
    const learned = observationReadProfile(['example.test']).readGrants?.[0]?.policyRuleId;
    expect(learned).toBeDefined();
    expect(observationReadProfile(['other.test']).readGrants?.map((grant) => grant.policyRuleId)).not.toContain(learned);
    expect(observationReadProfile([]).readGrants).toEqual([]);
  });

  it('is accepted by the collector contract for any whitelist up to the entry bound, and for the empty one', () => {
    const config = (domains: readonly string[]) => ({
      sessionId: 'session',
      scopeHash: 'a'.repeat(64),
      allowedDomains: domains,
      rules: [],
      knownSecrets: [],
      readProfile: observationReadProfile(domains),
    });
    expect(() => observationOptions(config(DOMAINS))).not.toThrow();
    expect(() => observationOptions(config([]))).not.toThrow();
    const thirtyTwo = Array.from({ length: 32 }, (_, index) => `site${String(index)}.test`);
    expect(() => observationOptions(config(thirtyTwo))).not.toThrow();
  });

  it('refuses a whitelist the grammar refuses, or a grant for a domain that is not on it', () => {
    const base = { sessionId: 'session', scopeHash: 'a'.repeat(64), rules: [], knownSecrets: [] };
    for (const bad of [['*.example.test'], ['Example.test'], ['127.0.0.1'], ['http://example.test'], ['a.test', 'www.a.test'], Array.from({ length: 33 }, (_, i) => `d${String(i)}.test`)]) {
      expect(() => observationOptions({ ...base, allowedDomains: bad }), bad.join(',')).toThrow('INVALID_CONTRACT');
    }
    expect(() => observationOptions({ ...base, allowedDomains: ['a.test'], readProfile: observationReadProfile(['b.test']) })).toThrow('INVALID_CONTRACT');
  });
});

describe('the observation read profile under allow-all (STUDIO_RUNNER_ALLOW_ALL_DOMAINS)', () => {
  const base = { sessionId: 'session', scopeHash: 'a'.repeat(64), rules: [], knownSecrets: [] };

  it('carries one grant for the entry `*`, keyed by a pure function of it, so no list has to be known', () => {
    const profile = observationReadProfile(ALL_DOMAINS);
    expect(profile.readGrants).toEqual([
      { policyRuleId: readGrantId('*'), domain: '*', region: { kind: 'application' }, visibleText: { classification: 'permittedBusinessData' } },
    ]);
    expect(profile.allowStructuralDiscovery).toBe(true);
    expect(readGrantId('*')).not.toBe(readGrantId('example.test'));
    expect(profile.readGrants?.[0]).not.toHaveProperty('controlValue');
  });

  it('is accepted by the collector contract, while a `*` among real entries or any other wildcard is still refused', () => {
    expect(() => observationOptions({ ...base, allowedDomains: ALL_DOMAINS, readProfile: observationReadProfile(ALL_DOMAINS) })).not.toThrow();
    for (const bad of [['*', 'example.test'], ['*.example.test'], ['**']]) {
      expect(() => observationOptions({ ...base, allowedDomains: bad }), bad.join(',')).toThrow('INVALID_CONTRACT');
    }
  });

  it('has a grant id no list-mode profile holds, so a recipe learned under a list is refused under allow-all and the reverse', () => {
    const ids = (domains: readonly string[]): (string | undefined)[] => (observationReadProfile(domains).readGrants ?? []).map((grant) => grant.policyRuleId);
    expect(ids(['example.test'])).not.toContain(readGrantId('*'));
    expect(ids(ALL_DOMAINS)).not.toContain(readGrantId('example.test'));
  });
});

describe('readRuleIdFor', () => {
  const idOf = (entry: string): string => readGrantId(entry);

  it('applies a read grant only on pages under its own entry, so changing the list ends a learned read', () => {
    const profile = observationReadProfile(['example.test', 'other.test']);
    expect(readRuleIdFor(profile, 'example.test')).toBe(idOf('example.test'));
    expect(readRuleIdFor(profile, 'www.example.test')).toBe(idOf('example.test'));
    expect(readRuleIdFor(profile, 'Other.TEST')).toBe(idOf('other.test'));
    // a host outside every entry, and a look-alike suffix that is not a subdomain, get no grant
    expect(readRuleIdFor(profile, 'elsewhere.test')).toBeNull();
    expect(readRuleIdFor(profile, 'notexample.test')).toBeNull();
    // the list no longer holds the entry: the id learned earlier is not given any more (READ_REFUSED at replay)
    const learned = readRuleIdFor(profile, 'example.test');
    expect(readRuleIdFor(observationReadProfile(['other.test']), 'example.test')).toBeNull();
    expect(readRuleIdFor(observationReadProfile(['other.test']), 'example.test')).not.toBe(learned);
    expect(readRuleIdFor(observationReadProfile([]), 'example.test')).toBeNull();
  });

  it('gives no grant when several entries cover the host, and the allow-all grant for every host', () => {
    const profile = observationReadProfile(['example.test', 'www.example.test']);
    expect(readRuleIdFor(profile, 'www.example.test')).toBeNull();
    expect(readRuleIdFor(profile, 'api.example.test')).toBe(idOf('example.test'));
    expect(readRuleIdFor(observationReadProfile(ALL_DOMAINS), 'anything.test')).toBe(idOf('*'));
  });

  it('gives no grant when the matching grant carries no visible-text read', () => {
    const profile = { policyRuleId: 'observed-structure-v1', allowStructuralDiscovery: true, readGrants: [{ policyRuleId: 'x', domain: 'example.test', region: { kind: 'application' as const } }] };
    expect(readRuleIdFor(profile as never, 'example.test')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import vectors from '../../docs/specs/studio-observed-authoring/contracts/v3/publication-canonical-vectors.json' with { type: 'json' };
import { canonicalObserved, hashObserved, parseObservedBytes, validateTrustedPolicy, observationPolicy, OBSERVED_LIMITS } from '../src/validator/observedReferencePolicy.js';
import type { Scope, TrustedPolicy } from '../src/executor/observedOperations.js';
const scope: Scope = { principalId: 'p', csiId: 'CSI', environment: 'fixture', applicationId: 'app',  allowedOrigins: ['https://example.test'], capabilities: ['read'], policyId: 'policy', policyVersion: '1', entryPolicyId: 'entry', initialContext: { kind: 'initialBlank' } };
const policy = (): TrustedPolicy => ({ version: 1, policyId: 'policy', policyVersion: '1', applicationId: 'app', environment: 'fixture',  allowedOrigins: scope.allowedOrigins, entryPolicyId: 'entry', applicationPolicy: null, rules: [{ testId: 'one', name: 'Reference', policyRuleId: 'shared', classification: 'permittedBusinessData' }, { testId: 'two', name: 'Other', policyRuleId: 'shared', classification: 'permittedBusinessData' }] });
describe('packaged canonical and faithful current policy contracts', () => {
    it.each(vectors.positive)('matches independent canonical-v1 $name', v => { expect(Buffer.from(canonicalObserved(v.input)).toString('hex')).toBe(v.canonicalUtf8Hex); expect(hashObserved(v.input)).toBe(v.sha256); });
    it.each(vectors.negative)('refuses raw $name', v => { expect(() => parseObservedBytes(Buffer.from(v.utf8Hex, 'hex'), OBSERVED_LIMITS.validation)).toThrow(); });
    it('preserves field-only support and repeated rule IDs without invented discovery', () => { const p = validateTrustedPolicy(policy(), scope); expect(observationPolicy(p)).not.toHaveProperty('applicationPolicy'); expect(p.rules).toHaveLength(2); });
    it.each(['false-discovery', '33-grants', 'duplicate-grant-id', 'duplicate-field-id', 'wrong-accessible-name', 'no-read-kind'])('refuses %s', name => {
        const grant = { policyRuleId: 'read', origin: 'https://example.test', region: { kind: 'application' }, visibleText: { classification: 'permittedBusinessData' } };
        const p = JSON.parse(JSON.stringify(policy())) as Record<string, unknown>;
        if (name === 'false-discovery')
            p.applicationPolicy = { policyRuleId: 'app', allowStructuralDiscovery: false, readGrants: [] };
        if (name === '33-grants')
            p.applicationPolicy = { policyRuleId: 'app', allowStructuralDiscovery: true, readGrants: Array.from({ length: 33 }, (_, i) => ({ ...grant, policyRuleId: 'r' + String(i) })) };
        if (name === 'duplicate-grant-id')
            p.applicationPolicy = { policyRuleId: 'app', allowStructuralDiscovery: true, readGrants: [grant, { ...grant, region: { kind: 'role', role: 'main', name: 'region', exact: true } }] };
        if (name === 'duplicate-field-id')
            p.rules = [policy().rules[0], policy().rules[0]];
        if (name === 'wrong-accessible-name')
            p.rules = [{ ...policy().rules[0], accessibleName: 'other' }];
        if (name === 'no-read-kind')
            p.applicationPolicy = { policyRuleId: 'app', allowStructuralDiscovery: true, readGrants: [{ policyRuleId: 'read', origin: 'https://example.test', region: { kind: 'application' } }] };
        expect(() => validateTrustedPolicy(p, scope)).toThrow();
    });
});
import { sortInputRecipes } from '../src/validator/observedReplay.js';
import type { InputRecipe } from '../src/executor/observedOperations.js';
it('implements the complete source-position/span/slot/config total order', () => {
    const steps = ['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001'];
    const span = (inputId: string, start: number, end: number, slot: 'fill.value' | 'assert.expected' = 'fill.value', stepId = required(steps[0])): InputRecipe => ({ inputId, stepId, kind: 'nonsecretText', intendedSlot: slot, provenance: { kind: 'sourceSpan', start, end, sourceHash: 'a'.repeat(64) } });
    const cfg = (inputId: string, referenceId: string): InputRecipe => ({ inputId, stepId: required(steps[0]), kind: 'nonsecretText', intendedSlot: 'fill.value', provenance: { kind: 'configuration', referenceId, referenceName: referenceId } });
    const unordered = [span('b', 2, 5), span('a', 2, 4), span('c', 2, 5, 'assert.expected'), cfg('d', 'cfg-b'), cfg('e', 'cfg-a'), span('f', 0, 1, 'fill.value', required(steps[1]))];
    expect(sortInputRecipes(unordered, steps).map(i => i.inputId)).toEqual(vectors.inputRecipeOrder);
});
import { equalsOriginalTargetIntent } from '../src/validator/observedReferencePolicy.js';
it.each([['LABEL-INPUT', 'label-input', true], ['CAFÉ', 'café', true], ['I', 'ı', true], ['İ', 'i', true], ['Σ', 'ς', true], ['ẞ', 'ß', true], ['SS', 'ß', false], ['𐐀', '𐐨', true], ['é', 'é', false], ['label', 'label-input', false]] as const)('matches original Java21 target case semantics for %s/%s', (a, b, expected) => { expect(equalsOriginalTargetIntent(a, b)).toBe(expected); });
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}

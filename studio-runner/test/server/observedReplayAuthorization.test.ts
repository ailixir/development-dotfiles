import { describe, it, expect } from 'vitest';
import fixture from '../../../docs/specs/studio-observed-authoring/contracts/v2/publication-fixtures.json' with { type: 'json' };
import { validateObservedJob } from '../../src/validator/observedReplay.js';
import type { TrustedPolicy } from '../../src/executor/observedOperations.js';
import {hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH} from '../../src/validator/observedReferencePolicy.js';
const currentBuild={...fixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
// Explicit new test authorization; historical fixture bytes and build pins remain unchanged.
function currentJob(){const j=structuredClone(fixture.job);j.binding.requiredBuild={...currentBuild};j.binding.replayGrant.buildHash=hashObserved(currentBuild);return j;}
const now = Date.parse(fixture.job.binding.replayGrant.issuedAt) + 1;
describe('ordinary observed authority joins', () => {
    it('accepts full configuration independently of recording geometry', () => { expect(validateObservedJob(currentJob(), currentBuild, fixture.trustedPolicy as TrustedPolicy, now).recording).not.toEqual(fixture.job.configuration.viewport); });
    it('refuses the retained historical exact build on a changed bundle despite equal Profile',()=>{expect(()=>validateObservedJob(fixture.job,currentBuild,fixture.trustedPolicy as TrustedPolicy,now)).toThrow('PROFILE_MISMATCH');});
    it.each(['principal', 'attempt', 'revision', 'account', 'profile', 'build', 'viewport', 'wait', 'environment', 'policy', 'expired', 'extra-input', 'input-id', 'destination-origin'])('refuses %s swap before admission', kind => {
        const j = currentJob();
        if (kind === 'principal')
            j.binding.principalId = 'other';
        if (kind === 'attempt')
            j.binding.attemptId = '00000000-0000-4000-8000-000000000999';
        if (kind === 'revision')
            j.binding.revisionDigest = 'e'.repeat(64);
        if (kind === 'account')
            j.accountHandle.authorization.grantId = '00000000-0000-4000-8000-000000000999';
        if (kind === 'profile')
            j.binding.requiredProfile.catalog = 'other';
        if (kind === 'build')
            j.binding.requiredBuild.executableImageDigest = 'e'.repeat(64);
        if (kind === 'viewport')
            j.configuration.viewport.width++;
        if (kind === 'wait')
            j.configuration.waitStrategy = 'load';
        if (kind === 'environment')
            j.configuration.environment = 'prod';
        if (kind === 'policy')
            j.binding.currentPolicyHash = 'e'.repeat(64);
        if (kind === 'expired')
            j.binding.replayGrant.expiresAt = j.binding.replayGrant.issuedAt;
        if (kind === 'extra-input')
            j.inputs.push({ inputId: 'extra', value: 'private' });
        if (kind === 'input-id')
            required(j.inputs[0]).inputId = 'wrong';
        if (kind === 'destination-origin')
            required(j.inputs[0]).value = 'https://unapproved.test';
        expect(() => validateObservedJob(j, currentBuild, fixture.trustedPolicy as TrustedPolicy, now)).toThrow();
    });
});
function required<T>(value: T | null | undefined): T {
    if (value === null || value === undefined)
        throw new Error("Missing controlled fixture value");
    return value;
}

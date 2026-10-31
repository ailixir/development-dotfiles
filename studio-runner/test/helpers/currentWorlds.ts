import { TEST_DOMAINS } from './allowedDomains.js';
import {deepStrictEqual} from 'node:assert';
import {publicationFixture} from './publicationFixture.js';
import type {TestDocument} from './publicationFixture.js';
import {deriveObservedArtifact,validateObservedJob} from '../../src/validator/observedReplay.js';
import {hashObserved} from '../../src/validator/observedReferencePolicy.js';
import type {BuildIdentity,ObservedJob } from '../../src/executor/observedOperations.js';
type Reference=NonNullable<typeof publicationFixture.controlValueReference>;
/** The sealed current-world parent (E5 reseal): a complete, fully checked synthetic basis, artifact and hash set. Never call this on a mutated negative.
 * Opaque revision/build labels are test transport facts, not recovered browser or DB history. */
export function currentReference(kind:'control'|'configuration'):Reference {
  const canonical=kind==='control'?publicationFixture.controlValueReference:publicationFixture.controlValueReferenceUsedConfiguration;
  if(!canonical)throw new Error('MISSING_DECLARED_CURRENT_WORLD');
  const parent=structuredClone(canonical);
  deepStrictEqual(deriveObservedArtifact(parent.basis),{artifact:parent.artifact,hashes:parent.hashes},'actual runtime must accept the complete synthetic parent before mutation');
  return parent;
}
/** Fresh unit grant for the exact canonical effective job. No history or value repair is performed. */
export function currentJob(build:BuildIdentity,options:{now?:number;executionId?:string;attemptId?:string;totalRuntimeMs?:number}={}):ObservedJob {
  const job=structuredClone(publicationFixture.job),now=options.now??Date.now();
  job.binding.requiredBuild={...build};job.binding.replayGrant.buildHash=hashObserved(build);
  job.binding.replayGrant.issuedAt=new Date(now-100).toISOString();job.binding.replayGrant.expiresAt=new Date(now+25000).toISOString();
  // Validate the unmutated baseline before applying caller-owned identity/runtime variations.
  validateObservedJob(job,build,TEST_DOMAINS,now);
  if(options.executionId!==undefined){job.binding.executionId=options.executionId;job.binding.replayGrant.executionId=options.executionId;}
  if(options.attemptId!==undefined){job.binding.attemptId=options.attemptId;job.binding.replayGrant.attemptId=options.attemptId;}
  if(options.totalRuntimeMs!==undefined)job.runtime.totalRuntimeMs=options.totalRuntimeMs;
  return validateObservedJob(job,build,TEST_DOMAINS,now);
}
/** Mutable copy for deliberately adversarial tests, after baseline validation has succeeded. */
export function mutableCurrentJob(build:BuildIdentity,now=Date.now()):TestDocument<ObservedJob> {return structuredClone(currentJob(build,{now})) as TestDocument<ObservedJob>;}

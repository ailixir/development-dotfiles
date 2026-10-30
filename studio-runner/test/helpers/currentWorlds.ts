import { TEST_DOMAINS } from './allowedDomains.js';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {deepStrictEqual,strictEqual} from 'node:assert';
import {publicationFixture} from './publicationFixture.js';
import type {TestDocument} from './publicationFixture.js';
import {parseDocumentJson} from './documentJson.js';
import {deriveObservedArtifact,validateObservedJob} from '../../src/validator/observedReplay.js';
import {hashObserved} from '../../src/validator/observedReferencePolicy.js';
import type {AuthoredInputs,BuildIdentity,ObservedJob } from '../../src/executor/observedOperations.js';
type Reference=typeof publicationFixture.observedChoice;
interface DeclaredWorld {name:'choice'|'control';privateSyntheticInputEnvelopeFixtureOnly:AuthoredInputs;snapshotEvidence:unknown}
interface CurrentVectorFactory {ordinary(template:unknown,world:DeclaredWorld,options?:{control?:boolean;usedConfiguration?:boolean}):Reference}
// Constant trusted repository tooling only. No fixture/code/string selects a module to execute.
const factory=createRequire(import.meta.url)('../../../tools/studio-current-vector-factory.cjs') as CurrentVectorFactory;
const seeds=parseDocumentJson(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/current-synthetic-worlds.json',import.meta.url)),33554432) as {classification:string;worlds:DeclaredWorld[]};
/** A freshly constructed, fully checked synthetic parent. Never call this on a mutated negative.
 * Opaque revision/build labels are test transport facts, not recovered browser or DB history. */
export function currentReference(kind:'choice'|'control'|'configuration'):Reference {
  strictEqual(seeds.classification,'CURRENT_SYNTHETIC_NO_BROWSER_OR_DB_HISTORY');
  const world=seeds.worlds.find(item=>item.name===(kind==='choice'?'choice':'control'));
  const canonical=kind==='choice'?publicationFixture.observedChoice:kind==='control'?publicationFixture.controlValueReference:publicationFixture.controlValueReferenceUsedConfiguration;
  if(!world||!canonical)throw new Error('MISSING_DECLARED_CURRENT_WORLD');
  const parent=factory.ordinary(canonical,world,{control:kind!=='choice',usedConfiguration:kind==='configuration'});
  deepStrictEqual({basis:parent.basis,artifact:parent.artifact,hashes:parent.hashes},{basis:canonical.basis,artifact:canonical.artifact,hashes:canonical.hashes},'permanent factory must reproduce the exact current canonical parent');
  strictEqual(parent.basis.authoredInputsHash,hashObserved(world.privateSyntheticInputEnvelopeFixtureOnly));
  deepStrictEqual(parent.basis.snapshotEvidence,world.snapshotEvidence);
  const raw=world.privateSyntheticInputEnvelopeFixtureOnly.inputs;
  strictEqual(parent.basis.materializationEvidence.entries.length,raw.length);
  for(const [index,input]of raw.entries()){
    const entry=parent.basis.materializationEvidence.entries[index];if(!entry)throw new Error('MISSING_CURRENT_INPUT_ENTRY');
    strictEqual(entry.inputOrdinal,index);strictEqual(entry.inputHash,hashObserved(input));
    deepStrictEqual(entry.metadata,Object.fromEntries(Object.entries(input).filter(([key])=>key!=='value')));
  }
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

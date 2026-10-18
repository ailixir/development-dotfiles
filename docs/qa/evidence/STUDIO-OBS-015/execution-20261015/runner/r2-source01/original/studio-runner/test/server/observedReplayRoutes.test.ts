import {describe,it,expect} from 'vitest';
import {publicationFixture as fixture} from '../helpers/publicationFixture.js';
import {createApplication} from '../../src/server/application.js';
import {loadConfig} from '../../src/server/config.js';
import {createFakeScratchStore} from '../helpers/runner.js';
import {createRecordingLogSink} from '../../src/server/logging.js';
import type {TrustedPolicy} from '../../src/executor/observedOperations.js';
import {OBSERVED_SCHEMA_BUNDLE_HASH,hashObserved} from '../../src/validator/observedReferencePolicy.js';
const currentBuild={...fixture.build,schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH};
const validationRequest={...fixture.validationRequest,requiredBuild:currentBuild};
describe('actual authenticated observed validation HTTP route',()=>{
  it('validates original immutable evidence without admission/browser and refuses malformed family/auth/bytes',async()=>{
    let network=0,launches=0;const logs=createRecordingLogSink();
    const app=createApplication(loadConfig({STUDIO_RUNNER_HOST:'127.0.0.1',STUDIO_RUNNER_PORT:'0',STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:'https://backend.test'}),{runtimeVersions:{},scratch:createFakeScratchStore(),launcher:{launch(){launches++;return Promise.reject(Error('no browser'));}},http:{send(){network++;return Promise.resolve({kind:'timeout' as const});}},observed:{build:currentBuild,policies:[fixture.trustedPolicy as TrustedPolicy],validationEnabled:true,replayEnabled:false},logSink:logs});
    try{
      const port=await app.start(),url=`http://127.0.0.1:${String(port)}/v2/validate-observed`;
      const send=(body:string|Uint8Array,authorization='Bearer service')=>fetch(url,{method:'POST',headers:{authorization,'content-type':'application/json'},body:typeof body==='string'?body:new Uint8Array(Array.from(body)).buffer});
      const okay=await send(JSON.stringify(validationRequest));expect(okay.status).toBe(200);expect(await okay.json()).toMatchObject({ok:true,basisHash:fixture.validationRequest.basisHash,artifactHash:fixture.job.binding.artifactHash});
      expect((await send('not JSON','Bearer wrong')).status).toBe(403);
      expect((await send(new Uint8Array([0xff,0xfe]))).status).toBe(400);
      expect((await send('{"schemaVersion":2,"schemaVersion":2}')).status).toBe(400);
      const denied=await send(JSON.stringify({...fixture.validationRequest,privateField:'UNKNOWN-CANARY'}));expect(denied.status).toBe(400);expect(await denied.text()).not.toContain('UNKNOWN-CANARY');
      const staleBuildRequest={...validationRequest,requiredBuild:{...currentBuild,schemaBundleHash:'0'.repeat(64)}};
      expect(staleBuildRequest.requiredProfile).toEqual(validationRequest.requiredProfile);
      expect((await send(JSON.stringify(staleBuildRequest))).status).toBe(400); // Explicit unsupported exact bundle; canonical positives may be re-pinned.
      const choiceRequest={...validationRequest,validationBasis:fixture.observedChoice.basis,artifact:fixture.observedChoice.artifact,basisHash:hashObserved(fixture.observedChoice.basis)};
      const chosen=await send(JSON.stringify(choiceRequest));expect(chosen.status).toBe(200);expect(await chosen.json()).toMatchObject({ok:true,artifactHash:fixture.observedChoice.hashes.artifactHash});
      expect((await send(JSON.stringify({oversize:'a'.repeat(8388608)}))).status).toBe(413);
      expect(network).toBe(0);expect(launches).toBe(0);expect(app.pool.inUse).toBe(0);expect(logs.lines.join('\n')).not.toContain('UNKNOWN-CANARY');
    }finally{await app.drain();}
  });
});

import {readFileSync} from 'node:fs';
import {parseYaml,resolveRef,validateAgainstSchema,requestSchema,responseSchema} from '../helpers/openapi.js';
import type {YamlMapping} from '../helpers/openapi.js';
describe('strict local observed contract reference extension',()=>{
  const document=parseYaml(readFileSync(new URL('../../../docs/specs/studio/openapi.yaml',import.meta.url),'utf8'));
  it('checks all three observed operations, exact service authority, examples, ACK and ambiguity',()=>{
    const root=document as YamlMapping,paths=root.paths as YamlMapping;
    for(const [path,value,status,response]of [
      ['/v2/validate-observed',fixture.validationRequest,200,fixture.examples.ValidationVerdict.value],
      ['/v2/runs',fixture.job,202,{code:'ADMITTED'}],
      ['/internal/studio/executions/{id}/observed-admission',fixture.admissionRequest,200,fixture.admissionReceipt],
    ] as const){const operation=(paths[path] as YamlMapping).post as YamlMapping;expect(operation.security).toEqual([{serviceIdentity:[]}]);expect(operation['x-internal']).toBe(true);const where={path,method:'post'};expect(validateAgainstSchema(value,requestSchema(document,where),document)).toEqual([]);expect(validateAgainstSchema(response,responseSchema(document,where,status),document)).toEqual([]);}
    const runs=((paths['/v2/runs'] as YamlMapping).post as YamlMapping).responses as YamlMapping;expect(runs['503']).toBeDefined();expect(JSON.stringify(runs['503'])).toMatch(/admission ambiguous.*no retry/u);
  });
  it('preserves the external document for nested local learned-plan references',()=>{
    const decoy=parseYaml('definitions:\n  blankAction: {const: WRONG}\n  observedAction: {const: WRONG}\n');
    const schema={$ref:'../studio-observed-authoring/contracts/v3/learned-plan.schema.json'};
    expect(validateAgainstSchema(fixture.artifact.learnedPlan,schema,decoy)).toEqual([]);
    expect(validateAgainstSchema({...fixture.artifact.learnedPlan,source:'FORBIDDEN'},schema,decoy).length).toBeGreaterThan(0);
    expect(resolveRef(decoy,{$ref:'https://checks.citi.example/contracts/observed/v3/replay-validation.schema.json#/definitions/ValidationBasis'})).toHaveProperty('additionalProperties',false);
  });
  it.each(['https://attacker.test/schema.json','../studio-observed-authoring/contracts/v2/../../secret','../studio-observed-authoring/contracts/v2/not-allowlisted.schema.json','https://checks.citi.example/contracts/observed/v2/missing.schema.json','#/__proto__','#/constructor','#/../secret'])('refuses %s without generic file/network lookup',ref=>{expect(()=>resolveRef(document,{$ref:ref})).toThrow();});
  it('retains duplicate-key refusal and bounds cycles/recursive schemas',()=>{
    expect(()=>parseYaml('a: 1\na: 2\n')).toThrow();expect(()=>resolveRef({a:{$ref:'#/a'}},{$ref:'#/a'})).toThrow('Circular');
    const recursive:YamlMapping={};recursive.allOf=[recursive];expect(validateAgainstSchema({},recursive,recursive).some(v=>v.includes('recursion'))).toBe(true);
  });
});

it.each([[false,false],[false,true],[true,false],[true,true]] as const)('keeps validation=%s and replay=%s flags independent',async(validationEnabled,replayEnabled)=>{
  const app=createApplication(loadConfig({STUDIO_RUNNER_HOST:'127.0.0.1',STUDIO_RUNNER_PORT:'0',STUDIO_RUNNER_SERVICE_IDENTITY:'service',STUDIO_RUNNER_CALLBACK_IDENTITY:'callback',STUDIO_RUNNER_CALLBACK_BASE_URL:'https://backend.test'}),{runtimeVersions:{},scratch:createFakeScratchStore(),launcher:{launch(){return Promise.reject(Error('no browser'));}},http:{send(){return Promise.reject(Error('no send'));}},observed:{build:currentBuild,policies:[fixture.trustedPolicy as TrustedPolicy],validationEnabled,replayEnabled},logSink:createRecordingLogSink()});
  try{const port=await app.start();const headers={authorization:'Bearer service','content-type':'application/json'};const response=await fetch(`http://127.0.0.1:${String(port)}/v2/validate-observed`,{method:'POST',headers,body:JSON.stringify(validationRequest)});expect(response.status).toBe(validationEnabled?200:503);const replay=await fetch(`http://127.0.0.1:${String(port)}/v2/runs`,{method:'POST',headers,body:JSON.stringify(fixture.job)});expect(replay.status).toBe(replayEnabled?409:503);expect(app.pool.inUse).toBe(0);}finally{await app.drain();}
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileManifest,headFromFilesystem,freezeProblems,appendFreezeCheckpoint} from './freeze.ts';
import {goodBundle} from './testkit.ts';
import {loadCanaries} from './environment.ts';
test('full manifest detects additions, deletions, contents and external-core changes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gate-freeze-'));
  try{writeFileSync(join(dir,'a'),'one');const first=fileManifest(dir,['.']);writeFileSync(join(dir,'b'),'two');assert.notEqual(fileManifest(dir,['.']).digest,first.digest);rmSync(join(dir,'b'));assert.equal(fileManifest(dir,['.']).digest,first.digest);writeFileSync(join(dir,'a'),'changed');assert.notEqual(fileManifest(dir,['.']).digest,first.digest);symlinkSync('/tmp',join(dir,'link'));assert.throws(()=>fileManifest(dir,['.']),/SYMLINK/);}finally{rmSync(dir,{recursive:true,force:true});}
  for(const mutate of ['external','setting','artifact','process'] as const){const checkpoints=structuredClone(goodBundle(false).freeze!);const last=checkpoints[1]!.freeze;if(mutate==='external')last.externalCore!.source.digest='changed';if(mutate==='setting')last.nonsecretSettings.model='changed';if(mutate==='artifact')last.artifactDigest='changed';if(mutate==='process')last.processIdentities[0]!.startedAt='changed';assert.ok(freezeProblems(checkpoints,false).includes('STICKY_FREEZE_MISMATCH'));}
});
test('filesystem HEAD resolves detached, symbolic and packed refs; cycles/traversal rejected without Git',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gate-head-'));const meta=join(dir,'.git');mkdirSync(join(meta,'refs/heads'),{recursive:true});const oid='a'.repeat(40);
  try{writeFileSync(join(meta,'HEAD'),oid);assert.equal(headFromFilesystem(dir),oid);writeFileSync(join(meta,'HEAD'),'ref: refs/heads/main');writeFileSync(join(meta,'refs/heads/main'),oid);assert.equal(headFromFilesystem(dir),oid);rmSync(join(meta,'refs/heads/main'));writeFileSync(join(meta,'packed-refs'),`${oid} refs/heads/main\n`);assert.equal(headFromFilesystem(dir),oid);writeFileSync(join(meta,'HEAD'),'ref: refs/../../outside');assert.throws(()=>headFromFilesystem(dir));writeFileSync(join(meta,'HEAD'),'ref: refs/heads/loop');writeFileSync(join(meta,'refs/heads/loop'),'ref: refs/heads/loop');assert.throws(()=>headFromFilesystem(dir),/INVALID/);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('freeze baseline is create-once and incomplete external closure blocks',()=>{const dir=mkdtempSync(join(tmpdir(),'gate-baseline-'));try{const c=goodBundle(false).freeze![0]!;appendFreezeCheckpoint(dir,c);assert.throws(()=>appendFreezeCheckpoint(dir,c),/EEXIST/);c.freeze.externalCore=null;assert.ok(freezeProblems([c],false).length>0);}finally{rmSync(dir,{recursive:true,force:true});}});

test('current canary loading never reads the retired login secret and accepts existing GATE_CANARY alone',()=>{
  const dir=mkdtempSync(join(tmpdir(),'gate-canary-'));
  try {
    const path=join(dir,'general-canary');writeFileSync(path,'synthetic-general-privacy-canary\n');
    const env:NodeJS.ProcessEnv={CHECKS_GATE_CANARY_FILE:path};
    Object.defineProperty(env,'CHECKS_GATE_L1_SECRET',{get(){throw new Error('RETIRED_SECRET_READ');}});
    assert.deepEqual(loadCanaries(env),[{label:'GATE_CANARY',value:'synthetic-general-privacy-canary',cls:'SECRET'}]);
    assert.deepEqual(loadCanaries({}),[]);
    writeFileSync(path,'');assert.deepEqual(loadCanaries(env),[]);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

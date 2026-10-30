import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main,scanCommandExit} from './gate-cli.ts';
import {createSameDayAnchor,anchorProblems} from './anchor.ts';
import {cleanScan,goodBundle} from './testkit.ts';
import type {ScanFile} from './evaluate.ts';
const file=():ScanFile=>({rawSnapshot:{directory:'scan-attempts/initial-a',manifest:{entries:[],digest:'a'.repeat(64)}},dataDigest:'a'.repeat(64),runId:'rg-20261027-1',generatedAt:'2026-10-27T13:00:00Z',nextday:false,authoritative:true,exercised:{},scan:cleanScan()});
test('actual CLI scan path rejects PAGE_ORIGIN/contradictory counters/missing canaries and accepts complete clean evidence',async()=>{for(const mutation of ['clean','page','counter','canaries','coverage','run'] as const){const f=file();const requestedRun=f.runId;if(mutation==='run')f.runId='rg-20261028-2';if(mutation==='page'){f.scan.pageOrigin=1;f.scan.hits.push({source:'db',file:'x',offset:0,canary:'GATE_CANARY',cls:'SECRET',form:'raw',verdict:'PAGE_ORIGIN',reason:'PAGE_ORIGIN'});}if(mutation==='counter')f.scan.leak=1;if(mutation==='canaries')f.scan.canaries=[];if(mutation==='coverage')f.scan.sources=[];const code=await main(['scan','--run',requestedRun],{scan:async()=>f});assert.equal(code,mutation==='clean'?0:1);}});
test('same-day event uses actual invocation timestamp, creates once and rejects tamper/backing identity',()=>{const dir=mkdtempSync(join(tmpdir(),'gate-seal-'));try{const {eventHash,occurredAt,...body}=goodBundle().anchor!;void eventHash;void occurredAt;assert.throws(()=>createSameDayAnchor(dir,body,false));const before=Date.now(),a=createSameDayAnchor(dir,body,true);assert.ok(Date.parse(a.occurredAt)>=before);assert.throws(()=>createSameDayAnchor(dir,body,true),/EEXIST/);assert.equal(JSON.parse(readFileSync(join(dir,'same-day-pass.json'),'utf8')).eventHash,a.eventHash);assert.deepEqual(anchorProblems(a,a.runId,a.evidenceDigest,a.sourceDigest,a.caseIds),[]);assert.ok(anchorProblems({...a,occurredAt:'2026-01-01T00:00:00Z'},a.runId,a.evidenceDigest,a.sourceDigest,a.caseIds).length>0);}finally{rmSync(dir,{recursive:true,force:true});}});
test('direct scan boundary accepts no login exercise but rejects a crossed stage or nonauthoritative scan',()=>{assert.equal(scanCommandExit(file()),0);const f=file();f.nextday=true;assert.equal(scanCommandExit(f),1);f.nextday=false;f.authoritative=false;assert.equal(scanCommandExit(f),1);});

test('removed --nextday is rejected explicitly before collect, scan or any command side effects',async()=>{
  let called=false;
  for(const command of ['collect','scan','evaluate','init'])for(const removed of [['--nextday'],['--nextday','true'],['--nextday','false'],['--nextday=true'],['--nextday=false']]) {
    await assert.rejects(()=>main([command,'--run','rg-20261027-1',...removed],{scan:async()=>{called=true;return file();}}),/--nextday was removed/);
  }
  assert.equal(called,false);
});

test('actual proxy CLI rejects non18xxx port flags before starting a recorder',async()=>{
  for(const port of ['8080','8090','5181','14177','19000'])await assert.rejects(()=>main(['proxy','--run','dry-20261028-1','--port',port]),/live dev stack|18000 and18999/);
});

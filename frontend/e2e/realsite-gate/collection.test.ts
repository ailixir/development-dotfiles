import {recordUiText} from './ui-text.ts';
import type {Canary} from './leakscan.ts';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectPlaywright,collectionRecords,rawManifest} from './collection.ts';
import {sameDayEvidenceDigest} from './anchor.ts';
import {runScan} from './scanrun.ts';
import type {CollectedScanInputs} from './scanrun.ts';
import {REQUIRED_SCAN_SOURCES} from './leakscan.ts';
import {scanCommandExit} from './gate-cli.ts';
import {scanEvidenceDigest} from './scan-identity.ts';
function fixture(fn:(root:string,run:string,inputs:CollectedScanInputs)=>void):void {
  const root=mkdtempSync(join(tmpdir(),'gate-raw-')),run=join(root,'dry-20261028-1');mkdirSync(run);
  const canaries:Canary[]=[{label:'GATE_CANARY',value:'synthetic-secret-canary',cls:'SECRET'}];const inputs:CollectedScanInputs={canaries,sources:REQUIRED_SCAN_SOURCES.map((name)=>{const path=join(root,name);mkdirSync(path);if(name==='ui')recordUiText(path,'raw.txt','original-safe-bytes',canaries,'dry-20261028-1');else writeFileSync(join(path,name==='gateway'?'0001.req.json':'raw.txt'),'original-safe-bytes');return{name,root:path,mayCarryPageText:()=>false};}),db:{tables:1,rows:1,bytes:19},exercised:{}};
  try{fn(root,run,inputs);}finally{rmSync(root,{recursive:true,force:true});}
}
test('same-day recollection appends raw Playwright/DB snapshots and preserves earlier evidence',()=>fixture((root,run,inputs)=>{
  const input=join(root,'playwright-input');mkdirSync(input);writeFileSync(join(input,'output.txt'),'first-collection');
  const first=collectPlaywright(run,false,input);const options={root,runId:'dry-20261028-1',includePlaywrightOutput:true,collect:()=>inputs};
  const scan=runScan(options),dbPath=join(run,scan.rawSnapshot!.directory,'sources','db','raw.txt'),initialDb=readFileSync(dbPath,'utf8');
  const firstPw=join(run,first.directory,'playwright','output.txt'),initialPw=readFileSync(firstPw,'utf8');
  const before=sameDayEvidenceDigest(run);
  writeFileSync(join(input,'output.txt'),'second-collection');const repeated=collectPlaywright(run,false,input);
  writeFileSync(join(root,'db','raw.txt'),'second-db-snapshot');const rescan=runScan(options);
  assert.notEqual(repeated.directory,first.directory);assert.notEqual(rescan.rawSnapshot!.directory,scan.rawSnapshot!.directory);
  assert.equal(readFileSync(firstPw,'utf8'),initialPw);assert.equal(readFileSync(dbPath,'utf8'),initialDb);
  assert.equal(rawManifest(join(run,scan.rawSnapshot!.directory)).digest,scan.rawSnapshot!.manifest.digest);
  assert.notEqual(sameDayEvidenceDigest(run),before,'new same-day evidence changes the seal input');
  assert.equal(collectionRecords(run,false).length,2);assert.equal(collectionRecords(run,true).length,0);
  assert.equal(rescan.nextday,false);assert.deepEqual(rescan.exercised,{});
}));
test('actual same-day collector scans diagnostic JSON and rejects a missing required sink',()=>fixture((root,run,inputs)=>{
  const options={root,runId:'dry-20261028-1',includePlaywrightOutput:true,collect:()=>inputs};
  const clean=runScan(options);assert.equal(scanCommandExit(clean),0);assert.ok(!clean.scan.sources.some((s)=>s.name==='nextday'));
  mkdirSync(join(run,'diagnostics'));writeFileSync(join(run,'diagnostics','only-diagnostic.json'),JSON.stringify({value:'synthetic-secret-canary'}));
  const diagnostics=runScan(options);assert.equal(scanCommandExit(diagnostics),1);assert.ok(diagnostics.scan.hits.some((h)=>h.source==='diagnostics'));
  writeFileSync(join(run,'diagnostics','only-diagnostic.json'),'{}');rmSync(join(root,'runner'),{recursive:true});
  const missing=runScan(options);assert.equal(scanCommandExit(missing),1);assert.ok(missing.scan.sources.some((s)=>s.name==='runner'&&!s.present));
}));
test('tampering retained first-day raw support changes the seal digest and fails collection verification',()=>fixture((root,run)=>{
  const input=join(root,'playwright-input');mkdirSync(input);writeFileSync(join(input,'output.txt'),'original');const first=collectPlaywright(run,false,input);const before=sameDayEvidenceDigest(run);writeFileSync(join(run,first.directory,'playwright','output.txt'),'tampered');assert.notEqual(sameDayEvidenceDigest(run),before);assert.throws(()=>collectionRecords(run,false),/MISMATCH/);
}));

test('incomplete earlier raw scan support cannot be hidden by a later clean collector attempt',()=>fixture((root,run,inputs)=>{
  const partial=join(run,'scan-attempts','initial-deadbeef');mkdirSync(partial,{recursive:true});writeFileSync(join(partial,'unscanned.json'),JSON.stringify({value:'synthetic-secret-canary'}));
  assert.throws(()=>runScan({root,runId:'dry-20261028-1',includePlaywrightOutput:true,collect:()=>inputs}),/INCOMPLETE_PRIOR_SCAN_SNAPSHOT/);
}));

const clockId='150e8c95-7254-49ec-ae13-a844db058c52';
const journalName=`iana-home-main-${clockId}.jsonl`;
const journalBytes=():string=>[
  {schemaVersion:1,runId:'dry-20261028-1',testId:'closed-test-id',clockId,event:'START',detail:{atMs:0,ceilingMs:120000,method:'CONSERVATIVE_MONOTONIC'}},
  {schemaVersion:1,runId:'dry-20261028-1',testId:'closed-test-id',clockId,event:'TERMINAL_TIMING_FAILURE',detail:{code:'STEP_LEARNING_TIMEOUT',atMs:120001}},
  {schemaVersion:1,runId:'dry-20261028-1',testId:'closed-test-id',clockId,event:'CANCEL_REQUEST',detail:{sessionId:'closed-session-id',atMs:120002,idempotencyKey:'2b852ecd-eac8-43db-9fc8-b45dd2c2e4dd'}},
  {schemaVersion:1,runId:'dry-20261028-1',testId:'closed-test-id',clockId,event:'CANCEL_SETTLED',detail:{sessionId:'closed-session-id',atMs:120003,status:202}},
].map((record)=>JSON.stringify(record)).join('\n')+'\n';

test('actual collector hashes and snapshots every timing JSONL byte with complete strict scan coverage',()=>fixture((root,run,inputs)=>{
  const directory=join(run,'diagnostics','learning-timing');mkdirSync(directory,{recursive:true});
  const journal=join(directory,journalName),bytes=journalBytes();writeFileSync(journal,bytes);
  writeFileSync(join(run,'diagnostics','existing-flat.json'),'{}');
  const digest=scanEvidenceDigest(run,false);
  const clean=runScan({root,runId:'dry-20261028-1',includePlaywrightOutput:true,collect:()=>inputs});
  assert.equal(clean.dataDigest,digest);assert.equal(scanCommandExit(clean),0);
  assert.equal(clean.scan.hits.length,0);assert.equal(clean.scan.leak,0);assert.equal(clean.scan.pageOrigin,0);
  for(const source of [...REQUIRED_SCAN_SOURCES,'diagnostics'])assert.ok(clean.scan.sources.some((entry)=>entry.name===source&&entry.present),source);
  const copied=join(run,clean.rawSnapshot!.directory,'sources','diagnostics','learning-timing',journalName);
  assert.equal(readFileSync(copied,'utf8'),bytes);
  assert.ok(clean.rawSnapshot!.manifest.entries.some((entry)=>entry.path===`sources/diagnostics/learning-timing/${journalName}`&&entry.bytes===Buffer.byteLength(bytes)));
  writeFileSync(journal,bytes.replace('120003','120004'));
  assert.notEqual(scanEvidenceDigest(run,false),digest,'a single changed journal byte changes the scan identity');
  assert.equal(readFileSync(copied,'utf8'),bytes,'the original raw snapshot remains immutable');
  writeFileSync(journal,bytes+JSON.stringify({injected:'synthetic-secret-canary'})+'\n');
  const failed=runScan({root,runId:'dry-20261028-1',includePlaywrightOutput:true,collect:()=>inputs});
  assert.equal(scanCommandExit(failed),1);
  assert.ok(failed.scan.hits.some((hit)=>hit.source==='diagnostics'&&hit.file.endsWith(journalName)),'timing journal content is scanned, not merely hashed');
}));

test('timing identity accepts only the fixed producer directory and safe flat JSONL names',()=>{
  for(const kind of ['unknown-directory','nested-directory','wrong-extension','wrong-name','wrong-clock','file-symlink','directory-symlink','diagnostics-symlink','diagnostics-dangling-symlink','flat-jsonl'])fixture((root,run,inputs)=>{
    const diagnostics=join(run,'diagnostics'),directory=join(diagnostics,'learning-timing');mkdirSync(directory,{recursive:true});
    if(kind==='unknown-directory')mkdirSync(join(diagnostics,'another-directory'));
    if(kind==='nested-directory')mkdirSync(join(directory,'nested'));
    if(kind==='wrong-extension')writeFileSync(join(directory,journalName.replace('.jsonl','.json')),journalBytes());
    if(kind==='wrong-name')writeFileSync(join(directory,'journal.jsonl'),journalBytes());
    if(kind==='wrong-clock')writeFileSync(join(directory,journalName.replace('-49ec-','-59ec-')),journalBytes());
    if(kind==='flat-jsonl')writeFileSync(join(diagnostics,journalName),journalBytes());
    if(kind==='file-symlink'){const target=join(root,'journal-target');writeFileSync(target,journalBytes());symlinkSync(target,join(directory,journalName));}
    if(kind==='directory-symlink'){rmSync(directory,{recursive:true});const target=join(root,'journal-directory');mkdirSync(target);symlinkSync(target,directory);}
    if(kind==='diagnostics-symlink'){rmSync(diagnostics,{recursive:true});const target=join(root,'diagnostics-directory');mkdirSync(target);symlinkSync(target,diagnostics);}
    if(kind==='diagnostics-dangling-symlink'){rmSync(diagnostics,{recursive:true});symlinkSync(join(root,'missing-target'),diagnostics);}
    assert.throws(()=>scanEvidenceDigest(run,false),/SCAN_IDENTITY_ARTIFACT_REJECTED/,kind);
    assert.throws(()=>runScan({root,runId:'dry-20261028-1',includePlaywrightOutput:true,collect:()=>inputs}),/SCAN_IDENTITY_ARTIFACT_REJECTED|RAW_EVIDENCE_SYMLINK|SCAN_SYMLINK/,kind);
  });
});

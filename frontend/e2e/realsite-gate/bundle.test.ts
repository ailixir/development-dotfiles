import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadBundle} from './bundle.ts';
import {cleanScan,flow,result} from './testkit.ts';
function fixture(fn:(root:string,dir:string,write:(relative:string,value:unknown)=>void)=>void):void{const root=mkdtempSync(join(tmpdir(),'gate-bundle-')),dir=join(root,'rg-20261027-1');mkdirSync(dir);const write=(relative:string,value:unknown):void=>{const parts=relative.split('/');parts.pop();mkdirSync(join(dir,...parts),{recursive:true});writeFileSync(join(dir,relative),JSON.stringify(value));};try{fn(root,dir,write);}finally{rmSync(root,{recursive:true,force:true});}}
test('actual loader retains stage/run/coverage envelope without login exercise',()=>fixture((root,dir,write)=>{void dir;write('scan/scan.json',{runId:'rg-20261027-1',nextday:false,authoritative:true,generatedAt:'2026-10-27T13:00:00Z',exercised:{},scan:cleanScan()});const b=loadBundle(root,'rg-20261027-1');assert.equal(b.scanFile?.runId,b.runId);assert.equal(b.scanFile?.authoritative,true);}));
test('actual loader rejects cross-run and swapped scan envelopes',()=>{for(const mutation of ['run','stage'])fixture((root,dir,write)=>{void dir;write('scan/scan.json',{runId:mutation==='run'?'rg-20261028-2':'rg-20261027-1',nextday:mutation==='stage',exercised:{},scan:cleanScan()});assert.throws(()=>loadBundle(root,'rg-20261027-1'),/scan envelope/);});});
test('actual loader rejects filename/key/flow/run corruption and unknown extra files',()=>{for(const mutation of ['key','flow','run','extra'])fixture((root,dir,write)=>{void dir;const r={...result('mdn','positive',[flow()]),schemaVersion:1,runId:'rg-20261027-1'};if(mutation==='key')r.key='github';if(mutation==='flow')r.flows.push(flow());if(mutation==='run')r.runId='rg-20261028-1';write(`results/${mutation==='extra'?'unknown':'mdn'}.json`,r);assert.throws(()=>loadBundle(root,'rg-20261027-1'));});});
test('actual loader rejects historical nextday duplicate-key files as current gate input',()=>fixture((root,dir,write)=>{void dir;const r={schemaVersion:1,runId:'rg-20261027-1',key:'mdn',status:'PASSED'};write('nextday/mdn.json',r);write('nextday/other.json',r);assert.throws(()=>loadBundle(root,'rg-20261027-1'),/nextday/);}));

test('historical login raw JSON remains unchanged while the current registry refuses it as gate input',()=>fixture((root,dir,write)=>{
  const historical={...result('L1','leak',[flow({flowId:'l1a'}),flow({flowId:'l1b'})]),schemaVersion:1,runId:'rg-20261027-1'};
  write('results/L1.json',historical);
  assert.throws(()=>loadBundle(root,'rg-20261027-1'),/result filename\/key\/kind mismatch/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir,'results/L1.json'),'utf8')),historical);
}));

test('actual loader rejects missing or crossed current monotonic timing receipts', () => {
  for (const mutation of ['missing', 'duplicate', 'run', 'clock', 'revision', 'step', 'negative']) fixture((root, dir, write) => {
    void dir;
    const r = { ...result('mdn', 'positive', [flow()]), schemaVersion: 1, runId: 'rg-20261027-1' }, f = r.flows[0]!, t = f.learningTiming!;
    if (mutation === 'missing') f.learningTiming = undefined;
    if (mutation === 'duplicate') t.receipts.push(structuredClone(t.receipts[1]!));
    if (mutation === 'run') t.runId = 'rg-20261028-1';
    if (mutation === 'clock') t.receipts[1]!.clockId = 'another';
    if (mutation === 'revision') t.receipts[1]!.configurationRevision = '2';
    if (mutation === 'step') t.receipts[1]!.stepIds[0] = 'another';
    if (mutation === 'negative') t.receipts[1]!.responseEndMs = -1;
    write('results/mdn.json', r);
    assert.throws(() => loadBundle(root, 'rg-20261027-1'), /learning|monotonic/);
  });
});

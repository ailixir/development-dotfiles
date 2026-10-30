import {randomUUID} from 'node:crypto';
/** Scan actual Studio UI text before protecting persisted failure evidence. Hashes never prove zero. */
import {existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
import {sha256Hex} from './common.ts';
import {canaryForms,scanUiTextHits} from './leakscan.ts';
import type {Canary,Hit,ScanSummary} from './leakscan.ts';
interface UiReceipt {schemaVersion:1;runId:string;captureId:string;status:'OBSERVED';file:string;originalBytes:number;originalSha256:string;persistedSha256:string;canaries:string[];forms:Record<string,number>;hits:Hit[]}
export function recordUiText(directory:string,file:string,text:string,canaries:Canary[],runId:string):void {
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]*\.txt$/.test(file))throw new Error('UI_SNAPSHOT_NAME_INVALID');
  mkdirSync(directory,{recursive:true});if(existsSync(join(directory,file))||existsSync(join(directory,`${file}.scan.json`)))throw new Error('UI_SNAPSHOT_ALREADY_EXISTS');
  const hits=scanUiTextHits(text,canaries,file),persisted=hits.length?'[withheld: unsafe UI text detected]':text;
  const receipt:UiReceipt={schemaVersion:1,runId,captureId:randomUUID(),status:'OBSERVED',file,originalBytes:Buffer.byteLength(text),originalSha256:sha256Hex(text),persistedSha256:sha256Hex(persisted),canaries:canaries.map((c)=>c.label),forms:Object.fromEntries(canaries.map((c)=>[c.label,canaryForms(c.value).length])),hits};
  writeFileSync(join(directory,`${file}.scan.json`),JSON.stringify(receipt)+'\n',{flag:'wx'});writeFileSync(join(directory,file),persisted,{flag:'wx'});
}
export function incorporateOriginalUiText(scan:ScanSummary,directory:string,runId:string):void {
  let snapshots=0,bytes=0,missing=0;const originalHits:Hit[]=[],captures=new Set<string>();
  if(!existsSync(directory)){scan.originalUi={snapshots,bytes,missing:1};return;}
  const walk=(path:string):void=>{for(const name of readdirSync(path).sort()){const full=join(path,name),st=lstatSync(full);if(st.isSymbolicLink()){missing+=1;continue;}if(st.isDirectory()){walk(full);continue;}if(name.endsWith('.capture-failed.json')){missing+=1;continue;}if(!name.endsWith('.txt'))continue;snapshots+=1;try{const file=relative(directory,full),r=JSON.parse(readFileSync(`${full}.scan.json`,'utf8')) as UiReceipt,data=readFileSync(full);if(r.schemaVersion!==1||r.runId!==runId||r.status!=='OBSERVED'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.captureId)||captures.has(r.captureId)||r.file!==file||!Number.isSafeInteger(r.originalBytes)||r.originalBytes<0||!/^[a-f0-9]{64}$/.test(r.originalSha256)||r.persistedSha256!==sha256Hex(data)||r.canaries.slice().sort().join()!==scan.canaries.map((c)=>c.label).sort().join()||Object.keys(r.forms).sort().join()!==Object.keys(scan.formsPerCanary).sort().join()||Object.entries(r.forms).some(([k,v])=>v!==scan.formsPerCanary[k])||!Array.isArray(r.hits)||(r.hits.length===0&&(r.originalSha256!==r.persistedSha256||r.originalBytes!==data.length))||r.hits.some((h)=>h.source!=='ui'||h.file!==file||h.verdict!=='LEAK'||(h.cls!=='BEARER'&&!r.canaries.includes(h.canary)))){missing+=1;continue;}captures.add(r.captureId);bytes+=r.originalBytes;originalHits.push(...r.hits);}catch{missing+=1;}}};
  walk(directory);scan.originalUi={snapshots,bytes,missing};scan.hits.push(...originalHits);scan.leak+=originalHits.length;
}

export function recordUiCaptureFailure(directory:string,file:string,runId:string):void {mkdirSync(directory,{recursive:true});writeFileSync(join(directory,`${file}.${randomUUID()}.capture-failed.json`),JSON.stringify({schemaVersion:1,runId,file,status:'CAPTURE_FAILED',at:new Date().toISOString()})+'\n',{flag:'wx'});}

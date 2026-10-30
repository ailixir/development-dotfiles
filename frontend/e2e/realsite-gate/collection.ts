/** Append-only raw evidence snapshots. Stage/attempt identity is part of every recorded path. */
import {cpSync,existsSync,lstatSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {basename,join,relative} from 'node:path';
import {randomUUID} from 'node:crypto';
import {sha256Hex,isInside} from './common.ts';
import type {SourceSpec} from './leakscan.ts';
export interface RawManifest {entries:{path:string;bytes:number;sha256:string}[];digest:string}
export interface CollectionRecord {schemaVersion:1;stage:'initial'|'nextday';attempt:string;directory:string;createdAt:string;manifest:RawManifest}
export function rawManifest(root:string):RawManifest {
  const entries:RawManifest['entries']=[];
  const visit=(path:string):void=>{const st=lstatSync(path);if(st.isSymbolicLink())throw new Error('RAW_EVIDENCE_SYMLINK');if(st.isDirectory()){for(const n of readdirSync(path).sort())visit(join(path,n));}else if(st.isFile()){const bytes=readFileSync(path),after=lstatSync(path);if(st.ino!==after.ino||st.size!==after.size||st.mtimeMs!==after.mtimeMs)throw new Error('RAW_EVIDENCE_RACE');entries.push({path:relative(root,path),bytes:bytes.length,sha256:sha256Hex(bytes)});}else throw new Error('RAW_EVIDENCE_NOT_REGULAR');};
  visit(root);return{entries,digest:sha256Hex(JSON.stringify(entries))};
}
export function newRawDirectory(runDirectory:string,kind:'collections'|'scan-attempts',nextday:boolean):{attempt:string;directory:string;relativeDirectory:string}{
  const attempt=`${nextday?'nextday':'initial'}-${randomUUID()}`,relativeDirectory=`${kind}/${attempt}`,directory=join(runDirectory,relativeDirectory);mkdirSync(directory,{recursive:false});return{attempt,directory,relativeDirectory};
}
export function collectPlaywright(runDirectory:string,nextday:boolean,inputDirectory:string,reportPath?:string):CollectionRecord {
  if(!existsSync(inputDirectory)||!lstatSync(inputDirectory).isDirectory())throw new Error('PLAYWRIGHT_OUTPUT_MISSING');
  mkdirSync(join(runDirectory,'collections'),{recursive:true});const snapshot=newRawDirectory(runDirectory,'collections',nextday);
  const output=join(snapshot.directory,'playwright');mkdirSync(output);
  if(existsSync(inputDirectory))cpSync(inputDirectory,output,{recursive:true,errorOnExist:true,force:false});
  if(reportPath!==undefined&&existsSync(reportPath))cpSync(reportPath,join(output,'report.json'),{errorOnExist:true,force:false});
  const record:CollectionRecord={schemaVersion:1,stage:nextday?'nextday':'initial',attempt:snapshot.attempt,directory:snapshot.relativeDirectory,createdAt:new Date().toISOString(),manifest:rawManifest(snapshot.directory)};
  writeFileSync(join(runDirectory,'collections',`${snapshot.attempt}.json`),JSON.stringify(record)+'\n',{flag:'wx'});return record;
}
export function collectionRecords(runDirectory:string,nextday:boolean):CollectionRecord[]{
  const directory=join(runDirectory,'collections');if(!existsSync(directory))return[];
  return readdirSync(directory).filter((n)=>n.startsWith(nextday?'nextday-':'initial-')&&n.endsWith('.json')).sort().map((n)=>{const r=JSON.parse(readFileSync(join(directory,n),'utf8')) as CollectionRecord;if(r.schemaVersion!==1||r.stage!==(nextday?'nextday':'initial')||r.directory!==`collections/${r.attempt}`||n!==`${r.attempt}.json`||!isInside(join(runDirectory,r.directory),directory)||rawManifest(join(runDirectory,r.directory)).digest!==r.manifest.digest)throw new Error('RAW_COLLECTION_IDENTITY_OR_CONTENT_MISMATCH');return r;});
}
export function snapshotSources(snapshotDirectory:string,sources:SourceSpec[]):SourceSpec[]{
  return sources.map((s)=>{
    if(!/^[a-z][a-z0-9-]*$/.test(s.name))throw new Error('RAW_SOURCE_NAME_INVALID');
    if(isInside(s.root,snapshotDirectory))return s;
    const container=join(snapshotDirectory,'sources',s.name);mkdirSync(join(snapshotDirectory,'sources'),{recursive:true});
    let root=container;
    if(existsSync(s.root)){const st=lstatSync(s.root);if(st.isSymbolicLink())throw new Error('RAW_EVIDENCE_SYMLINK');if(st.isFile()){mkdirSync(container);root=join(container,basename(s.root));}cpSync(s.root,root,{recursive:true,errorOnExist:true,force:false});}
    return{...s,root};
  });
}
/** An interrupted scan is evidence of incomplete coverage, not a clean state a later rescan may erase. */
export function requireCompletePriorScans(runDirectory:string,inProgress?:string):void {
  const attempts=join(runDirectory,'scan-attempts');if(!existsSync(attempts))return;
  const history=join(runDirectory,'scan','history'),recorded=new Set<string>();
  if(existsSync(history))for(const name of readdirSync(history).filter((n)=>n.endsWith('.json'))){const record=JSON.parse(readFileSync(join(history,name),'utf8')) as {rawSnapshot?:{directory:string}};if(record.rawSnapshot!==undefined)recorded.add(record.rawSnapshot.directory);}
  for(const name of readdirSync(attempts)){const directory=`scan-attempts/${name}`;if(directory===inProgress)continue;if(!recorded.has(directory))throw new Error('INCOMPLETE_PRIOR_SCAN_SNAPSHOT');}
}

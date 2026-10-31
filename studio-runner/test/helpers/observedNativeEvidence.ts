import {constants} from 'node:fs';
import {copyFile,lstat,mkdir,mkdtemp,readFile,realpath,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {basename,extname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {evidenceRoot} from './evidenceOut.js';
import type {ActionTiming,BridgeRecordingEvidence,Ledger} from '../../src/guided/types.js';

type CaseName='partial-step'|`secret-${'valid'|'bad-origin'|'zero-password'|'two-passwords'|'focus-typeflip'|'oversize-frame'|'stopped-lease'}`;
type Role='base-guided'|'mixed-guided'|'ordinary-one'|'ordinary-two'|'secret-prefix';
type Check='assertions'|'decoder'|'seek';
type CheckState='NOT_REACHED'|'RUNNING'|'PASSED';
type HashName='artifactHash'|'learnedPlanHash'|'publicationEvidenceHash'|'rawGraphHash'|'producerHash'|'excludedHash'|'availabilityHash'|'recipeHash'|'originHash';
const evidenceBase=evidenceRoot(),exportRoot=join(evidenceBase,'STUDIO-OBS-015/native-fixtures/r1');
const digest=(bytes:Uint8Array|string):string=>createHash('sha256').update(bytes).digest('hex');
function requireFact(value:unknown):asserts value {if(!value)throw Error('NATIVE_EVIDENCE_INVALID_FACT');}
function uuid(value:string):string {requireFact(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value));return value;}
function number(value:number):number {requireFact(Number.isFinite(value)&&value>=0&&value<=2147483647);return value;}
function timing(row:ActionTiming):ActionTiming {
  requireFact(['step','action','clarificationWait','prefixReplay'].includes(row.kind));
  return {kind:row.kind,stepId:uuid(row.stepId),admissionId:row.admissionId===null?null:uuid(row.admissionId),ordinal:row.ordinal===null?null:number(row.ordinal),startMs:number(row.startMs),endMs:row.endMs===null?null:number(row.endMs)};
}
/** Reject every symlink/path escape, including parent directories; never walk/copy a profile. */
async function confined(root:string,path:string,allowMissing=false):Promise<boolean> {
  const absolute=resolve(path),inside=(value:string)=>value!==''&&!isAbsolute(value)&&value!=='..'&&!value.startsWith('..'+sep);
  const rootInfo=await lstat(resolve(root));requireFact(!rootInfo.isSymbolicLink()&&rootInfo.isDirectory());
  // tmpdir may use the OS /var alias. Canonicalize the already owned mkdtemp root;
  // every descendant, including the media itself, must still be free of symlinks.
  const canonicalRoot=await realpath(root),lexical=relative(resolve(root),absolute),rel=inside(lexical)?lexical:relative(canonicalRoot,absolute);requireFact(inside(rel));let current=canonicalRoot;
  for(const part of rel.split(sep)){
    current=join(current,part);
    try{const info=await lstat(current);requireFact(!info.isSymbolicLink());}
    catch(error){if(allowMissing&&error instanceof Error&&'code'in error&&error.code==='ENOENT')return false;throw Error('NATIVE_EVIDENCE_PATH_REFUSED');}
  }
  requireFact(await realpath(absolute)===join(canonicalRoot,rel));return true;
}
async function prepareExportRoot():Promise<void> {
  let current=evidenceBase;
  for(const part of relative(evidenceBase,exportRoot).split(sep)){
    current=join(current,part);
    try{await mkdir(current);}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='EEXIST'))throw Error('NATIVE_EVIDENCE_PATH_REFUSED');}
    const info=await lstat(current);requireFact(info.isDirectory()&&!info.isSymbolicLink());
  }
}
interface Media {role:Role;path:string;secret:boolean;privacy:'UNVERIFIED'|'VERIFIED_MASKED';checks:Record<Check,CheckState>}
/** QA export only. No expected facts are read from QA; all strings below are closed enums,
 * opaque IDs/hashes or helper-generated paths. No raw exception/context/value/grant is exported. */
export class ObservedNativeEvidence {
  private readonly mediaFiles:Media[]=[];
  private readonly records:unknown[]=[];
  private readonly commitments:Partial<Record<HashName,string>>={};
  private readonly evidenceId=randomUUID();
  constructor(private readonly ownedRoot:string,private readonly caseName:CaseName){}
  media(role:Role,path:string):void {
    requireFact(this.mediaFiles.length<12&&!this.mediaFiles.some(file=>file.role===role));
    requireFact(extname(path)==='.webm'); // In particular, never export a secret-case PNG.
    this.mediaFiles.push({role,path,secret:role==='secret-prefix',privacy:'UNVERIFIED',checks:{assertions:'NOT_REACHED',decoder:'NOT_REACHED',seek:'NOT_REACHED'}});
  }
  check(role:Role,check:Check,state:Exclude<CheckState,'NOT_REACHED'>):void {const file=this.mediaFiles.find(item=>item.role===role);requireFact(file);file.checks[check]=state;}
  verifyMaskedSecretVideo():void {const file=this.mediaFiles.find(item=>item.role==='secret-prefix');requireFact(file);file.privacy='VERIFIED_MASKED';}
  hash(name:HashName,value:string):void {requireFact(/^[0-9a-f]{64}$/u.test(value));this.commitments[name]=value;}
  localRun(role:Role,runId:string,attemptId:string,admissionId:string):void {this.records.push({role,kind:'FIXTURE_LOCAL_ADMISSION',runId:uuid(runId),attemptId:uuid(attemptId),admissionId:uuid(admissionId)});}
  recording(role:Role,body:BridgeRecordingEvidence|undefined):void {
    if(!body){this.records.push({role,recording:'NOT_REACHED'});return;}
    requireFact(['STORED','FAILED','UNAVAILABLE'].includes(body.state)&&typeof body.partial==='boolean'&&body.timings.length<=1000);
    this.records.push({role,sessionId:uuid(body.sessionId),contextId:uuid(body.contextId),contextRevision:number(body.contextRevision),recordingId:uuid(body.recordingId),state:body.state,partial:body.partial,timings:body.timings.map(timing)});
  }
  outcome(role:Role,ledger:Ledger|undefined):void {
    if(!ledger)return;
    requireFact(['ADMITTED','DISPATCHING','SUCCEEDED','FAILED','UNKNOWN_OUTCOME','REVOKED'].includes(ledger.state)&&['PENDING','OK','ASSERTION_FAILED','TARGET_CHANGED','POLICY_DENIED','TIMEOUT','ACK_LOST','CANCELLED'].includes(ledger.outcomeCode));
    requireFact(/^[0-9a-f]{64}$/u.test(ledger.operationHash)&&/^[0-9a-f]{64}$/u.test(ledger.authoredInputsHash));
    this.records.push({role,admissionId:uuid(ledger.admission.admissionId),coordinate:{stepId:uuid(ledger.coordinate.stepId),ordinal:number(ledger.coordinate.ordinal)},state:ledger.state,outcomeCode:ledger.outcomeCode,attemptOrdinal:number(ledger.attemptOrdinal),contextRevision:number(ledger.contextRevision),operationHash:ledger.operationHash,authoredInputsHash:ledger.authoredInputsHash});
  }
  async finish(failed:boolean):Promise<boolean> {
    await prepareExportRoot();await confined(evidenceBase,exportRoot);
    const destination=await mkdtemp(join(exportRoot,this.caseName+'-'));
    const files:unknown[]=[];let cleanupAllowed=!failed;
    const recovery=basename(this.ownedRoot);requireFact(/^(?:partial-prefix-native|secret-prefix-native)-[A-Za-z0-9]{6}$/u.test(recovery));
    const roles:Role[]=this.caseName==='partial-step'?['base-guided','mixed-guided','ordinary-one','ordinary-two']:['secret-prefix'];
    const manifest=(exportStatus:'VERIFIED_EXPORT'|'EXPORT_FAILED')=>({schemaVersion:1,authority:'LOCAL_NATIVE_FIXTURE_NOT_CORE_OR_VAULT_PG',caseName:this.caseName,evidenceId:this.evidenceId,assertionPhaseStatus:failed?'FAILED':'COMPLETED_NOT_FINAL_TEST_VERDICT',exportStatus,privateRecoveryDirectory:recovery,commitments:this.commitments,records:this.records,phases:roles.map(role=>({role,media:this.mediaFiles.some(file=>file.role===role)?'REGISTERED':'NOT_REACHED',seekFrames:'NOT_REACHED'})),files});
    try{
      requireFact(this.records.length<=500);
      for(const file of this.mediaFiles){
        const checks=Object.fromEntries(Object.entries(file.checks).map(([key,value])=>[key,value==='RUNNING'?'FAILED':value]));
        if(!await confined(this.ownedRoot,file.path,true)){files.push({role:file.role,state:'NOT_AVAILABLE',privacy:file.privacy,checks});continue;}
        const info=await lstat(file.path);requireFact(info.isFile()&&info.size<=268435456);
        const bytes=await readFile(file.path);requireFact(bytes.byteLength===info.size);const originalHash=digest(bytes);
        if(file.secret&&file.privacy!=='VERIFIED_MASKED'){
          // A failed privacy assertion cannot authorize copying a potentially visible password.
          cleanupAllowed=false;files.push({role:file.role,state:'PRIVATE_RETAINED_UNVERIFIED',byteLength:bytes.byteLength,sha256:originalHash,privacy:'UNVERIFIED',checks});continue;
        }
        const name=file.role+'.webm',target=join(destination,name);await copyFile(file.path,target,constants.COPYFILE_EXCL);
        const copied=await readFile(target);requireFact(copied.byteLength===bytes.byteLength&&digest(copied)===originalHash&&digest(await readFile(file.path))===originalHash);
        files.push({role:file.role,state:'COPIED_VERIFIED',path:name,byteLength:copied.byteLength,sha256:originalHash,privacy:file.secret?'VERIFIED_MASKED':'NONSECRET_FIXTURE',checks});
      }
      await writeFile(join(destination,'manifest.json'),JSON.stringify({...manifest('VERIFIED_EXPORT'),cleanupAllowed},null,2)+'\n',{flag:'wx'});
      process.stdout.write('R1_NATIVE_EVIDENCE '+relative(evidenceBase,join(destination,'manifest.json'))+'\n');
      return cleanupAllowed;
    }catch{
      // Keep every original on export failure. The marker contains no arbitrary exception data.
      await writeFile(join(destination,'export-failed.json'),JSON.stringify(manifest('EXPORT_FAILED'),null,2)+'\n',{flag:'wx'});
      throw Error('NATIVE_EVIDENCE_EXPORT_FAILED');
    }
  }
}
/** Preserve the first test/lifecycle failure; export failure never deletes the last original. */
export async function withObservedNativeEvidence(ownedRoot:string,caseName:CaseName,body:(evidence:ObservedNativeEvidence)=>Promise<void>,settle:(evidence:ObservedNativeEvidence)=>Promise<void>,cleanup:()=>Promise<void>,after?:(evidence:ObservedNativeEvidence)=>Promise<void>):Promise<void> {
  const evidence=new ObservedNativeEvidence(ownedRoot,caseName),state:{failed:boolean;first?:unknown}={failed:false};
  const remember=(error:unknown)=>{if(!state.failed){state.failed=true;state.first=error;}};
  try{await body(evidence);}catch(error){remember(error);}
  try{await settle(evidence);}catch(error){remember(error);}
  if(!state.failed&&after)try{await after(evidence);}catch(error){remember(error);}
  let cleanupAllowed=false;try{cleanupAllowed=await evidence.finish(state.failed);}catch(error){remember(error);}
  if(cleanupAllowed)try{await cleanup();}catch(error){remember(error);}
  if(state.failed)throw state.first;
}

/** A close/settlement failure must not replace an earlier actual assertion/native failure. */
export async function settleNativeOperation(body:()=>Promise<void>,settle:()=>Promise<void>):Promise<void> {
  const outcome=await body().then(()=>({ok:true})as const,(error:unknown)=>({ok:false,error})as const);
  try{await settle();}catch(error){if(outcome.ok)throw error;}
  if(!outcome.ok)throw outcome.error;
}

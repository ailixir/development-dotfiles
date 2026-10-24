import * as revFs from 'node:fs';
const revStateFile="state",revFailedFile="failed",revOrigin="origin",revProducer=1,revLedgerRoot="root";
let revCase=0,revSeq=0,revTail=Promise.resolve(),revStarted=false,revNativeOrdinal=0;
let revPending=0,revOriginalPending=0,revAcked=0,revFailed=false,revSealing=false,revSealed=false;
let revC6HighPending=0,revC6CdpPending=0;
let revLossRuntime=null,revLossBusy=2,revLossRestoreAttempt=0,revLossRestoreRefusal=0;
const revLossSelected=()=>revProducer===1&&revLocalMode?.c6===3;
const revLossRefuse=code=>{if(revLossSelected()&&revLossRestoreRefusal===0)revLossRestoreRefusal=code;};
let revLocalMode=null,revWatching=false,revC6Probed=0;
let revC6ProfileDev=0,revC6ProfileIno=0,revC6ContextBound=false;
let revC6RunDeadline=0,revC6StepMs=0,revC6Restored=false,revC6RetryRestore=null;
let revActive=new Map();const revGroups=new Set();
let revLossLifetime=null;
const revManagedLoss=()=>revLossSelected()&&revLossLifetime?.retired===true;
const revMode=()=>{try{return revFs.existsSync(revStateFile)?JSON.parse(revFs.readFileSync(revStateFile,'utf8')):null;}catch{return null;}};
const revMarker=()=>{try{const fd=revFs.openSync(revFailedFile,
  revFs.constants.O_WRONLY|revFs.constants.O_CREAT|revFs.constants.O_APPEND|revFs.constants.O_NOFOLLOW,0o600);
  try{revFs.writeSync(fd,'1\n');}finally{revFs.closeSync(fd);}}catch{}};
const revCheckRoot=()=>{
  const root=revFs.lstatSync(revLedgerRoot);
  if(root.isSymbolicLink()||!root.isDirectory()||revFs.realpathSync(revLedgerRoot)!==revLedgerRoot
    ||(root.mode&0o777)!==0o700||root.uid!==process.getuid())throw new Error('ROOT');
};
const revPublish=(mode,sealed)=>{
  try{
    revCheckRoot();
    const target=revLedgerRoot+'/'+mode.case+'-'+revProducer+'.json',tmp=target+'.tmp';
    if(revFs.existsSync(target)){const old=revFs.lstatSync(target);
      if(old.isSymbolicLink()||!old.isFile()||(old.mode&0o777)!==0o600)throw new Error('FILE');}
    if(mode.c6===3&&revProducer===1&&revLossRuntime){
      const actualBusy=revLossRuntime.busy;revLossBusy=typeof actualBusy==='boolean'?Number(actualBusy):2;
    }
    // Retired raw status is the last actual observation, never fake settlement/zero.
    const raw=revManagedLoss()?revLossLifetime.snapshot:null;
    const body=JSON.stringify({case:mode.case,producer:revProducer,epoch:mode.epoch,role:revProducer,
      sent:revSeq,acked:revAcked,pending:revPending+revOriginalPending+(raw?.high??revC6HighPending)+revC6CdpPending,originalPending:revOriginalPending,
      failed:revFailed,sealed,...(mode.c6?{profileDev:revC6ProfileDev,
        profileIno:revC6ProfileIno,contextBound:revC6ContextBound}:{}),
      ...(mode.c6===3&&revProducer===1?{highPending:raw?.high??revC6HighPending,cdpCreationPending:revC6CdpPending,
        nativeActive:raw?.active??revActive.size,busy:revLossBusy,restoreAttempt:revLossRestoreAttempt,
        restoreRefusal:revLossRestoreRefusal}:{})});
    if(Buffer.byteLength(body)>1024)throw new Error('BOUND');
    revCheckRoot();
    const fd=revFs.openSync(tmp,revFs.constants.O_WRONLY|revFs.constants.O_CREAT|revFs.constants.O_EXCL|
      revFs.constants.O_NOFOLLOW,0o600);
    try{revFs.writeFileSync(fd,body);revFs.fsyncSync(fd);}finally{revFs.closeSync(fd);}
    revCheckRoot();
    revFs.renameSync(tmp,target);
  }catch{revFailed=true;revMarker();}
};
const revFail=()=>{revFailed=true;revMarker();if(revLocalMode)revPublish(revLocalMode,revSealed);};
const revMaybeSeal=()=>{
  if(revManagedLoss())return; // This epoch explicitly has no normal raw SDK seal.
  if(revSealing&&revPending===0&&revOriginalPending===0&&revC6HighPending===0&&revC6CdpPending===0){revSealed=true;revPublish(revLocalMode,true);}
};
const revInit=mode=>{
  if(revCase===mode.case)return;
  if(revLocalMode&&!revSealed&&!revManagedLoss()){revFail();return;}
  // The old map remains captured by its original pending callbacks; it is not erased.
  // The retired loss lifetime also owns its unsettled high-level fill count (its
  // snapshot already published it), so the next case must not inherit that count.
  if(revManagedLoss()){revActive=new Map();revC6HighPending=0;}
  revCase=mode.case;revSeq=0;revPending=0;revAcked=0;revOriginalPending=0;
  if(mode.c6){revNativeOrdinal=0;revC6Probed=0;revC6Restored=false;}
  if(mode.c6===3&&revProducer===1){revLossRuntime=null;revLossBusy=2;revLossRestoreAttempt=0;revLossRestoreRefusal=0;
    revLossLifetime={mode,active:revActive,high:0,operations:0,callbacks:0,cleanupAuthorized:false,retired:false,snapshot:null};}
  else revLossLifetime=null;
  if(mode.c6>=1&&mode.c6<=3){revStarted=false;revC6HighPending=0;revC6CdpPending=0;}
  revTail=Promise.resolve();revLocalMode=mode;revSealing=false;revSealed=false;
  if((revProducer!==3||mode.c6)&&!revWatching){
    revCheckRoot();
    const command=revLedgerRoot+'/'+mode.case+'-'+revProducer+'-seal.json';revWatching=true;
    revFs.watchFile(command,{interval:25,persistent:false},()=>{
      try{revCheckRoot();if(!revFs.existsSync(command))return;
        const stat=revFs.lstatSync(command);
        if(stat.isSymbolicLink()||!stat.isFile()||stat.size>1024||(stat.mode&0o777)!==0o600)
          throw new Error('COMMAND');
        revCheckRoot();
        const seal=JSON.parse(revFs.readFileSync(command,'utf8'));
        if(mode.c6&&Object.keys(seal).sort().join(',')==='case,epoch,probe,producer'
          &&seal.case===mode.case&&seal.epoch===mode.epoch&&seal.producer===revProducer&&Number.isInteger(seal.probe)&&seal.probe>=1&&seal.probe<=2){
          if(seal.probe<=revC6Probed)return;
          if(seal.probe!==revC6Probed+1)throw new Error('C6_PROBE_SEQUENCE');revC6Probed=seal.probe;
          const pending=[...revActive].filter(([,operation])=>operation===1);
          const margin=mode.path===2?Math.floor(revC6RunDeadline-Date.now()-revC6StepMs):0;
          revEmit(mode,10,pending.length===1?pending[0][0]:0,1,0,
            pending.length===1&&revActive.size===1,Math.max(0,margin));return;
        }
        if(Object.keys(seal).sort().join(',')!=='case,epoch,producer,seal'||seal.case!==mode.case
          ||seal.epoch!==mode.epoch||seal.producer!==revProducer||seal.seal!==true)throw new Error('EPOCH');
        if(mode.c6===3&&revProducer===1&&revLossLifetime)revLossLifetime.cleanupAuthorized=true;
        if(mode.c6&&revC6RetryRestore){
          // Existing teardown seal retries the retained selected restoration task.
          // No action/stop/native authority is created by this observation command.
          const retry=revC6RetryRestore;
          retry().then(restored=>{if(!restored){revFail();return;}
            revSealing=true;revFs.unwatchFile(command);revWatching=false;
            // Managed output closure is not normal raw-SDK settlement/sealing.
            if(revManagedLoss())revPublish(mode,false);else revMaybeSeal();
          },()=>{revFail();}).catch(()=>{revFail();});return;
        }
        revSealing=true;revFs.unwatchFile(command);revWatching=false;revMaybeSeal();
      }catch{revFail();revSealing=true;revFs.unwatchFile(command);revWatching=false;revMaybeSeal();}
    });
  }
};
const revEmit=(mode,event,ordinal=0,operation=0,reason=0,ok=true,deltaMicros=0)=>{
  if(!mode?.active)return;
  try{revInit(mode);}catch{revFail();return;}
  if(revSealing||revSealed){revFail();return;}
  revPending++;
  const body={case:mode.case,producer:revProducer,seq:++revSeq,event,ordinal,operation,reason,ok,deltaMicros};
  const acknowledgedAt=performance.now();
  revTail=revTail.then(async()=>{
    const response=await fetch(revOrigin+'/p3/revocation-observer',{method:'POST',
      headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(1000)});
    const ack=await response.json();
    if(response.status!==200||Object.keys(ack).sort().join(',')!=='accepted,flipped,seq'
      ||ack.accepted!==true||ack.seq!==body.seq||typeof ack.flipped!=='boolean')throw new Error('OBSERVER');
    revAcked++;
    if(event===4&&ack.flipped)revEmit(mode,8,0,0,0,true,Math.ceil((performance.now()-acknowledgedAt)*1000));
  }).catch(()=>{revFail();}).finally(()=>{
    revPending--;revPublish(mode,revSealed);revMaybeSeal();
  });
};
const revRestore=()=>{
  if(revLossSelected())revLossRestoreAttempt++;
  let restored=true;
  for(const group of [...revGroups]){
    for(const [name,descriptor,wrapped] of [...group.methods]){
      const current=Object.getOwnPropertyDescriptor(group.cap,name);
      let success=false;
      try{if(current?.value===wrapped){success=descriptor?
        Reflect.defineProperty(group.cap,name,descriptor):Reflect.deleteProperty(group.cap,name);
        if(!success)revLossRefuse(3);
      }else revLossRefuse(2);}catch{revLossRefuse(3);}
      if(success)group.methods=group.methods.filter(item=>item[0]!==name);else{restored=false;revFail();}
    }
    if(!group.methods.length){group.cap=null;revGroups.delete(group);}
  }
  return restored;
};
const revObserveNative=(cap,mode)=>{
  if(!mode?.active)return;
  const cdpSelected=mode.c6>=1&&mode.c6<=3;
  if(!cap||(!cdpSelected&&revGroups.size)||[...revGroups].some(group=>group.cap===cap)
    ||typeof cap.fillPassword!=='function'||typeof cap.invoke!=='function'){revFail();return;}
  const group={cap,methods:[]};revGroups.add(group);
  for(const name of ['fillPassword','invoke']){
    const descriptor=Object.getOwnPropertyDescriptor(cap,name),original=cap[name];
    const wrapped=function(...args){
      if(cdpSelected&&name==='fillPassword'){
        revC6HighPending++;let result;const lifetime=revLossSelected()?revLossLifetime:null;
        if(lifetime)lifetime.high++;
        const settled=()=>{
          if(lifetime)lifetime.high--;
          if(lifetime&&lifetime!==revLossLifetime)return;
          revC6HighPending--;
          if(lifetime?.retired)return; // Value-free observer retired, actual promise unchanged.
          revPublish(mode,revSealed);revMaybeSeal();};
        try{result=Reflect.apply(original,this,args);}catch(error){settled();throw error;}
        try{result.then(settled,settled).catch(()=>{revFail();});}catch{revFail();}
        return result;
      }
      const operation=name==='fillPassword'?1:args[0]?.operation?.kind==='click'?2:3;
      const ordinal=++revNativeOrdinal;revActive.set(ordinal,operation);revEmit(mode,2,ordinal,operation);
      const settled=ok=>{revActive.delete(ordinal);revEmit(mode,3,ordinal,operation,0,ok);};
      let result;try{result=Reflect.apply(original,this,args);}catch(error){settled(false);throw error;}
      try{result.then(()=>settled(true),()=>settled(false)).catch(()=>{revFail();});}catch{revFail();}
      return result;
    };
    try{if(!Reflect.defineProperty(cap,name,{...(descriptor??{configurable:true,writable:true,enumerable:true}),value:wrapped}))throw new Error('DESCRIPTOR');
      group.methods.push([name,descriptor,wrapped]);}catch{revFail();}
  }
};
// Off-tree source for the embedded ReplayIT fixture. Never imported by this draft.
import {createHash as diagCreateHash} from 'node:crypto';
const diagRoot="file:///review-only/",diagSites=[{"site":1,"file":"guided/runtime.js","line":99,"origin":"RUNTIME_TIMER","lineSha256":"05273f46b834e7381cd0ba99e8d9dc5b888ba6535f7f5aae9ce4aeff61688001"},{"site":2,"file":"guided/ownership.js","line":55,"origin":"OWNERSHIP_EXPIRY_TIMER","lineSha256":"9ce1b16f336793e7a4b851e88d9528cf2a819a2687866ac3e53690de018f9a6c"},{"site":3,"file":"guided/ownership.js","line":180,"origin":"OWNERSHIP_RENEW_FAILURE","lineSha256":"81f4c5fcb989a096b2cf834bbc9272db14f78dde6f705861f9f8350813029993"},{"site":4,"file":"guided/ownership.js","line":219,"origin":"OWNERSHIP_CONTEXT_START_FAILURE","lineSha256":"b933a6da9e7db16e2cf9b7bd0227dfa3bc007262fef65a6b59080f2841b7eef7"},{"site":5,"file":"guided/ownership.js","line":258,"origin":"OWNERSHIP_STOP_REQUEST","lineSha256":"7fabf678d68121c68e94ce350e918de4b9c1b49966e21736b9fe2dfcc095052b"},{"site":6,"file":"guided/ownership.js","line":263,"origin":"OWNERSHIP_STOP_REQUEST","lineSha256":"3ceda8469aba3f81bf695374469ce9c52c7f361504ecf645303805124b63ffbc"},{"site":7,"file":"guided/ownership.js","line":267,"origin":"OWNERSHIP_CLOSE","lineSha256":"f18b45e73c42f58e02a8ffc54819d2813fe7bea958c44967c803f1b2b8bacd4e"},{"site":8,"file":"guided/runtime.js","line":201,"origin":"BROWSER_LOSS","lineSha256":"89f3071a3384e45a5674ba6955d02493961b74db2583b9b79f51a93c2932084c"},{"site":9,"file":"guided/runtime.js","line":122,"origin":"START_CATCH","lineSha256":"ecdaf8c69e13c2cf7d8f3f1dcc316ea135e8e478f85a999dcbfaa5558fc38dc4"},{"site":10,"file":"guided/runtime.js","line":215,"origin":"START_CATCH","lineSha256":"ece6b7cdadf5d202c76983376bb57906c7c28f0f0173f861c5074142ef35d9fa"},{"site":12,"file":"guided/ownership.js","line":230,"origin":"OTHER","lineSha256":"6621a6647e37b8c36255d05a35b092a590abd33d4dcda1ccec9856e2f9ab10ac"},{"site":13,"file":"guided/runtime.js","line":807,"origin":"OTHER","lineSha256":"af491620d249e07cc28de29ffb4f9eedb0a116bf80c6214b50c4b46b04a1f9af"}],diagDistHashes={"guided/runtime.js":"fa61032216bebfa2f2f1dcdc6c92145957bbd2c24d6ec035d4d243e091c55c80","guided/ownership.js":"7107f182632abd4ac20bf8210d3929719da8c5857c6d2d39e0ae4b303f6c4952","run/browser.js":"b009d0fe463628b726c618b79eba9f741236f5d477ee66ae3c5282ece1b51a59","run/guidedBrowser.js":"1116e59672e72f5c25dbd11e047f63fe0b18d11c7e5fe7c299a156aecea2631b","guided/contracts.js":"d25d26030cf6f33a5b2a702c274ff9ee0dec5a4afe9b5d25ba9cd2a326ea32c5"};
const diagStates=new Map(),diagRuntimes=new WeakMap(),diagOwners=new WeakMap();
const diagPrototypeMethods=[];
let diagHashesValid=null,diagInstallationFailed=false;
const diagCodes=['NONE','OTHER','LEASE_LOST','CONTEXT_LOST','IDENTITY_MISMATCH',
  'INVALID_CONTRACT','POLICY_DENIED','BUDGET_EXCEEDED','REVISION_CONFLICT','REVOKED',
  'CLAIM_DENIED','CALLBACK_DENIED','BUSY','TIMEOUT','CANCELLED','EXPIRED','UNKNOWN_OUTCOME'];
const diagPhases=['NONE','OTHER','VALIDATE','JOURNAL','RECORDER','LAUNCH','WITHHOLD',
  'BLANK_MATCH','BOOTSTRAP_CALLBACK','STARTED','PROFILE','PROCESS','PROBE','STARTUP_PAGE',
  'APP_PAGE','ROUTING','BLANK_DOCUMENT'];
const diagLosses=['NONE','OTHER','EXTRA_PAGE','PAGE_CRASH','BROWSER_DISCONNECTED','ROUTE_FAILURE'];
const diagEnum=(values,value)=>value==null?'NONE':values.includes(value)?value:'OTHER';
const diagHash=value=>diagCreateHash('sha256').update(JSON.stringify(value)).digest('hex');
const diagNumber=value=>Number.isFinite(value)?Math.max(-2147483647,Math.min(2147483647,
  Math.trunc(value))):0;
const diagSelect=()=>{try{const mode=revMode();return mode?.active===true&&mode.path===1
  &&mode.c6===4&&Number.isSafeInteger(mode.case)&&mode.case>0&&mode.case<=2147483647
  &&mode.epoch===mode.case?mode:null;}catch{return null;}};
const diagCheckHashes=()=>{
  if(diagHashesValid!==null)return diagHashesValid;
  try{diagHashesValid=Object.entries(diagDistHashes).every(([file,expected])=>
    diagCreateHash('sha256').update(revFs.readFileSync(new URL(diagRoot+file))).digest('hex')
      ===expected);}catch{diagHashesValid=false;}
  return diagHashesValid;
};
const diagPosition=()=>{
  try{if(!diagCheckHashes())return {origin:'OTHER',site:0};
    const frames=new Error().stack?.split('\n')??[];
    for(const frame of frames){const matching=diagSites.filter(site=>
      frame.includes(diagRoot+site.file+':'+site.line+':'));
      if(matching.length===1)return {origin:matching[0].origin,site:matching[0].site};
      if(matching.length>1)return {origin:'OTHER',site:matching[0].site};}
  }catch{}return {origin:'OTHER',site:0};
};
const diagState=(sessionId,contextId=null)=>{
  try{const mode=diagSelect();if(!mode||typeof sessionId!=='string')return null;
    const sessionHash=diagHash(sessionId),key=mode.case+'-'+sessionHash;
    let state=diagStates.get(key);
    // One selected session per numeric case. A second identity fails closed diagnostically.
    if(!state&&[...diagStates.values()].some(item=>item.case===mode.case)){
      for(const item of diagStates.values())if(item.case===mode.case){
        item.instrumentationFailed=true;diagPublish(item);}return null;}
    if(!state){state={case:mode.case,epoch:mode.epoch,producer:revProducer,sessionHash,
      contextHash:diagHash(null),began:performance.now(),seq:0,events:[],truncated:false,
      instrumentationFailed:!diagCheckHashes()||diagInstallationFailed,stopCount:0,abortCount:0,methods:[],
      writeAttempts:0,writesCompleted:0,writesFailed:0,writersPending:0,
      markerAttempts:0,markerCompleted:0,markerFailed:0,
      observersPending:0,closed:false,restored:false,currentStop:null,pendingStop:null};
      diagStates.set(key,state);}
    if(typeof contextId==='string')state.contextHash=diagHash(contextId);
    return state;
  }catch{return null;}
};
const diagFailed=state=>{if(state)state.instrumentationFailed=true;};
const diagPublish=state=>{
  if(!state)return;
  let fd=null,temporary=null,ownedTemporary=null;
  state.writeAttempts++;state.writersPending++;
  try{revCheckRoot();
    const target=revLedgerRoot+'/diag-start1-'+state.case+'-1.json';temporary=target+'.tmp';
    if(revFs.existsSync(target)){const info=revFs.lstatSync(target);
      if(info.isSymbolicLink()||!info.isFile()||(info.mode&0o777)!==0o600
        ||info.uid!==process.getuid())throw new Error('FILE');}
    // This snapshot is published only after its fd closes. Counts include this successful write.
    const body=JSON.stringify({schemaVersion:1,case:state.case,epoch:state.epoch,producer:1,
      sessionHash:state.sessionHash,contextHash:state.contextHash,truncated:state.truncated,
      instrumentationFailed:state.instrumentationFailed,closed:state.closed,
      restored:state.restored,writeAttempts:state.writeAttempts,
      writesCompleted:state.writesCompleted+1,writesFailed:state.writesFailed,
      markerAttempts:state.markerAttempts,markerCompleted:state.markerCompleted,markerFailed:state.markerFailed,
      writersPending:state.writersPending-1,observersPending:state.observersPending,
      events:state.events});
    // Reserve two bytes for the sticky failure marker within the 16KiB total cap.
    if(Buffer.byteLength(body)>16382)throw new Error('BOUND');
    revCheckRoot();fd=revFs.openSync(temporary,revFs.constants.O_WRONLY|revFs.constants.O_CREAT
      |revFs.constants.O_EXCL|revFs.constants.O_NOFOLLOW,0o600);
    const info=revFs.fstatSync(fd);ownedTemporary={dev:info.dev,ino:info.ino};
    if(!info.isFile()||(info.mode&0o777)!==0o600||info.uid!==process.getuid())
      throw new Error('FILE');
    revFs.writeFileSync(fd,body);revFs.closeSync(fd);fd=null;
    revCheckRoot();revFs.renameSync(temporary,target);temporary=null;state.writesCompleted++;
  }catch{state.writesFailed++;state.instrumentationFailed=true;
    // Sticky value-free marker; no original operation is failed by the diagnostic.
    state.markerAttempts++;
    try{revCheckRoot();const markerPath=revLedgerRoot+'/diag-start1-failed';
      if(revFs.existsSync(markerPath)){const old=revFs.lstatSync(markerPath);
        if(old.isSymbolicLink()||!old.isFile()||old.size>2||(old.mode&0o777)!==0o600
          ||old.uid!==process.getuid())throw new Error('MARKER');}
      const marker=revFs.openSync(markerPath,
      revFs.constants.O_WRONLY|revFs.constants.O_CREAT
      |revFs.constants.O_NOFOLLOW|revFs.constants.O_NONBLOCK,0o600);
      try{const info=revFs.fstatSync(marker);
        if(!info.isFile()||info.size>2||(info.mode&0o777)!==0o600||info.uid!==process.getuid())
          throw new Error('MARKER');revFs.writeSync(marker,'1\n');}
      finally{revFs.closeSync(marker);}state.markerCompleted++;}catch{state.markerFailed++;}}
  finally{if(fd!==null)try{revFs.closeSync(fd);}catch{state.instrumentationFailed=true;}
    if(temporary!==null&&ownedTemporary)try{revCheckRoot();const actual=revFs.lstatSync(temporary);
      if(!actual.isSymbolicLink()&&actual.isFile()&&actual.dev===ownedTemporary.dev
        &&actual.ino===ownedTemporary.ino&&actual.uid===process.getuid())revFs.unlinkSync(temporary);
      else state.instrumentationFailed=true;}catch{state.instrumentationFailed=true;}
    state.writersPending--;}
};
const diagRecord=(state,event,fields={})=>{
  if(!state)return;
  try{const runtime=state.runtime;
    const row={schemaVersion:1,event,seq:++state.seq,sessionHash:state.sessionHash,
      contextHash:state.contextHash,case:state.case,epoch:state.epoch,producer:1,
      elapsedMs:diagNumber(performance.now()-state.began),
      phase:diagEnum(diagPhases,runtime?.startPhase),loss:diagEnum(diagLosses,runtime?.lossReason),
      ...fields};
    // Reserve 2KiB for the envelope and sticky failure/truncation metadata.
    const size=Buffer.byteLength(JSON.stringify([...state.events,row]));
    const critical=['ABORT_ENTRY','STOP_ENTRY','START_SETTLE','OWNER_CLOSE'].includes(event);
    if(state.events.length>=32||size>14336
      ||(!critical&&(state.events.length>=24||size>12288)))state.truncated=true;
    else state.events.push(row);
  }catch{state.instrumentationFailed=true;}
  diagPublish(state);
};
const diagEntry=entry=>diagState(entry?.assignment?.sessionId,entry?.runtime?.context?.contextId);
const diagTiming=entry=>{try{const now=Date.now();return {
  leaseRemainingMs:diagNumber(Date.parse(entry.grant?.owner?.leaseExpiresAt
    ??entry.assignment.expiresAt)-now),
  assignmentRemainingMs:diagNumber(Date.parse(entry.assignment.expiresAt)-now),
  entryEpoch:diagNumber(entry.epoch),stopped:entry.stopped===true};}catch{return {};}};
const diagError=error=>{const fields={};
  try{let current=error;for(let index=0;index<6;index++){
    fields['chain'+index]=diagEnum(diagCodes,current?.message);
    if(current?.phase!=null)fields.launchPhase=diagEnum(diagPhases,current.phase);
    if(current?.loss!=null)fields.launchLoss=diagEnum(diagLosses,current.loss);
    current=current?.cause;}
    fields.code=diagEnum(diagCodes,error?.message);
  }catch{fields.code='OTHER';}return fields;};
const diagObserve=(state,result,settled)=>{
  if(!state)return;
  state.observersPending++;
  const done=(fulfilled,error)=>{state.observersPending--;
    try{settled(fulfilled,error);}catch{diagFailed(state);diagPublish(state);}};
  try{result.then(()=>done(true,null),error=>done(false,error)).catch(()=>{
    diagFailed(state);diagPublish(state);});}
  catch{state.observersPending--;diagFailed(state);diagPublish(state);}
};
const diagOwn=(state,object,name,make)=>{
  try{const descriptor=Object.getOwnPropertyDescriptor(object,name),original=object[name];
    if(typeof original!=='function'||descriptor?.configurable===false)throw new Error('METHOD');
    const wrapped=make(original);
    if(!Reflect.defineProperty(object,name,{...(descriptor??{
      configurable:true,writable:true,enumerable:false}),value:wrapped}))throw new Error('METHOD');
    state.methods.push([object,name,descriptor,wrapped]);return true;
  }catch{diagFailed(state);return false;}
};
const diagRestore=methods=>{
  let restored=true;
  for(const [object,name,descriptor,wrapped] of [...methods].reverse()){
    try{if(Object.getOwnPropertyDescriptor(object,name)?.value!==wrapped
      ||!(descriptor?Reflect.defineProperty(object,name,descriptor):Reflect.deleteProperty(object,name)))
      restored=false;}catch{restored=false;}}
  return restored;
};
const diagBeforeStart=runtime=>{
  let state=null;
  try{state=diagState(runtime.context?.sessionId,runtime.context?.contextId);if(!state)return null;
    if(diagRuntimes.has(runtime)){diagFailed(state);return state;}
    diagRuntimes.set(runtime,state);state.runtime=runtime;state.startBegan=performance.now();
    diagOwn(state,runtime.startAbort,'abort',original=>function(...args){
      try{const aborted=this.signal.aborted,first=state.abortCount++===0;
        const position=state.currentStop??diagPosition();
        diagRecord(state,'ABORT_ENTRY',{...position,aborted,first,
          reason:diagEnum(diagCodes,args[0]?.message),stopCount:state.stopCount});
      }catch{diagFailed(state);}
      return Reflect.apply(original,this,args);
    });
    diagOwn(state,runtime,'applyAcknowledgedLease',original=>function(...args){
      const before=Date.parse(this.liveLease??this.context.leaseExpiresAt),began=performance.now();
      let result;try{result=Reflect.apply(original,this,args);}catch(error){
        diagRecord(state,'LEASE_APPLY',{fulfilled:false,...diagError(error),
          durationMs:diagNumber(performance.now()-began)});throw error;}
      diagRecord(state,'LEASE_APPLY',{fulfilled:true,leaseAdvanceMs:diagNumber(
        Date.parse(this.liveLease??this.context.leaseExpiresAt)-before),
        leaseRemainingMs:diagNumber(Date.parse(this.liveLease??this.context.leaseExpiresAt)-Date.now()),
        durationMs:diagNumber(performance.now()-began)});return result;
    });
    diagRecord(state,'START_BEGIN',{aborted:runtime.startAbort.signal.aborted});
  }catch{diagFailed(state);}return state;
};
const diagStartSettled=(state,result)=>diagObserve(state,result,(fulfilled,error)=>
  diagRecord(state,'START_SETTLE',{fulfilled,...diagError(error),
    durationMs:diagNumber(performance.now()-state.startBegan)}));
const diagStopBegin=(runtime,reason)=>{
  try{const state=diagRuntimes.get(runtime);if(!state)return null;
    const position=diagPosition();
    const origin=position.site===12&&state.pendingStop?state.pendingStop:position;
    const previous=state.currentStop;state.currentStop=origin;state.stopCount++;
    diagRecord(state,'STOP_ENTRY',{...origin,reason:diagEnum(diagCodes,reason),
      aborted:runtime.startAbort.signal.aborted,first:state.stopCount===1,stopCount:state.stopCount});
    return {state,previous};
  }catch{return null;}
};
const diagStopForwarded=(token,result)=>{
  if(!token)return;token.state.currentStop=token.previous;
  diagObserve(token.state,result,(fulfilled,error)=>diagRecord(token.state,'STOP_SETTLE',
    {fulfilled,...diagError(error),stopCount:token.state.stopCount}));
};
const diagGrant=(args,fulfilled,error)=>{
  try{const state=diagEntry(args[0]);if(!state)return;
    const previous=Date.parse(args[0]?.grant?.owner?.leaseExpiresAt),
      next=Date.parse(args[1]?.owner?.leaseExpiresAt);
    diagRecord(state,'CHECK_GRANT',{...diagTiming(args[0]),initial:args[2]===true,fulfilled,
      leaseAdvanceMs:diagNumber(next-previous),...diagError(error)});
  }catch{}
};
const diagInvalidated=entry=>{
  try{diagRecord(diagEntry(entry),'INVALIDATE',diagTiming(entry));}catch{}
};
const diagOwner=(owner,state)=>{
  let meta=diagOwners.get(owner);if(meta)return meta;
  meta={methods:[],claims:new Map(),activeClaims:new Set(),states:new Set()};
  diagOwners.set(owner,meta);return meta;
};
const diagWrapClaim=(owner,meta,state)=>{
  if(meta.methods.length)return;
  diagOwn(meta,owner.options,'claim',original=>function(...args){
    try{const current=meta.claims.get(diagHash(args[0]?.sessionId));
    if(current){const signal=args[3],state=current.state;
      const abort=()=>diagRecord(state,'CLAIM_ABORT',{...diagTiming(current.entry),
        initial:current.initial,aborted:signal.aborted,budgetMs:diagNumber(args[2]),
        durationMs:diagNumber(performance.now()-current.began)});
      try{signal.addEventListener('abort',abort,{once:true});
        current.listeners.push([signal,abort]);
        current.budgetMs=diagNumber(args[2]);current.budgetObserved=true;
      }catch{diagFailed(state);}}}catch{for(const state of meta.states)diagFailed(state);}
    return Reflect.apply(original,this,args);
  });
  if(meta.instrumentationFailed)diagFailed(state);
};
const diagReleaseClaim=(meta,current)=>{
  meta.activeClaims.delete(current);
  if(meta.claims.get(current.key)===current)meta.claims.delete(current.key);
  for(const [signal,listener] of current.listeners){
    try{signal.removeEventListener('abort',listener);}catch{diagFailed(current.state);}}
  if(meta.activeClaims.size===0&&meta.methods.length){
    const restored=diagRestore(meta.methods);
    if(restored)meta.methods=[];else diagFailed(current.state);
  }
};
const diagInstallOwnership=()=>{
  for(const name of ['requestClaim','stopEntry','close']){
    const descriptor=Object.getOwnPropertyDescriptor(RevOwnership.prototype,name),
      original=descriptor?.value;
    if(typeof original!=='function'||descriptor.configurable!==true){diagInstallationFailed=true;continue;}
    const wrapped=function(...args){
      if(name==='close'){
        const meta=diagOwners.get(this),result=Reflect.apply(original,this,args);
        if(meta){const states=[...meta.states];
          // One observer per original close; return the exact original promise immediately.
          try{result.then(()=>{
            const methodsRestored=diagRestore(meta.methods),
              prototypesRestored=diagRestore(diagPrototypeMethods),
              restored=methodsRestored&&prototypesRestored;
            for(const state of states){state.closed=true;
              state.restored=diagRestore(state.methods)&&restored;
              if(!state.restored||state.observersPending!==0)diagFailed(state);
              diagRecord(state,'OWNER_CLOSE',{fulfilled:true});}
          },error=>{for(const state of states){state.restored=diagRestore(state.methods);
              diagFailed(state);diagRecord(state,'OWNER_CLOSE',{fulfilled:false,...diagError(error)});}
            diagRestore(meta.methods);diagRestore(diagPrototypeMethods);
          }).catch(()=>{for(const state of states){diagFailed(state);diagPublish(state);}});
          }catch{for(const state of states){diagFailed(state);diagPublish(state);}}}
        return result;
      }
      const entry=args[0],state=diagEntry(entry);
      if(!state)return Reflect.apply(original,this,args);
      let meta;try{meta=diagOwner(this,state);meta.states.add(state);}
      catch{diagFailed(state);return Reflect.apply(original,this,args);}
      if(name==='stopEntry'){
        const position=diagPosition();
        if(!entry.stopping&&entry.runtime){state.pendingStop=position;
          const runtimeState=diagRuntimes.get(entry.runtime);if(runtimeState)runtimeState.pendingStop=position;}
        diagRecord(state,'STOP_ENTRY_OWNERSHIP',{...position,...diagTiming(entry),
          reason:diagEnum(diagCodes,args[1])});
        return Reflect.apply(original,this,args);
      }
      const initial=args[1]===true,began=performance.now(),timing=diagTiming(entry);
      const cap=entry.runtime?.hasSecretInputs?1000:10000;
      const key=diagHash(entry.assignment.sessionId),
        current={key,state,entry,initial,began,listeners:[],budgetMs:0,budgetObserved:false};
      meta.claims.set(key,current);meta.activeClaims.add(current);diagWrapClaim(this,meta,state);
      diagRecord(state,'CLAIM_BEGIN',{...timing,initial,
        requestBudgetMs:diagNumber(Math.min(cap,timing.leaseRemainingMs-100))});
      let result;try{result=Reflect.apply(original,this,args);}catch(error){
        diagReleaseClaim(meta,current);diagRecord(state,'CLAIM_SETTLE',{...diagTiming(entry),
          initial,fulfilled:false,...diagError(error),durationMs:diagNumber(performance.now()-began)});
        throw error;}
      diagObserve(state,result,(fulfilled,error)=>{
        diagReleaseClaim(meta,current);
        diagRecord(state,'CLAIM_SETTLE',{...diagTiming(entry),initial,fulfilled,
          budgetMs:current.budgetMs,budgetObserved:current.budgetObserved,
          ...diagError(error),durationMs:diagNumber(performance.now()-began)});
      });return result;
    };
    if(Reflect.defineProperty(RevOwnership.prototype,name,{...descriptor,value:wrapped}))
      diagPrototypeMethods.push([RevOwnership.prototype,name,descriptor,wrapped]);
    else diagInstallationFailed=true;
  }
};
import {GuidedRuntime as RevRuntime} from "file:///review-only/guided/runtime.js";
import {GuidedOwnership as RevOwnership} from "file:///review-only/guided/ownership.js";
const revOwners=new WeakMap(),revRuntimes=new WeakMap();
const c5GrantFile="grant";let c5GrantOrdinal=0;
const c5GrantFail=()=>{void revFs.promises.open(c5GrantFile+'-failed',revFs.constants.O_WRONLY|
  revFs.constants.O_CREAT|revFs.constants.O_APPEND|revFs.constants.O_NOFOLLOW,0o600).then(async fd=>{
    try{await fd.writeFile('1');}finally{await fd.close();}}).catch(()=>undefined);};
const c5GrantRecord=(args,success,error,elapsedMs)=>{
  try{
    const entry=args[0],grant=args[1],now=Date.now();
    const previous=Date.parse(entry?.grant?.owner?.leaseExpiresAt),next=Date.parse(grant?.owner?.leaseExpiresAt),
      expiry=Date.parse(entry?.assignment?.expiresAt);
    const valid=number=>Number.isFinite(number),delta=(left,right)=>valid(left)&&valid(right)?Math.trunc(left-right):0;
    const code=success?0:['LEASE_LOST','CONTEXT_LOST','IDENTITY_MISMATCH','INVALID_CONTRACT','POLICY_DENIED',
      'BUDGET_EXCEEDED','REVISION_CONFLICT','REVOKED','CLAIM_DENIED','CALLBACK_DENIED','BUSY'].indexOf(error?.message)+1;
    const sample={ordinal:++c5GrantOrdinal,initial:args[2]===true,success,code,
      previousValid:valid(previous),nextValid:valid(next),expiryValid:valid(expiry),
      previousRemainingMs:delta(previous,now),nextRemainingMs:delta(next,now),
      assignmentRemainingMs:delta(expiry,now),leaseAdvanceMs:delta(next,previous),
      validationMicros:valid(elapsedMs)?Math.ceil(elapsedMs*1000):0};
    void (async()=>{const fd=await revFs.promises.open(c5GrantFile,revFs.constants.O_WRONLY|
      revFs.constants.O_CREAT|revFs.constants.O_APPEND|revFs.constants.O_NOFOLLOW,0o600);
      try{await fd.writeFile(JSON.stringify(sample)+'\n');}finally{await fd.close();}})().catch(c5GrantFail);
  }catch{c5GrantFail();}
};
const revStart=RevRuntime.prototype.start;
RevRuntime.prototype.start=function(...args){const diag=diagBeforeStart(this), result=Reflect.apply(revStart,this,args),mode=revMode();
  diagStartSettled(diag,result);
  if(mode?.active&&mode.path===1){const runtime=this;
    result.then(()=>{try{
      if(mode.c6){revInit(mode);if(!revGroups.size&&!revC6RetryRestore)revStarted=false;}
      if(!runtime.accepting||revStarted)throw new Error('OWNER');
      if(mode.c6&&mode.path===1){const profile=revFs.lstatSync(runtime.browser.scratchDirectory+'/browser-profile');
        if(profile.isSymbolicLink()||profile.dev!==revC6ProfileDev||profile.ino!==revC6ProfileIno)
          throw new Error('C6_CONTEXT');revC6ContextBound=true;}
      revStarted=true;revRuntimes.set(runtime,mode);
      if(mode.c6===3&&revProducer===1)revLossRuntime=runtime;
      revObserveNative(runtime.browser?.observations,mode);
      if(mode.c6&&mode.path===1){
        const options=runtime.options,group={cap:options,methods:[]};
        if(!options||Object.hasOwn(options,'onRawFailure')||Object.hasOwn(options,'beforeSecretFill'))
          throw new Error('C6_HOOK_COLLISION');revGroups.add(group);
        const comparisons=()=>{const stat=revFs.lstatSync(c5ValuesFile);
          if(stat.isSymbolicLink()||!stat.isFile()||(stat.mode&0o777)!==0o600||stat.size>32768)
            throw new Error('C6_VALUES');const values=JSON.parse(revFs.readFileSync(c5ValuesFile,'utf8'));
          if(!Array.isArray(values)||values.length!==1||typeof values[0]!=='string'||values[0].length>4096)
            throw new Error('C6_VALUES');return values;};
        if(mode.c6===3){
          const descriptor=Object.getOwnPropertyDescriptor(options,'callback'),original=options.callback;
          const lifetime=revLossLifetime;
          if(typeof original!=='function'||!descriptor||!lifetime)throw new Error('C6_CALLBACK');
          const wrapped=function(...args){
            lifetime.callbacks++;revOriginalPending++;let result;
            const done=()=>{lifetime.callbacks--;revOriginalPending--;revPublish(mode,revSealed);};
            try{result=Reflect.apply(original,this,args);}catch(error){done();throw error;}
            result.then(done,done).catch(()=>{revFail();});return result;
          };
          if(!Reflect.defineProperty(options,'callback',{...descriptor,value:wrapped}))throw new Error('C6_CALLBACK');
          group.methods.push(['callback',descriptor,wrapped]);
        }
        const hooks={onRawFailure(error){try{const text=error instanceof Error?error.message:'';
          let literal=0,encoded=0;for(const value of comparisons()){
            if(text.includes(value))literal++;
            for(const variant of [encodeURIComponent(value),Buffer.from(value).toString('base64')])
              if(text.includes(variant))encoded++;}
          revEmit(mode,11,1,literal,1,true,encoded);
          }catch{revFail();}}};
        if(mode.c6===4)hooks.beforeSecretFill=value=>{
          if(comparisons()[0]!==value){revFail();throw new Error('C6_RELEASE_MISMATCH');}
          throw new Error('C6_RELEASED '+value+' '+encodeURIComponent(value)+' '
            +Buffer.from(value).toString('base64')+' '+ '界'.repeat(3000));};
        for(const [name,hook] of Object.entries(hooks)){const descriptor=Object.getOwnPropertyDescriptor(options,name);
          if(!Reflect.defineProperty(options,name,{configurable:true,writable:true,value:hook}))
            throw new Error('C6_HOOK');group.methods.push([name,descriptor,hook]);}
      }
      revEmit(mode,1,1);}catch{revFail();}},()=>{revFail();}).catch(()=>{revFail();});}
  return result;};
// Selected kind3 observes actual managed promises without changing original results/errors.
for(const name of ['dispatch','refreshObservation']){
  const original=RevRuntime.prototype[name];
  RevRuntime.prototype[name]=function(...args){
    const mode=revRuntimes.get(this),lifetime=mode?.c6===3?revLossLifetime:null;
    if(!lifetime)return Reflect.apply(original,this,args);
    lifetime.operations++;revOriginalPending++;let result;
    const done=()=>{lifetime.operations--;revOriginalPending--;revPublish(mode,revSealed);};
    try{result=Reflect.apply(original,this,args);}catch(error){done();throw error;}
    result.then(done,()=>{revFail();done();}).catch(()=>{revFail();});return result;
  };
}
const revCheck=RevOwnership.prototype.checkGrant;
RevOwnership.prototype.checkGrant=function(...args){
  const selected=revFs.existsSync(c5ValuesFile),started=selected?performance.now():0;
  let result;try{result=Reflect.apply(revCheck,this,args);}catch(error){
    if(selected)c5GrantRecord(args,false,error,performance.now()-started);
    diagGrant(args,false,error);throw error;}
  if(selected)c5GrantRecord(args,true,null,performance.now()-started);
  diagGrant(args,true,null);
  const mode=revMode();
  if(mode?.active&&mode.path===1){try{const entry=args[0];
    if(entry.stopped!==false)throw new Error('OWNER');
    if(args[2]===true)revOwners.set(entry,mode.case);
    else if(revStarted&&revOwners.get(entry)===mode.case)revEmit(mode,4,1);
  }catch{revFail();}}return result;};
const revInvalidate=RevOwnership.prototype.invalidate;
RevOwnership.prototype.invalidate=function(...args){const result=Reflect.apply(revInvalidate,this,args),mode=revMode();
  diagInvalidated(args[0]);
  if(mode?.active&&mode.path===1&&revOwners.get(args[0])===mode.case){
    if(args[0].stopped===true){if(!mode.c6)revEmit(mode,5,1);}else revFail();}return result;};
const revStop=RevRuntime.prototype.stop;
RevRuntime.prototype.stop=function(...args){const mode=revRuntimes.get(this);
  if(mode&&!mode.c6){const restored=revRestore();revEmit(mode,6,1,0,0,restored);}
  const diag=diagStopBegin(this,args[0]);
  const result=Reflect.apply(revStop,this,args);
  diagStopForwarded(diag,result);
  if(mode){const reason=['REVOKED','LEASE_LOST','EXPIRED','CANCELLED','CONTEXT_LOST',...(mode.c6?['UNKNOWN_OUTCOME']:[])].indexOf(args[0])+1;
    if(this.accepting===false&&reason>0)revEmit(mode,5,1,0,reason);else revFail();
    const runtime=this;
    if(mode.c6){
      if(!revC6RetryRestore){
        let restoring=null,closeSucceeded=false,closedRecorded=false;
        const retry=()=>{
          if(restoring)return restoring;
          restoring=(async()=>{
            const deadline=performance.now()+10000;
            const lifetime=mode.c6===3?revLossLifetime:null;
            if(lifetime&&(!lifetime.cleanupAuthorized||!closeSucceeded))return false;
            const pending=()=>runtime.busy||revC6CdpPending||(lifetime?
              lifetime.operations||lifetime.callbacks||revOriginalPending:revActive.size||revC6HighPending);
            while(pending()&&performance.now()<deadline)
              await new Promise(resolve=>setTimeout(resolve,10));
            if(pending()||(lifetime&&runtime.active)){revLossRefuse(1);revFail();return false;}
            const restored=revRestore();revEmit(mode,6,1,0,0,restored);
            if(!restored){revFail();return false;}
            revC6Restored=true;
            if(closeSucceeded&&!closedRecorded){closedRecorded=true;revEmit(mode,9,1);}
            if(lifetime){lifetime.snapshot={high:revC6HighPending,active:revActive.size};lifetime.retired=true;}
            // Drop only after actual dispatch settlement and exact descriptor restore.
            revRuntimes.delete(runtime);
            if(revLossSelected()){const actualBusy=runtime.busy;
              revLossBusy=typeof actualBusy==='boolean'?Number(actualBusy):2;revLossRuntime=null;}
            revC6RetryRestore=null;return true;
          })().catch(()=>{revLossRefuse(4);revFail();return false;}).finally(()=>{restoring=null;});
          return restoring;
        };
        revC6RetryRestore=retry;
        result.then(()=>{closeSucceeded=true;return mode.c6===3?true:retry();},()=>{
          // Original rejection remains on the unchanged result; restoration is distinct.
          revLossRefuse(5);revFail();return retry();
        }).catch(()=>{revFail();});
      } else {
        result.then(()=>mode.c6===3?true:revC6RetryRestore?.(),()=>{revLossRefuse(5);revFail();return revC6RetryRestore?.();})
          .catch(()=>{revFail();});
      }
    } else {
      result.then(()=>revEmit(mode,9,1),()=>{revFail();}).catch(()=>{revFail();});
      revRuntimes.delete(this);
    }}
  return result;};

try{diagInstallOwnership();}catch{diagInstallationFailed=true;}

// S2 observes original operation completion only; no native/provider/model/callback call added.
const s2States=new Map(),s2Methods=[];
const s2Mode=()=>{const mode=revMode();return mode?.s2===true&&mode.active===false
  &&Number.isInteger(mode.case)&&mode.case>0&&(mode.sessionId===null||typeof mode.sessionId==='string')?mode:null;};
const s2Publish=(state,closed=false,restored=false)=>{
  try{revCheckRoot();const mode=s2Mode();if(!mode||mode.case!==state.epoch)throw new Error('S2_MODE');
    const matches=[...s2States.values()].filter(item=>item.id===mode.sessionId).length;
    const target=revLedgerRoot+'/s2-'+state.epoch+'-1.json',temporary=target+'.tmp';
    if(revFs.existsSync(target)){const old=revFs.lstatSync(target);
      if(old.isSymbolicLink()||!old.isFile()||(old.mode&0o777)!==0o600)throw new Error('S2_FILE');}
    const bytes=JSON.stringify({case:state.epoch,producer:1,epoch:state.epoch,failed:state.failed,
      closed,restored,stopFulfilled:state.stopFulfilled,active:state.runtime.active,busy:state.runtime.busy,
      operations:state.operations,callbacks:state.callbacks,matches,starts:state.starts});
    if(Buffer.byteLength(bytes)>1024)throw new Error('S2_BOUND');
    const fd=revFs.openSync(temporary,revFs.constants.O_WRONLY|revFs.constants.O_CREAT|
      revFs.constants.O_EXCL|revFs.constants.O_NOFOLLOW,0o600);
    try{revFs.writeFileSync(fd,bytes);revFs.fsyncSync(fd);}finally{revFs.closeSync(fd);}
    revCheckRoot();revFs.renameSync(temporary,target);
  }catch{state.failed=true;revMarker();}
};
const s2Restore=state=>{
  let restored=true;
  for(const [object,name,descriptor,wrapped] of [[state.options,'callback',state.callbackDescriptor,state.callback],...s2Methods]){
    if(Object.getOwnPropertyDescriptor(object,name)?.value!==wrapped
      ||!Reflect.defineProperty(object,name,descriptor))restored=false;
  }
  return restored;
};
const s2Drain=state=>{
  const mode=s2Mode();if(!mode||mode.case!==state.epoch||mode.sessionId!==state.id||state.draining||state.closed)return;
  if(!state.stopFulfilled)return;state.draining=true;
  void (async()=>{const deadline=performance.now()+10000;
    while((state.operations||state.callbacks||state.runtime.busy)&&performance.now()<deadline)
      await new Promise(resolve=>setTimeout(resolve,10));
    if(state.failed||state.starts!==1||state.operations||state.callbacks||state.runtime.busy||state.runtime.active
      ||s2States.size!==1||[...s2States.values()].filter(item=>item.id===mode.sessionId).length!==1)throw new Error('S2_PENDING');
    const restored=s2Restore(state);if(!restored)throw new Error('S2_DESCRIPTOR');
    state.closed=true;s2Publish(state,true,true);
  })().catch(()=>{state.failed=true;s2Publish(state);}).finally(()=>{state.draining=false;});
};
const s2State=runtime=>{
  const mode=s2Mode();if(!mode)return null;
  let state=s2States.get(runtime);if(state){if(state.epoch!==mode.case){state.failed=true;s2Publish(state);return null;}return state;}
  const options=runtime.options,descriptor=Object.getOwnPropertyDescriptor(options,'callback');
  if(!descriptor||typeof descriptor.value!=='function'||descriptor.configurable!==true){revMarker();return null;}
  state={runtime,options,id:runtime.currentIdentity.sessionId,epoch:mode.case,starts:0,operations:0,callbacks:0,
    stopFulfilled:false,draining:false,closed:false,failed:false,callbackDescriptor:descriptor,callback:null};
  const original=descriptor.value;
  state.callback=function(...args){state.callbacks++;let result;
    try{result=Reflect.apply(original,this,args);}catch(error){state.callbacks--;s2Drain(state);throw error;}
    try{result.then(()=>{state.callbacks--;s2Drain(state);},()=>{state.callbacks--;s2Drain(state);}).catch(()=>{state.failed=true;s2Publish(state);});}
    catch{state.failed=true;s2Publish(state);}return result;};
  if(!Reflect.defineProperty(options,'callback',{...descriptor,value:state.callback})){revMarker();return null;}
  s2States.set(runtime,state);return state;
};
for(const name of ['start','dispatch','refreshObservation','stop']){
  const descriptor=Object.getOwnPropertyDescriptor(RevRuntime.prototype,name),original=descriptor?.value;
  if(typeof original!=='function'||descriptor.configurable!==true)throw new Error('S2_DESCRIPTOR');
  const wrapped=function(...args){const state=s2State(this);
    if(state&&name!=='stop'){state.operations++;if(name==='start')state.starts++;}
    let result;try{result=Reflect.apply(original,this,args);}catch(error){
      if(state){if(name!=='stop')state.operations--;else state.failed=true;s2Drain(state);}throw error;}
    if(state){const settled=fulfilled=>{if(name==='stop'){if(fulfilled)state.stopFulfilled=true;else{state.failed=true;s2Publish(state);}}
        else state.operations--;s2Drain(state);};
      try{result.then(()=>settled(true),()=>settled(false)).catch(()=>{state.failed=true;s2Publish(state);});}
      catch{state.failed=true;s2Publish(state);}}
    return result;};
  if(!Reflect.defineProperty(RevRuntime.prototype,name,{...descriptor,value:wrapped}))throw new Error('S2_DESCRIPTOR');
  s2Methods.push([RevRuntime.prototype,name,descriptor,wrapped]);
}

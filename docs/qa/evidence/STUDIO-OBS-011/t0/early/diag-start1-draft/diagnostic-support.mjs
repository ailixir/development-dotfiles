// Off-tree source for the embedded ReplayIT fixture. Never imported by this draft.
import {createHash as diagCreateHash} from 'node:crypto';
const diagRoot=__DIAG_ROOT__,diagSites=__DIAG_SITES__,diagDistHashes=__DIAG_HASHES__;
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

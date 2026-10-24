/* Sealed PURE operator data helper. No imports/tools/OS/process/network/clock APIs.
   Inputs are exact separately captured root facts; output is an attestation, never
   physical observation/direct wait. All loops/caps finite; no recursive helpers. */
const FR08Operator = (() => {
  'use strict';
  const cap = 1048576;
  const need = (v, code) => { if (v !== true) throw new Error(code); };
  const ascii = (v, max = cap) => {
    need(typeof v === 'string' && v.length <= max, 'ASCII_STRING_CAP');
    for (let i = 0; i < v.length; i++) need(v.charCodeAt(i) >= 32 && v.charCodeAt(i) <= 126, 'ASCII_ONLY');
    return v;
  };
  const plain = v => {
    need(v !== null && typeof v === 'object' && !Array.isArray(v), 'EXACT_PLAIN_RECORD');
    const proto = Object.getPrototypeOf(v);
    need(proto === Object.prototype || proto === null, 'EXACT_PLAIN_RECORD');
    const desc = Object.getOwnPropertyDescriptors(v);
    for (const key of Object.keys(desc)) need(Object.prototype.hasOwnProperty.call(desc[key], 'value'), 'NO_ACCESSORS');
    return v;
  };
  const fields = (v, names) => {
    plain(v); const actual = Object.keys(v).sort(); const expected = names.slice().sort();
    need(actual.length === expected.length && actual.every((x,i) => x === expected[i]), 'CLOSED_FIELDS');
  };
  const integer = (v, min = 0, max = 2147483647) => Number.isSafeInteger(v) && v >= min && v <= max;
  const hash = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
  const canonical = (value, maximum = cap) => {
    const stack = [{value}], out = []; let bytes = 0, visits = 0;
    while (stack.length) {
      need(++visits <= 200000, 'SERIALIZATION_VISITS'); const task = stack.pop();
      if (Object.prototype.hasOwnProperty.call(task,'literal')) { bytes += task.literal.length; need(bytes <= maximum,'SERIALIZATION_CAP'); out.push(task.literal); continue; }
      const v = task.value;
      let raw;
      if (v === null) raw = 'null';
      else if (typeof v === 'boolean') raw = v ? 'true' : 'false';
      else if (typeof v === 'number') { need(Number.isFinite(v) && Math.abs(v)<=9007199254740991, 'FINITE_JSON_NUMBER'); raw = JSON.stringify(v); }
      else if (typeof v === 'string') raw = JSON.stringify(ascii(v));
      else {
        const array = Array.isArray(v); if (!array) plain(v);
        const keys = array ? Array.from({length:v.length},(_,i)=>i) : Object.keys(v).sort();
        need(keys.length <= 8192, 'CONTAINER_CAP');
        if (array) {
          const ds=Object.getOwnPropertyDescriptors(v);
          need(Object.keys(ds).length===v.length+1 && keys.every(k=>Object.prototype.hasOwnProperty.call(ds[k] || {},'value')), 'DENSE_ARRAY_NO_ACCESSORS');
        }
        stack.push({literal:array?']':'}'});
        for (let i = keys.length - 1; i >= 0; i--) {
          const k = keys[i]; stack.push({value:v[k]});
          if (!array) { stack.push({literal:':'}); stack.push({literal:JSON.stringify(ascii(k,128))}); }
          if (i > 0) stack.push({literal:','});
        }
        stack.push({literal:array?'[':'{'}); continue;
      }
      bytes += raw.length; need(bytes <= maximum,'SERIALIZATION_CAP'); out.push(raw);
    }
    return out.join('');
  };
  const sha256 = text => {
    // ASCII byte SHA256; exact bounded same buffer. No host crypto/provider required.
    ascii(text); const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], words=[];
    for(let i=0;i<text.length;i++) words[i>>2]=(words[i>>2]||0)|(text.charCodeAt(i)<<(24-(i%4)*8));
    words[text.length>>2]=(words[text.length>>2]||0)|(0x80<<(24-(text.length%4)*8));
    const blocks=Math.ceil((text.length+9)/64); words[blocks*16-2]=0;words[blocks*16-1]=text.length*8;
    const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
    for(let block=0;block<blocks;block++){
      const w=new Array(64);
      for(let i=0;i<16;i++)w[i]=words[block*16+i]|0;
      for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=((rotr(x,7)^rotr(x,18)^(x>>>3))+w[i-16]+(rotr(y,17)^rotr(y,19)^(y>>>10))+w[i-7])|0;}
      let [a,b,c,d,e,f,g,h]=H;
      for(let i=0;i<64;i++){const t1=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])|0;const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
      for(const [i,v] of [a,b,c,d,e,f,g,h].entries())H[i]=(H[i]+v)|0;
    }
    return H.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
  };
  const actorFields=['pid','ppid','kind','start','argvHash','fullFingerprint','completionKind','actualStatus','directWaitClaimed','qualified','requiredDisposition','evidence'];
  const actor = row => {
    fields(row,actorFields);need(integer(row.pid,1) && (row.ppid===null || integer(row.ppid,1)),'ACTOR_IDS');
    need(row.fullFingerprint===null && row.qualified===false && row.requiredDisposition==='NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS','ACTOR_LIMITS');
    need(row.start===null || typeof row.start==='string' && row.start.length<=128,'ACTOR_START');need(row.argvHash===null || hash(row.argvHash),'ACTOR_HASH');
    ascii(row.kind,128);ascii(row.evidence,1024);
    need(['ACTUAL_EXTERNAL_TOOL_EXIT','SEPARATE_FOREGROUND_STATUS','OBSERVED_DIRECT_UTILITY_WAIT'].includes(row.completionKind),'ACTOR_COMPLETION_KIND');
    need(row.directWaitClaimed===(row.completionKind==='OBSERVED_DIRECT_UTILITY_WAIT') && (row.actualStatus===null || integer(row.actualStatus,-2147483648)),'ACTOR_STATUS');
    return row;
  };
  const tool = value => {
    fields(value,['pid','ppid','toolCallId','actualStatus','separateStatusCaptured']);
    need(integer(value.pid,1) && integer(value.ppid,1) && integer(value.actualStatus,-2147483648) && value.separateStatusCaptured===true
      && typeof value.toolCallId==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.toolCallId),'ACTUAL_TOOL_FACTS');return value;
  };
  const completion = input => {
    fields(input,['unit','controlSha256','sourceManifestSha256','roleContractSha256','pendingActors','actualCompletedTools']);
    ascii(input.unit,128);need(hash(input.controlSha256)&&hash(input.sourceManifestSha256)&&hash(input.roleContractSha256),'SOURCE_BINDINGS');
    need(Array.isArray(input.pendingActors)&&input.pendingActors.length<=8192&&Array.isArray(input.actualCompletedTools)&&input.actualCompletedTools.length<=64,'PENDING_CAP');
    const pending=new Map();
    for(const row of input.pendingActors){actor(row);if(row.actualStatus===null){need(integer(row.ppid,1)&&row.directWaitClaimed===false&&['ACTUAL_EXTERNAL_TOOL_EXIT','SEPARATE_FOREGROUND_STATUS'].includes(row.completionKind),'PENDING_AUTHOR_KIND');const before=pending.get(row.pid);need(before===undefined || canonical(before)===canonical(row),'CONFLICTING_PENDING');pending.set(row.pid,row);}}
    need(pending.size>0&&pending.size<=64,'EXACT_NONEMPTY_PENDING_SET');const observed=new Map();
    for(const record of input.actualCompletedTools){tool(record);need(record.actualStatus===0 && !observed.has(record.pid),'ACTUAL_SEPARATE_AUTHOR_ZERO');observed.set(record.pid,record);}
    need(observed.size===pending.size&&[...pending.keys()].every(pid=>observed.has(pid)),'EXACT_PENDING_SET');
    const actors=[];
    for(const pid of [...pending.keys()].sort((a,b)=>a-b)){const row=pending.get(pid),actual=observed.get(pid);need(actual.ppid===row.ppid,'ACTUAL_PARENT_BINDING');actors.push({pid,ppid:row.ppid,completionKind:row.completionKind,actualStatus:0,toolEvidence:[{toolCallId:actual.toolCallId,separateStatusCaptured:true,actualStatus:0}]});}
    const value={kind:'ROOT_OPERATOR_ATTESTATION',unit:input.unit,controlSha256:input.controlSha256,roleContractSha256:input.roleContractSha256,readonlyBuffer:true,separatelyCaptured:true,actors};
    const buffer=canonical(value,65536);return Object.freeze({buffer,sha256:sha256(buffer),bytes:buffer.length,sourceManifestSha256:input.sourceManifestSha256,physicalObservation:false,directWait:false});
  };
  const quote = value => "'"+ascii(value).replace(/'/g,"'\"'\"'")+"'";
  const binder = (completed,controlSha,role) => {
    fields(completed,['buffer','sha256','bytes','sourceManifestSha256','physicalObservation','directWait']);
    need(hash(controlSha)&&hash(completed.sha256)&&hash(completed.sourceManifestSha256)&&integer(completed.bytes,1,65536)
      &&completed.bytes===completed.buffer.length&&sha256(completed.buffer)===completed.sha256&&completed.physicalObservation===false&&completed.directWait===false,'SAME_COMPLETION_BUFFER_SHA');
    need(typeof role==='string'&&/^(SETUP|HELD|ADMISSION|ARCHIVE|FINAL|GATE|POSTCLOSE)$/.test(role),'BINDER_ROLE');
    const prefix='GATEWAY_FR05_'+role;
    const command='readonly '+prefix+'_CONTROL_SHA='+quote(controlSha)+'\nreadonly '+prefix+'_COMPLETION_SHA='+quote(completed.sha256)+'\nreadonly '+prefix+'_COMPLETION_BUFFER='+quote(completed.buffer)+'\n';
    need(command.length<=131072,'BINDER_CAP');return command;
  };
  const adoptState = (pin,sourceManifestSha,actual) => {
    fields(pin,['kind','header','sha256']);need(pin.kind==='SOURCE08_CURRENT_N3_STATE_PIN'&&hash(pin.sha256),'STATE_RAW_PIN');
    const state=pin.header;fields(state,['kind','unit','authoritySha256','sourceGeneration','namespace','mode','expectedExit','ownActualCompletion','outerCompletionOwed','actorFacts']);
    need(state.kind==='SOURCE08_CURRENT_N3_STATE'&&state.sourceGeneration===8&&state.ownActualCompletion===null&&state.outerCompletionOwed===true&&hash(sourceManifestSha),'STATE_SOURCE');
    tool(actual);need(actual.actualStatus===state.expectedExit&&(state.expectedExit===0||state.expectedExit===1),'STATE_ACTUAL_OUTER_STATUS');
    need(Array.isArray(state.actorFacts)&&state.actorFacts.length<=8192,'STATE_ACTOR_CAP');const actualPriorActors=[];
    for(const row of state.actorFacts){actor(row);if(row.kind==='DESIGNATED_PENDING_ACTUAL_SOURCE08_CONTROL_AUTHOR'||row.completionKind==='OBSERVED_DIRECT_UTILITY_WAIT')continue;const copied={...row};if(copied.pid===actual.pid&&copied.actualStatus===null){need(copied.ppid===actual.ppid&&copied.completionKind==='ACTUAL_EXTERNAL_TOOL_EXIT','STATE_PRODUCER_BINDING');copied.actualStatus=actual.actualStatus;}need(copied.actualStatus!==null,'STATE_MISSING_ACTUAL_COMPLETION');actualPriorActors.push(copied);}
    return Object.freeze({approvedStateHeader:state,approvedStateSha256:pin.sha256,stateAdoption:{kind:'ROOT_OPERATOR_ACTUAL_STATE_ADOPTION',stateSha256:pin.sha256,sourceManifestSha256:sourceManifestSha,actualStatus:actual.actualStatus,expectedStatus:state.expectedExit,separateStatusCaptured:true,toolCallId:actual.toolCallId,noFailureTrace:true},actualPriorActors});
  };
  const actualActor = (actual,kind,evidence,start=null,argvHash=null) => {
    tool(actual);need(['ACTUAL_SOURCE08_PHASE_OBSERVER','SUCCESSFUL_HELD_PARENT_SETUP_HELPER','EXTERNAL_ROOT_APPROVED_SOURCE_READER','EXTERNAL_ROOT_CONTROL_AUTHOR'].includes(kind),'ACTUAL_ACTOR_KIND');
    ascii(evidence,1024);need(evidence.startsWith('/')&&evidence.includes('/failed-red-resource-disposition04/'),'ACTUAL_ACTOR_CONTROL_EVIDENCE');
    return actor({pid:actual.pid,ppid:actual.ppid,kind,start,argvHash,fullFingerprint:null,completionKind:'ACTUAL_EXTERNAL_TOOL_EXIT',actualStatus:actual.actualStatus,directWaitClaimed:false,qualified:false,requiredDisposition:'NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS',evidence});
  };
  const request = value => {
    fields(value,['kind','authorizedBy','authorized','role','releaseSha256','sourceManifestSha256','approvedStateHeader','approvedStateSha256','stateAdoption','operatorFacts','actualPriorActors']);
    need(value.kind==='SOURCE08_CURRENT_CONTROL_AUTHOR_REQUEST'&&value.authorizedBy==='root'&&value.authorized===true&&hash(value.releaseSha256)&&hash(value.sourceManifestSha256),'REQUEST_SCOPE');
    plain(value.approvedStateHeader);need(hash(value.approvedStateSha256)&&value.stateAdoption.stateSha256===value.approvedStateSha256,'SAME_STATE_BUFFER_SHA');
    need(Array.isArray(value.actualPriorActors)&&value.actualPriorActors.length<=64,'ACTUAL_ACTOR_CAP');for(const row of value.actualPriorActors){actor(row);need(row.actualStatus!==null,'ACTUAL_ACTOR_STATUS');}
    const buffer=canonical(value,1048576);return Object.freeze({buffer,sha256:sha256(buffer),bytes:buffer.length});
  };
  const initialFacts = value => {
    fields(value,['kind','unit','sourceManifestSha256','installScopeSha256','authorizedBy','authorized','completeActualFacts','actors']);
    need(value.kind==='SOURCE08_INITIAL_ACTUAL_FACTS'&&value.unit==='obs009-gateway80-offtree03-20261019'&&hash(value.sourceManifestSha256)&&hash(value.installScopeSha256)&&value.authorizedBy==='root'&&value.authorized===true&&value.completeActualFacts===true,'INITIAL_FACTS_SCOPE');
    need(Array.isArray(value.actors)&&value.actors.length>=1&&value.actors.length<=64,'INITIAL_FACTS_BOUND');
    const roles=['EXTERNAL_ROOT_CONTROL_AUTHOR','EXTERNAL_ROOT_APPROVED_SOURCE_READER','EXTERNAL_ROOT_APPROVED_HELPER','EXTERNAL_ROOT_OWNER_RECORD_AUTHOR','EXTERNAL_ROOT_INSTALL_SCOPE_AUTHOR','EXTERNAL_ROOT_INPUT_AUTHOR'];
    const seen=new Map();
    for(const item of value.actors){
      fields(item,['role','pid','ppid','actualStatus','toolCallId','separateStatusCaptured','originalTrace']);
      need(roles.includes(item.role)&&integer(item.pid,1)&&integer(item.ppid,1)&&integer(item.actualStatus,-2147483648)&&item.separateStatusCaptured===true&&typeof item.toolCallId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(item.toolCallId),'INITIAL_FACT_SCHEMA');
      const trace=item.originalTrace;
      fields(trace,['kind','toolCallId','pid','ppid','actualStatus','separateStatusCaptured','statusMeaning','unit','sourceManifestSha256','installScopeSha256']);
      need(trace.kind==='ORIGINAL_SEPARATELY_CAPTURED_TOOL_TRACE'&&trace.toolCallId===item.toolCallId&&trace.pid===item.pid&&trace.ppid===item.ppid&&trace.actualStatus===item.actualStatus&&trace.separateStatusCaptured===true&&trace.statusMeaning==='ACTUAL_EXTERNAL_TOOL_EXIT_NOT_DIRECT_WAIT'&&trace.unit===value.unit&&trace.sourceManifestSha256===value.sourceManifestSha256&&trace.installScopeSha256===value.installScopeSha256,'INITIAL_FACT_TRACE_BINDING');
      const exact=canonical(item,65536);need(!seen.has(item.pid)||seen.get(item.pid)===exact,'INITIAL_FACT_CONFLICT');seen.set(item.pid,exact);
    }
    const buffer=canonical(value,65536);return Object.freeze({buffer,sha256:sha256(buffer),bytes:buffer.length});
  };
  const initialBinder = completed => {
    fields(completed,['buffer','sha256','bytes']);ascii(completed.buffer,65536);
    need(hash(completed.sha256)&&sha256(completed.buffer)===completed.sha256&&completed.bytes===completed.buffer.length,'INITIAL_FACTS_SAME_BUFFER_SHA');
    const quote=v=>"'"+v.replace(/'/g,"'\"'\"'")+"'";
    const command='readonly GATEWAY_FR05_INITIAL_FACTS_SHA='+quote(completed.sha256)+'\nreadonly GATEWAY_FR05_INITIAL_FACTS_BUFFER='+quote(completed.buffer)+'\n';
    need(command.length<=131072,'BINDER_CAP');return command;
  };

  return Object.freeze({sha256,canonical,completion,binder,adoptState,actualActor,request,initialFacts,initialBinder});
})();

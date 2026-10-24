"""One-off Order11 EXISTING-evidence projection. No native/process/network/driver methods.
No release exists during preparation. CLI fails before private input/stat/open without exact
future independently approved root+Quinn scope and whole-execution terminal/public proof.
"""
from pathlib import Path,PurePosixPath
import argparse,datetime,hashlib,io,json,os,re,stat,sys,uuid
import xml.etree.ElementTree as ET
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'AGENTS.md').is_file())
C=json.loads((HERE/'source-contract.json').read_text())
FQCN='com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'
ROLES={'default_xml','snapshot_initial18','guided_log','owned_events'}
SOURCE_PATHS=frozenset(['AGENTS.md', 'studio-runner/src/guided/diagnostics.ts', 'studio-runner/src/guided/transport.ts', 'studio-runner/src/guided/runtime.ts', 'studio-runner/src/guided/ownership.ts', 'studio-runner/src/guided/journal.ts', 'studio-runner/src/guided/contracts.ts', 'studio-runner/src/run/guidedBrowser.ts', 'studio-runner/src/run/browser.ts', 'studio-runner/src/run/observedBootstrap.ts', 'studio-runner/dist/guided/diagnostics.js', 'studio-runner/dist/guided/transport.js', 'studio-runner/dist/guided/runtime.js', 'studio-runner/dist/guided/ownership.js', 'studio-runner/dist/run/guidedBrowser.js', 'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java', 'backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java', 'backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java', 'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/fullcheck03-order11-closed-default/review.md', 'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/fullcheck03-order11-closed-default/public-facts.json', 'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/fullcheck03-order11-closed-default/inspect_public.py', 'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-report-static-protocol-root-adoption.json', 'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/report-static-assets-review/post-terminal-protocol.md', 'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/report-static-assets-review/proposed-static-resource-catalog.json', '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend.py', '.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py', '.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'])
SAFE=9007199254740991
SHA=re.compile(r'[a-f0-9]{64}')
class Refused(Exception):pass
class ClosedArgumentParser(argparse.ArgumentParser):
 def error(self,message):raise Refused('CLI_ARGUMENTS_REJECTED')
def require(value,code):
 if not value:raise Refused(code)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def stable_stat(st):
 # Reading may update atime; byte ownership and mutation checks intentionally exclude it.
 return (st.st_dev,st.st_ino,st.st_uid,st.st_gid,st.st_mode,st.st_size,st.st_mtime_ns,st.st_ctime_ns)
def canonical(obj):return json.dumps(obj,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def keys(obj,required,optional=()):require(type(obj) is dict and set(required)<=set(obj)<=set(required)|set(optional),'UNKNOWN_OR_MISSING_FIELDS')
def integer(n,maximum=SAFE,minimum=0):require(type(n) is int and minimum<=n<=maximum,'NUMERIC_BOUND')
def pairs(items):
 out={}
 for key,value in items:
  require(key not in out,'DUPLICATE_JSON_KEY');out[key]=value
 return out
def decode(raw,cap):
 require(type(raw) is bytes and len(raw)<=cap,'ARTIFACT_SIZE_BOUND')
 try:value=json.loads(raw.decode('utf-8'),object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(Refused('NONFINITE_JSON')))
 except Refused:raise
 except Exception:raise Refused('MALFORMED_JSON') from None
 count=0
 def visit(node,depth):
  nonlocal count
  count+=1;require(count<=50000 and depth<=16,'JSON_SHAPE_BOUND')
  if isinstance(node,dict):
   for value in node.values():visit(value,depth+1)
  elif isinstance(node,list):
   for value in node:visit(value,depth+1)
 visit(value,0);return value

def uuid_text(value):
 require(type(value) is str and len(value)==36,'IDENTITY_SHAPE')
 try:require(str(uuid.UUID(value))==value,'NONCANONICAL_IDENTITY')
 except ValueError:raise Refused('IDENTITY_SHAPE') from None
 return value

def scope_contract(scope):
 fields={'purpose','executionLabel','parserSha256','packageManifestSha256','sourceBindingsSha256','sourceDigest','distDigest','nativeCommandSha256','rawReceiptSha256','beforeSha256','afterSha256','terminalProofSha256','publicAssessmentSha256','privateManifestSha256','originalProtocolSha256','allowedRoles','issuedAtUtc','expiresAtUtc'}
 keys(scope,fields)
 require(scope['purpose']==C['purpose'] and scope['executionLabel']==C['executionLabel'],'WRONG_SCOPE')
 require(scope['sourceDigest']==C['sourceDigest'] and scope['distDigest']==C['distDigest'],'HELD_DIGEST_MISMATCH')
 require(scope['originalProtocolSha256']==C['originalProtocolSha256'],'ORIGINAL_PROTOCOL_CHANGED')
 require(type(scope['allowedRoles']) is list and len(scope['allowedRoles'])==4 and set(scope['allowedRoles'])==ROLES,'INPUT_ALLOWLIST')
 for key in fields-{'purpose','executionLabel','allowedRoles','issuedAtUtc','expiresAtUtc'}:require(type(scope[key]) is str and SHA.fullmatch(scope[key]),'INVALID_SCOPE_HASH')

# Pure guard: caller supplies only PUBLIC release/terminal/assessment/native receipt bytes here.
def preauthorize(public,expected,local,now=None):
 require(set(public)=={'authorization','root_approval','quinn_approval','terminal','assessment'},'PUBLIC_RELEASE_SET')
 require(set(expected)=={'authorization','root_approval','quinn_approval'},'EXTERNAL_APPROVAL_PINS')
 for alias in expected:
  require(SHA.fullmatch(expected[alias]) and digest(public[alias])==expected[alias],'APPROVAL_HASH_MISMATCH')
 auth=decode(public['authorization'],65536);keys(auth,{'schemaVersion','released','scope','rootApprovalSha256','quinnApprovalSha256'})
 require(type(auth['schemaVersion']) is int and auth['schemaVersion']==1 and auth['released'] is True,'NO_EXECUTION_RELEASE')
 scope=auth['scope'];scope_contract(scope)
 try:
  issued=datetime.datetime.fromisoformat(scope['issuedAtUtc']);expires=datetime.datetime.fromisoformat(scope['expiresAtUtc'])
  current=now if now is not None else datetime.datetime.now(datetime.timezone.utc)
 except Exception:raise Refused('AUTHORIZATION_TIME_SHAPE') from None
 require(issued.utcoffset()==expires.utcoffset()==current.utcoffset()==datetime.timedelta(0) and 0<(expires-issued).total_seconds()<=3600 and issued<=current<=expires,'AUTHORIZATION_NOT_FRESH')
 require(scope['parserSha256']==local['parserSha256'] and scope['packageManifestSha256']==local['packageManifestSha256'] and scope['sourceBindingsSha256']==local['sourceBindingsSha256'],'PARSER_OR_PACKAGE_CHANGED')
 request=digest(canonical(scope))
 for alias,role in [('root_approval','ROOT'),('quinn_approval','QUINN')]:
  approval=decode(public[alias],32768);keys(approval,{'schemaVersion','role','approved','scopeSha256'})
  require(type(approval['schemaVersion']) is int and approval['approved'] is True and approval=={'schemaVersion':1,'role':role,'approved':True,'scopeSha256':request},'MISSING_INDEPENDENT_APPROVAL')
  require(auth['rootApprovalSha256' if role=='ROOT' else 'quinnApprovalSha256']==expected[alias],'APPROVAL_NOT_SCOPE_BOUND')
 for alias,key in [('terminal','terminalProofSha256'),('assessment','publicAssessmentSha256')]:require(digest(public[alias])==scope[key],'PUBLIC_PROOF_BINDING')
 t=decode(public['terminal'],65536)
 keys(t,{'schemaVersion','executionLabel','rawReceiptSha256','nativeCommandSha256','sourceDigest','distDigest','originalProtocolSha256','collectorTerminal','sameStartOwnedJvmTerminal','ownedUnknownTerminal','wholeExecutionClosed','terminalInferredFromTimeout','sourceHoldVerified','quotesHelmHelpersHeld','observationGapSticky','authoritativeClosureEvidenceSha256','completedAtUtc'})
 require(type(t['schemaVersion']) is int and t['schemaVersion']==1 and all(t[k]==scope[k] for k in ['executionLabel','rawReceiptSha256','nativeCommandSha256','sourceDigest','distDigest','originalProtocolSha256']),'TERMINAL_PROOF_SCOPE')
 try:completed=datetime.datetime.fromisoformat(t['completedAtUtc'])
 except Exception:raise Refused('TERMINAL_TIME_SHAPE') from None
 require(completed.utcoffset()==datetime.timedelta(0) and completed<=issued,'RELEASE_PRECEDES_TERMINAL_PROOF')
 require(all(t[k] is True for k in ['collectorTerminal','sameStartOwnedJvmTerminal','ownedUnknownTerminal','wholeExecutionClosed','sourceHoldVerified','quotesHelmHelpersHeld','observationGapSticky']) and t['terminalInferredFromTimeout'] is False,'WHOLE_OWNED_TERMINAL_NOT_PROVED')
 require(type(t['authoritativeClosureEvidenceSha256']) is list and 1<=len(t['authoritativeClosureEvidenceSha256'])<=32 and all(type(h) is str and SHA.fullmatch(h) for h in t['authoritativeClosureEvidenceSha256']),'STICKY_GAP_RECOVERY_NOT_BOUND')
 a=decode(public['assessment'],65536)
 keys(a,{'schemaVersion','executionLabel','rawReceiptSha256','nativeCommandSha256','sourceDigest','distDigest','terminalProofSha256','wholePublicArchiveFrozen','wholePublicAssessmentComplete','rawFailPreserved','observationGapPreserved','noLaneApproval'})
 require(type(a['schemaVersion']) is int and a['schemaVersion']==1 and all(a[k]==scope[k] for k in ['executionLabel','rawReceiptSha256','nativeCommandSha256','sourceDigest','distDigest','terminalProofSha256']),'PUBLIC_ASSESSMENT_SCOPE')
 require(all(a[k] is True for k in ['wholePublicArchiveFrozen','wholePublicAssessmentComplete','rawFailPreserved','observationGapPreserved','noLaneApproval']),'PUBLIC_FINAL_ASSESSMENT_REQUIRED')
 return scope

def authorize(public,expected,local,now=None):
 require(set(public)=={'authorization','root_approval','quinn_approval','terminal','assessment','receipt','before','after'},'PUBLIC_RELEASE_SET')
 scope=preauthorize({k:public[k] for k in ['authorization','root_approval','quinn_approval','terminal','assessment']},expected,local,now)
 for alias,key in [('receipt','rawReceiptSha256'),('before','beforeSha256'),('after','afterSha256')]:require(digest(public[alias])==scope[key],'PUBLIC_PROOF_BINDING')
 receipt=decode(public['receipt'],33554432);before=decode(public['before'],16777216);after=decode(public['after'],16777216)
 require(receipt.get('sourceStable') is True and receipt.get('distStable') is True and receipt.get('testInputStable') is True,'RAW_HELD_INPUT_FAILURE')
 require(digest(canonical(receipt['command']))==scope['nativeCommandSha256'],'RAW_NATIVE_COMMAND_MISMATCH')
 require(len(receipt['explicitTestTasks'])==3 and set(receipt['explicitTestTasks'])=={'test','guidedIncrementalTest','crossReplicaTest'},'NOT_WHOLE_COLLECTOR')
 require(type(receipt['exit']) is int and type(receipt['gradleExit']) is int and receipt['exit']!=0 and receipt['gradleExit']!=0 and type(receipt['taskCollectionComplete']) is bool,'RAW_FAIL_NOT_RETAINED')
 matches=[r for r in receipt['testcases'] if (r.get('task'),r.get('class'),r.get('name'))==('test',FQCN,C['method']+'()')]
 require(len(matches)==1 and matches[0]['status']=='FAIL','RAW_ORDER11_FAILURE_NOT_BOUND')
 require(before['digest']==after['digest']==C['sourceDigest'] and before['dist']['digest']==after['dist']['digest']==C['distDigest'] and before['files']==after['files'],'HELD_CAPTURE_MISMATCH')
 return {'scope':scope,'rawCollectorExit':receipt['exit'],'rawGradleExit':receipt['gradleExit'],'rawTaskCollectionComplete':receipt['taskCollectionComplete'],'rawReceiptSha256':scope['rawReceiptSha256'],'observationGapSticky':True}

# Source-defined private snapshot schema. UUIDs are compared in memory and never exported.
OPERATIONS={'navigate','fill','click','read','assert','press','hover','check','uncheck','selectOption','OTHER'}
def numbers(obj,allowed):
 keys(obj,set(),allowed)
 for value in obj.values():integer(value,9223372036854775807)
def snapshot(raw):
 s=decode(raw,1048576)
 required={'schemaVersion','sessionId','testId','testMethod','state','errorCode','bootstrapPhase','publicationSnapshotPresent','publicationRevisionPresent','materializationPresent','counters','coordinate','observationCounts','acquisition','activeAcquisition','fixtureModelHttpCalls','fixturePhysicalProviderReads','fixtureProviderFailures','fixtureModelKinds','actions','obligationAdmissions','modelAttempts'}
 keys(s,required,{'activeSourceStepId','continuation','translationCounters','declarations','obligations'})
 require(type(s['schemaVersion']) is int and s['schemaVersion']==1 and s['testMethod']==C['method'],'SNAPSHOT_SOURCE_SCOPE')
 uuid_text(s['sessionId']);uuid_text(s['testId'])
 if 'activeSourceStepId' in s:uuid_text(s['activeSourceStepId'])
 require(s['state'] in C['snapshotStates'] and s['errorCode'] in C['snapshotCodes'] and s['bootstrapPhase'] in C['bootstrapPhases'],'SNAPSHOT_NOT_SOURCE_ENUM')
 for key in ['publicationSnapshotPresent','publicationRevisionPresent','materializationPresent']:require(type(s[key]) is bool,'SNAPSHOT_BOOLEAN')
 numeric={'counters':{'actions','observations','modelProposals','modelInputTokens','modelOutputTokens','sanitizedEvidenceBytes'},'coordinate':{'stepIndex','translationOrdinal','generation','contextRevision'},'observationCounts':{'passwordControls','withheldRegions'},'acquisition':{'allowanceMs','totalExtraPolls'},'activeAcquisition':{'ordinal','elapsedMs','extraPolls'},'fixtureModelKinds':{'SOURCE_PLAN','NEXT_ACTION','VERIFY_STEP'},'translationCounters':{'planRevision'}}
 for name,allowed in numeric.items():
  if name in s:numbers(s[name],allowed)
 for name in ['fixtureModelHttpCalls','fixturePhysicalProviderReads','fixtureProviderFailures']:integer(s[name],2147483647,-2147483648)
 if 'continuation' in s:require(s['continuation'] in {'SOURCE_PLAN','MATERIALIZE','DEPENDENCIES','NEXT','REFRESH','AWAITING_CLARIFICATION','FINALIZING','STOPPED','OTHER'},'SNAPSHOT_CONTINUATION')
 array_shapes={
  'actions':({'operationKind','state','outcomeCode'},{'stepId','admissionId','ordinal','dispatchCount','ownerFence','generation'}),
  'obligationAdmissions':({'admitted','operationKind'},{'planrevision','occurrence','ordinal'}),
  'modelAttempts':({'kind','status','providerCode','responseStatus','responseOperationKind'},{'responseSchemaVersion','attemptnumber','inputtokens','outputtokens'}),
  'declarations':({'kind'},{'stepId'}),'obligations':({'operationKind'},{'stepId','occurrence','referenceIndex'})}
 for name,(required,optional) in array_shapes.items():
  if name not in s:continue
  require(type(s[name]) is list and len(s[name])<=4096,'SNAPSHOT_ARRAY_BOUND')
  for row in s[name]:
   keys(row,required,optional)
   for key,value in row.items():
    if key in {'stepId','admissionId'}:uuid_text(value)
    elif key=='admitted':require(type(value) is bool,'SNAPSHOT_ADMISSION_FLAG')
    elif key=='operationKind' or key=='responseOperationKind':require(value in OPERATIONS,'SNAPSHOT_OPERATION')
    elif key=='outcomeCode':require(value in C['snapshotCodes'],'SNAPSHOT_OUTCOME')
    elif key=='kind':require(value in ({'destination','nonsecretText','secretRef','OTHER'} if name=='declarations' else {'SOURCE_PLAN','NEXT_ACTION','VERIFY_STEP','OTHER'}),'SNAPSHOT_KIND')
    elif key=='state':require(value in {'ADMITTED','DISPATCHING','SUCCEEDED','FAILED','UNKNOWN_OUTCOME','REVOKED','OTHER'},'SNAPSHOT_ACTION_STATE')
    elif key=='status':require(value in {'RESERVED','CALLING','APPLIED','REJECTED','SUPERSEDED','UNKNOWN_CALL','OTHER'},'SNAPSHOT_ATTEMPT_STATUS')
    elif key=='providerCode':require(value in {'OK','INVALID_RESPONSE','TOO_LARGE','BUSY','TIMEOUT','TRANSPORT','DISABLED','OTHER'},'SNAPSHOT_PROVIDER_CODE')
    elif key=='responseStatus':require(value in {'ACTION','CLARIFICATION','COMPLETE','UNSUPPORTED','OTHER'},'SNAPSHOT_RESPONSE_STATUS')
    else:integer(value,99 if key=='responseSchemaVersion' else 9223372036854775807)
 return s

def parse_public_xml(raw):
 require(len(raw)<=2097152,'PUBLIC_XML_SIZE')
 try:tree=ET.fromstring(raw)
 except Exception:raise Refused('PUBLIC_XML_MALFORMED') from None
 cases=[c for c in tree.iter('testcase') if c.attrib.get('classname')==FQCN and c.attrib.get('name')==C['method']+'()']
 require(len(cases)==1 and int(tree.attrib['tests'])==46 and int(tree.attrib['failures'])==1 and int(tree.attrib['errors'])==0,'CLOSED_DEFAULT_CASE_BINDING')
 errors=cases[0].findall('failure')+cases[0].findall('error');require(len(errors)==1,'SOURCE_GUARD_FAILURE_MISSING')
 e=errors[0];require(e.attrib.get('type')=='org.opentest4j.AssertionFailedError','SOURCE_GUARD_TYPE')
 text=(e.attrib.get('message','')+'\n'+(e.text or ''))
 paths=set(re.findall(r'\[second explicit learning; logs ([^\]\r\n]+)\]',text))
 require(len(paths)==1,'TEMP_SOURCE_REFERENCE_UNPROVEN')
 temp=next(iter(paths));p=PurePosixPath(temp)
 require(p.is_absolute() and '..' not in p.parts and '\x00' not in temp and len(temp)<=4096 and re.fullmatch(r'obs007-joined-[A-Za-z0-9_-]{1,80}',p.name),'TEMP_SOURCE_PATH_REJECTED')
 line_matches=[]
 for block in tree.findall('system-out'):
  for line in (block.text or '').splitlines():
   if digest(line.encode())==C['publicFacts']['warningLineSha256']:line_matches.append(line)
 require(len(line_matches)==1,'EXACT_PUBLIC_WARNING_MISSING_OR_DUPLICATE')
 warning=decode(line_matches[0].encode(),1048576)
 require(warning.get('logger')=='com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient','WARNING_LOGGER')
 match=re.fullmatch(r'Guided runner refused the context for session ([a-f0-9-]+) \(contextHash [a-f0-9]{64}\): CONTEXT_LOST',warning.get('message',''))
 require(match is not None,'WARNING_NOT_SOURCE_FORMAT');sid=uuid_text(match[1])
 timestamp=datetime.datetime.fromisoformat(warning['timestamp'].replace('Z','+00:00')).astimezone(datetime.timezone.utc).isoformat()
 require(timestamp==C['publicFacts']['warningTimestampUtc'],'WARNING_TIME_BINDING')
 return temp,sid

def instant_ns(text):
 require(type(text) is str,'OWNED_START_TIME_SHAPE')
 match=re.fullmatch(r'(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)',text)
 require(match is not None,'OWNED_START_TIME_SHAPE')
 try:seconds=int(datetime.datetime.fromisoformat(match[1]+('+00:00' if match[3]=='Z' else match[3])).timestamp())
 except Exception:raise Refused('OWNED_START_TIME_SHAPE') from None
 return seconds*1000000000+int((match[2] or '').ljust(9,'0'))

def owned_producer(raw,generation,log_path,root_reference,wrapper_sha,config_sha):
 require(len(raw)<=8388608,'OWNED_METADATA_SIZE');lines=raw.splitlines();require(len(lines)<=16384,'OWNED_EVENT_BOUND')
 selected=[];guided_spawns=[]
 required={'event','role','generation','pid','alive','wrapperSha256','commandSha256','started','configSha256','poolSize','readinessNonceHash','readyPort','ownedTemp'}
 allowed_events={'SPAWN','DESCENDANT_RECORDED','READY','GRACEFUL_SIGNAL','DESCENDANT_FORCE_SIGNAL','ROOT_FORCE_SIGNAL','EXIT_CONFIRMED'}
 for line in lines:
  row=decode(line,1048576);keys(row,required,{'descendant'})
  require(row['event'] in allowed_events and type(row['role']) is str and len(row['role'])<=80 and type(row['alive']) is bool,'OWNED_SOURCE_SHAPE')
  integer(row['generation'],9223372036854775807);integer(row['pid'],9223372036854775807,1)
  if row['role']=='guided' and row['event']=='SPAWN':guided_spawns.append(row)
  if row['role']=='guided' and row['generation']==generation:selected.append(row)
 require(selected,'GUIDED_GENERATION_UNPROVEN')
 require(all(row['ownedTemp']==root_reference for row in guided_spawns),'MIXED03_GUIDED_ROOT')
 require(len({row['generation'] for row in guided_spawns})==len(guided_spawns),'DUPLICATE_GUIDED_GENERATION')
 ordered=sorted(guided_spawns,key=lambda row:row['generation'])
 starts=[instant_ns(row['started']) for row in ordered]
 require(all(a<b for a,b in zip(starts,starts[1:])),'GUIDED_GENERATION_TIME_AMBIGUOUS')
 warning=instant_ns(C['publicFacts']['warningTimestampUtc'])
 intervals=[row['generation'] for i,row in enumerate(ordered) if starts[i]<=warning and (i+1==len(starts) or warning<starts[i+1])]
 require(intervals==[generation],'GUIDED_GENERATION_AT_WARNING_UNPROVEN')
 spawn=[r for r in selected if r['event']=='SPAWN'];ready=[r for r in selected if r['event']=='READY'];exited=[r for r in selected if r['event']=='EXIT_CONFIRMED']
 require(len(spawn)==len(ready)==len(exited)==1,'GUIDED_PRODUCER_NOT_UNIQUE_OR_CLOSED')
 require(selected.index(spawn[0])<selected.index(ready[0])<selected.index(exited[0]),'GUIDED_PRODUCER_EVENT_ORDER')
 first=spawn[0]
 require(type(first['pid']) is int and first['started']!='UNAVAILABLE' and SHA.fullmatch(first['commandSha256'] or ''),'GUIDED_OWNER_IDENTITY_UNPROVEN')
 for row in selected:
  require(row['ownedTemp']==root_reference and row['pid']==first['pid'] and row['started']==first['started'] and row['commandSha256']==first['commandSha256'] and row['wrapperSha256']==wrapper_sha and row['configSha256']==config_sha,'MIXED_GUIDED_PRODUCER')
 require(exited[0]['alive'] is False,'GUIDED_EXIT_UNCONFIRMED')
 if log_path=='guided.log':
  all_guided=[decode(line,1048576) for line in lines if line]
  maximum=max(r['generation'] for r in all_guided if r['role']=='guided')
  require(generation==maximum,'CURRENT_LOG_WRONG_GENERATION')
 else:require(log_path==f'owned-generations/generation-{generation}/guided.log','ARCHIVE_NOT_SOURCE_LOCATOR')

CODE_SHAPE=re.compile(r'[A-Z][A-Z0-9_]{2,47}')
NAME_SHAPE=re.compile(r'[A-Za-z][A-Za-z0-9]{0,39}')
def parse_start_candidate(raw,sid):
 require(len(raw)<=16777216,'WORKER_LOG_SIZE')
 prefix=digest(json.dumps(sid,ensure_ascii=False,separators=(',',':')).encode())[:16]
 matches=[];records=0
 for number,line in enumerate(io.BytesIO(raw),1):
  line=line.rstrip(b'\r\n')
  if not line.startswith(b'GUIDED_START_FAILED '):continue
  records+=1;require(records<=4096,'START_RECORD_COUNT_BOUND');require(len(line)<=8192,'START_RECORD_LINE_BOUND')
  event=decode(line[len(b'GUIDED_START_FAILED '):],8192);keys(event,{'operation','session','elapsedMs','links'})
  require(event['operation'] in {'assign','context'} and type(event['session']) is str and re.fullmatch(r'[a-f0-9]{16}',event['session']),'START_SOURCE_IDENTITY_SHAPE')
  integer(event['elapsedMs']);require(type(event['links']) is list and 1<=len(event['links'])<=6,'START_LINK_BOUND')
  if event['session']!=prefix:continue
  matches.append((number,event))
 require(len(matches)==1,'START_RECORD_MISSING_OR_AMBIGUOUS')
 number,event=matches[0];projected=[]
 for i,link in enumerate(event['links']):
  keys(link,{'name'},{'code','errno','phase','loss','kind','exitCode','signal'})
  require(type(link['name']) is str and NAME_SHAPE.fullmatch(link['name']),'START_NAME_SHAPE')
  out={'name':link['name'] if link['name'] in C['errorNames'] else 'REDACTED_UNKNOWN'}
  for key in ['code','phase','loss']:
   if key in link:require(type(link[key]) is str and CODE_SHAPE.fullmatch(link[key]),'START_CLOSED_FIELD_SHAPE')
  if 'code' in link:out['code']=link['code'] if link['code'] in C['codes'] else 'REDACTED_UNKNOWN'
  if link['name'] in {'GuidedStartFailure','GuidedLaunchFailure'}:require('phase' in link,'MISSING_RUNTIME_PHASE')
  if 'phase' in link:
   permitted=C['runtimePhases'] if link['name']=='GuidedStartFailure' else C['launchPhases'] if link['name']=='GuidedLaunchFailure' else []
   require(link['phase'] in permitted,'MISSING_OR_UNBOUND_START_PHASE');out['phase']=link['phase']
  if 'loss' in link:
   require(link['name']=='GuidedStartFailure' and link['loss'] in C['lossReasons'],'UNBOUND_LOSS');out['loss']=link['loss']
  if 'errno' in link:
   require(type(link['errno']) is str and re.fullmatch(r'E[A-Z0-9]{2,31}',link['errno']),'ERRNO_SHAPE')
   out['errno']='REDACTED_UNKNOWN' # Source declares regex only, not a semantic errno allowlist.
  if 'kind' in link:require(link['kind'] in {'TARGET_CLOSED','TIMEOUT'},'START_KIND');out['kind']=link['kind']
  require(('exitCode' in link)==('signal' in link),'PARTIAL_EXIT_RECORD')
  if 'exitCode' in link:
   if link['exitCode'] is not None:integer(link['exitCode'],999,-999)
   require(link['signal'] is None or type(link['signal']) is str and re.fullmatch(r'SIG[A-Z0-9]{2,10}',link['signal']),'SIGNAL_SHAPE')
   out['exitCode']=link['exitCode'];out['signal']='NONE' if link['signal'] is None else 'REDACTED_UNKNOWN'
  projected.append(out)
 first=event['links'][0]
 require(event['operation']=='context' and first['name']=='GuidedStartFailure' and first.get('code')=='CONTEXT_LOST' and first.get('phase') in C['runtimePhases'],'MISSING_RUNTIME_PHASE')
 launch_phase=next((link['phase'] for link in event['links'] if link['name']=='GuidedLaunchFailure' and 'phase' in link),'UNPROVEN_NOT_RECORDED')
 return dict(operation=event['operation'],elapsedMs=event['elapsedMs'],runtimePhase=first['phase'],launchPhase=launch_phase,loss=first.get('loss','UNPROVEN_NOT_RECORDED'),producerAssociation='SOURCE_OWNED_GUIDED_GENERATION_INTERVAL_AT_PUBLIC_WARNING',links=projected,workerLineOrdinal=number,
  association='CANONICAL_PREFIX_MATCH_ONLY_UNPROVEN_EXACT_SESSION',timestamp='UNPROVEN_NOT_RECORDED',causeCompleteness='UNPROVEN_NOT_RECORDED',sourceLinkCapReached=len(projected)==6)

# These immutable role paths are the only private inputs this one-off parser can open.
def validate_manifest(raw,permit):
 require(digest(raw)==permit['scope']['privateManifestSha256'],'PRIVATE_MANIFEST_CHANGED')
 m=decode(raw,65536);keys(m,{'schemaVersion','executionLabel','root','generation','wrapperSha256','configSha256','files'})
 require(type(m['schemaVersion']) is int and m['schemaVersion']==1 and m['executionLabel']==C['executionLabel'],'PRIVATE_MANIFEST_SCOPE')
 keys(m['root'],{'path','dev','ino','uid','mode'})
 for key in ['dev','ino','uid','mode']:integer(m['root'][key],9223372036854775807)
 require(type(m['root']['path']) is str and m['root']['mode']==448,'PRIVATE_ROOT_MODE')
 integer(m['generation'],16384,1);require(SHA.fullmatch(m['wrapperSha256']) and SHA.fullmatch(m['configSha256']),'PRODUCER_ARTIFACT_BINDING')
 require(type(m['files']) is list and len(m['files'])==4 and {r['role'] for r in m['files']}==ROLES,'PRIVATE_MANIFEST_ALLOWLIST')
 snapshot_name=f"failed-test-state-test-12-{C['method']}-singleton-18-initial.json"
 for row in m['files']:
  keys(row,{'role','path','sha256','bytes','mode','dev','ino','uid'})
  require(SHA.fullmatch(row['sha256']) and row['mode'] in {384,416,420},'PRIVATE_INPUT_HASH_MODE')
  integer(row['bytes'],33554432)
  for key in ['dev','ino','uid','mode']:integer(row[key],9223372036854775807)
  role=row['role'];path=row['path']
  if role=='default_xml':require(path==f"docs/qa/evidence/STUDIO-OBS-011/execution/{C['executionLabel']}-task-outputs/test/xml/TEST-{FQCN}.xml" and row['sha256']==C['publicFacts']['xmlSha256'],'CLOSED_XML_LOCATOR')
  elif role=='snapshot_initial18':require(path==snapshot_name,'SNAPSHOT_SOURCE_LOCATOR')
  elif role=='owned_events':require(path=='owned-worker-generations.jsonl','OWNED_METADATA_LOCATOR')
  else:require(path in {'guided.log',f"owned-generations/generation-{m['generation']}/guided.log"},'GUIDED_LOG_SOURCE_LOCATOR')
 return m

def project_bundle(permit,manifest_raw,inputs):
 m=validate_manifest(manifest_raw,permit);require(set(inputs)==ROLES,'INPUT_ROLE_SET')
 bindings=[]
 for row in m['files']:
  raw=inputs[row['role']];require(len(raw)==row['bytes'] and digest(raw)==row['sha256'],'WHOLE_INPUT_BINDING')
  bindings.append({'role':row['role'],'sha256':row['sha256'],'bytes':row['bytes'],'mode':oct(row['mode'])})
 root_ref,warning_sid=parse_public_xml(inputs['default_xml']);require(root_ref==m['root']['path'],'WRONG03_TEMP_REFERENCE')
 state=snapshot(inputs['snapshot_initial18']);require(state['sessionId']==warning_sid,'WARNING_ORDINAL18_IDENTITY_UNPROVEN')
 log_row=next(r for r in m['files'] if r['role']=='guided_log')
 owned_producer(inputs['owned_events'],m['generation'],log_row['path'],root_ref,m['wrapperSha256'],m['configSha256'])
 candidate=parse_start_candidate(inputs['guided_log'],warning_sid)
 output=dict(schemaVersion=1,status='BOUNDED_EXISTING_EVIDENCE_ONLY_CAUSE_UNPROVEN',caseAlias='ORDER11_INVOCATION12_SCOPE4_SESSION18',
  warningOrdinalJoin='EXACT_WARNING_TO_POST_CLEANUP_SOURCE_SNAPSHOT',warningTimestampUtc=C['publicFacts']['warningTimestampUtc'],
  snapshot={'phase':'AFTER_INNER_CLEANUP_NOT_ASSERTION_ENTRY','state':state['state'],'errorCode':state['errorCode'],'bootstrapPhase':state['bootstrapPhase'],'materializationPresent':state['materializationPresent']},
  diagnosticCandidate=candidate,firstStoppingWriter='UNPROVEN_NO_TIMESTAMPED_SOURCE_TRACE',stateChronology='UNPROVEN_NO_TIMESTAMPED_SOURCE_TRACE',assignmentChronology='UNPROVEN_NO_SOURCE_SNAPSHOT_FIELD',contextDeliveryChronology='UNPROVEN_NO_SOURCE_SNAPSHOT_FIELD',cause='UNPROVEN',
  rawCollectorExit=permit['rawCollectorExit'],rawGradleExit=permit['rawGradleExit'],rawTaskCollectionComplete=permit['rawTaskCollectionComplete'],rawReceiptSha256=permit['rawReceiptSha256'],rawOutcomeDisposition='WHOLE_RAW_RECEIPT_RETAINED_WITHOUT_WAIVER',observationGapSticky=True,inputBindings=bindings,
  privateRawExported=False,nativeOrLaneCredit=False)
 validate_output(output);require(len(canonical(output))<=16384,'OUTPUT_SIZE_BOUND');return output

def validate_output(out):
 keys(out,{'schemaVersion','status','caseAlias','warningOrdinalJoin','warningTimestampUtc','snapshot','diagnosticCandidate','firstStoppingWriter','stateChronology','assignmentChronology','contextDeliveryChronology','cause','rawCollectorExit','rawGradleExit','rawTaskCollectionComplete','rawReceiptSha256','rawOutcomeDisposition','observationGapSticky','inputBindings','privateRawExported','nativeOrLaneCredit'})
 require(type(out['schemaVersion']) is int and out['schemaVersion']==1 and out['status']=='BOUNDED_EXISTING_EVIDENCE_ONLY_CAUSE_UNPROVEN' and out['caseAlias']=='ORDER11_INVOCATION12_SCOPE4_SESSION18','OUTPUT_CLOSED_SCOPE')
 require(out['cause']=='UNPROVEN' and out['privateRawExported'] is False and out['nativeOrLaneCredit'] is False and out['observationGapSticky'] is True,'OUTPUT_NO_CREDIT')
 require(out['warningOrdinalJoin']=='EXACT_WARNING_TO_POST_CLEANUP_SOURCE_SNAPSHOT' and out['warningTimestampUtc']==C['publicFacts']['warningTimestampUtc'],'OUTPUT_WARNING_SCOPE')
 for key in ['firstStoppingWriter','stateChronology']:require(out[key]=='UNPROVEN_NO_TIMESTAMPED_SOURCE_TRACE','OUTPUT_CAUSE_PROMOTION')
 for key in ['assignmentChronology','contextDeliveryChronology']:require(out[key]=='UNPROVEN_NO_SOURCE_SNAPSHOT_FIELD','OUTPUT_UNRECORDED_FIELD')
 for key in ['rawCollectorExit','rawGradleExit']:integer(out[key],255,-255);require(out[key]!=0,'OUTPUT_RAW_FAIL')
 require(type(out['rawTaskCollectionComplete']) is bool,'OUTPUT_RAW_COLLECTION')
 require(type(out['rawReceiptSha256']) is str and SHA.fullmatch(out['rawReceiptSha256']) and out['rawOutcomeDisposition']=='WHOLE_RAW_RECEIPT_RETAINED_WITHOUT_WAIVER','OUTPUT_RAW_RECEIPT_BINDING')
 snap=out['snapshot'];keys(snap,{'phase','state','errorCode','bootstrapPhase','materializationPresent'})
 require(snap['phase']=='AFTER_INNER_CLEANUP_NOT_ASSERTION_ENTRY' and snap['state'] in C['snapshotStates'] and snap['errorCode'] in C['snapshotCodes'] and snap['bootstrapPhase'] in C['bootstrapPhases'] and type(snap['materializationPresent']) is bool,'OUTPUT_SNAPSHOT')
 candidate=out['diagnosticCandidate'];keys(candidate,{'operation','elapsedMs','runtimePhase','launchPhase','loss','producerAssociation','links','workerLineOrdinal','association','timestamp','causeCompleteness','sourceLinkCapReached'})
 require(candidate['operation']=='context' and candidate['association']=='CANONICAL_PREFIX_MATCH_ONLY_UNPROVEN_EXACT_SESSION' and candidate['timestamp']==candidate['causeCompleteness']=='UNPROVEN_NOT_RECORDED','OUTPUT_CANDIDATE_STRENGTH')
 integer(candidate['elapsedMs']);integer(candidate['workerLineOrdinal'],16777216,1)
 require(candidate['runtimePhase'] in C['runtimePhases'] and candidate['launchPhase'] in C['launchPhases']+['UNPROVEN_NOT_RECORDED'] and candidate['loss'] in C['lossReasons']+['UNPROVEN_NOT_RECORDED'] and candidate['producerAssociation']=='SOURCE_OWNED_GUIDED_GENERATION_INTERVAL_AT_PUBLIC_WARNING','OUTPUT_PHASE_SUMMARY')
 require(type(candidate['links']) is list and 1<=len(candidate['links'])<=6 and candidate['sourceLinkCapReached'] is (len(candidate['links'])==6),'OUTPUT_LINK_BOUND')
 for link in candidate['links']:
  keys(link,{'name'},{'code','phase','loss','errno','kind','exitCode','signal'})
  require(link['name'] in set(C['errorNames'])|{'REDACTED_UNKNOWN'},'OUTPUT_ERROR_NAME')
  if 'code' in link:require(link['code'] in set(C['codes'])|{'REDACTED_UNKNOWN'},'OUTPUT_CODE')
  if 'phase' in link:require(link['phase'] in (C['runtimePhases'] if link['name']=='GuidedStartFailure' else C['launchPhases'] if link['name']=='GuidedLaunchFailure' else []),'OUTPUT_PHASE_OWNER')
  if 'loss' in link:require(link['name']=='GuidedStartFailure' and link['loss'] in C['lossReasons'],'OUTPUT_LOSS')
  if 'errno' in link:require(link['errno']=='REDACTED_UNKNOWN','OUTPUT_ERRNO')
  if 'kind' in link:require(link['kind'] in {'TARGET_CLOSED','TIMEOUT'},'OUTPUT_KIND')
  require(('exitCode' in link)==('signal' in link),'OUTPUT_EXIT_PAIR')
  if 'exitCode' in link:
   if link['exitCode'] is not None:integer(link['exitCode'],999,-999)
   require(link['signal'] in {'NONE','REDACTED_UNKNOWN'},'OUTPUT_SIGNAL')
 require(candidate['links'][0]['name']=='GuidedStartFailure' and candidate['links'][0].get('code')=='CONTEXT_LOST' and candidate['links'][0].get('phase') in C['runtimePhases'],'OUTPUT_RUNTIME_START_UNPROVEN')
 require(type(out['inputBindings']) is list and len(out['inputBindings'])==4 and {r['role'] for r in out['inputBindings']}==ROLES,'OUTPUT_BINDING_ROLES')
 for row in out['inputBindings']:
  keys(row,{'role','sha256','bytes','mode'});require(type(row['sha256']) is str and SHA.fullmatch(row['sha256']) and row['mode'] in {'0o600','0o640','0o644'},'OUTPUT_BINDING_FIELDS');integer(row['bytes'],33554432)
 # Output strings can only originate in fixed enums/aliases/public time or whole approved artifact hashes.
 allowed=set(C['snapshotStates']+C['snapshotCodes']+C['bootstrapPhases']+C['runtimePhases']+C['launchPhases']+C['lossReasons']+C['errorNames']+C['codes'])|ROLES|{'WHOLE_RAW_RECEIPT_RETAINED_WITHOUT_WAIVER','REDACTED_UNKNOWN','NONE','TARGET_CLOSED','TIMEOUT','context','UNPROVEN','BOUNDED_EXISTING_EVIDENCE_ONLY_CAUSE_UNPROVEN','ORDER11_INVOCATION12_SCOPE4_SESSION18','EXACT_WARNING_TO_POST_CLEANUP_SOURCE_SNAPSHOT','AFTER_INNER_CLEANUP_NOT_ASSERTION_ENTRY','CANONICAL_PREFIX_MATCH_ONLY_UNPROVEN_EXACT_SESSION','SOURCE_OWNED_GUIDED_GENERATION_INTERVAL_AT_PUBLIC_WARNING','UNPROVEN_NOT_RECORDED','UNPROVEN_NO_TIMESTAMPED_SOURCE_TRACE','UNPROVEN_NO_SOURCE_SNAPSHOT_FIELD',C['publicFacts']['warningTimestampUtc'],'0o600','0o640','0o644'}
 def check(node,path=()):
  if isinstance(node,dict):
   for k,v in node.items():check(v,path+(k,))
  elif isinstance(node,list):
   for v in node:check(v,path)
  elif type(node) is str:require(node in allowed or path and path[-1] in {'sha256','rawReceiptSha256'} and SHA.fullmatch(node),'UNAPPROVED_OUTPUT_SCALAR')
  elif node is not None:require(type(node) in {int,bool},'OUTPUT_TYPE')
 check(out)

class ExactIO:
 """No glob/listdir/walk/search method. Private operations require already-verified permit."""
 PUBLIC_FILES={'authorization':'root-authorization.json','root_approval':'root-approval.json','quinn_approval':'quinn-approval.json','terminal':'terminal-proof.json','assessment':'public-assessment.json'}
 def read_public(self,alias):
  if alias in self.PUBLIC_FILES:
   release=HERE/'release';rst=os.lstat(release)
   require(stat.S_ISDIR(rst.st_mode) and not stat.S_ISLNK(rst.st_mode) and rst.st_uid==os.getuid() and stat.S_IMODE(rst.st_mode)==448,'RELEASE_DIRECTORY_NOT_PRIVATE')
   path=release/self.PUBLIC_FILES[alias]
   fst=os.lstat(path);require(stat.S_ISREG(fst.st_mode) and fst.st_uid==os.getuid() and stat.S_IMODE(fst.st_mode)==384,'RELEASE_FILE_NOT_PRIVATE')
  else:
   suffix={'receipt':'results','before':'before','after':'after'}[alias];path=ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution'/f"{C['executionLabel']}-{suffix}.json"
  return self._regular(path,33554432)
 def _regular(self,path,cap):
  fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW)
  try:
   before=os.fstat(fd);require(stat.S_ISREG(before.st_mode) and before.st_size<=cap,'UNSAFE_APPROVED_FILE')
   data=b''
   while len(data)<=cap:
    chunk=os.read(fd,min(65536,cap+1-len(data)))
    if not chunk:break
    data+=chunk
   require(len(data)<=cap and stable_stat(os.fstat(fd))==stable_stat(before),'APPROVED_FILE_CHANGED');return data
  finally:os.close(fd)
 def claim_output(self,permit):
  require(permit.get('scope',{}).get('purpose')==C['purpose'],'NO_OUTPUT_PERMISSION')
  os.mkdir(HERE/'released-projection-01',0o700) # O_EXCL directory creation; failure forbids private reads/retry.
 def read_manifest(self,permit):
  require(permit.get('scope',{}).get('purpose')==C['purpose'],'NO_PRIVATE_PERMISSION')
  path=HERE/'release/private-input-manifest.json';st=os.lstat(path)
  require(stat.S_ISREG(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==384,'PRIVATE_MANIFEST_MODE')
  return self._regular(path,65536)
 def read_default_xml(self,permit,row):
  require(permit.get('scope',{}).get('purpose')==C['purpose'] and row['role']=='default_xml','NO_XML_PERMISSION')
  path=ROOT/row['path'];st=os.lstat(path)
  require(stat.S_ISREG(st.st_mode) and (st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode),st.st_size)==(row['dev'],row['ino'],row['uid'],row['mode'],row['bytes']),'XML_FILE_BINDING')
  raw=self._regular(path,2097152);require(digest(raw)==row['sha256'],'XML_BYTES_CHANGED');return raw
 def read_inputs(self,permit,m,xml_raw):
  require(permit.get('scope',{}).get('purpose')==C['purpose'],'NO_PRIVATE_PERMISSION')
  # Exact source-derived root, never an enumerated or guessed inherited fixture.
  root=Path(m['root']['path']);resolved=root.resolve(strict=True)
  require(resolved.is_absolute() and resolved.name.startswith('obs007-joined-'),'PRIVATE_ROOT_LOCATOR')
  root_fd=os.open(resolved,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  try:
   st=os.fstat(root_fd);r=m['root'];require((st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode))==(r['dev'],r['ino'],r['uid'],r['mode']) and st.st_uid==os.getuid(),'PRIVATE_ROOT_IDENTITY_OR_MODE')
   data={}
   for row in m['files']:
    role=row['role']
    if role=='default_xml':raw=xml_raw
    else:
     parts=PurePosixPath(row['path']).parts;require(parts and '..' not in parts and not PurePosixPath(row['path']).is_absolute(),'PRIVATE_PATH_ESCAPE')
     parent=os.dup(root_fd)
     try:
      for part in parts[:-1]:
       child=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);os.close(parent);parent=child
      fd=os.open(parts[-1],os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent)
      try:
       st=os.fstat(fd);require(stat.S_ISREG(st.st_mode) and (st.st_dev,st.st_ino,st.st_uid,stat.S_IMODE(st.st_mode),st.st_size)==(row['dev'],row['ino'],row['uid'],row['mode'],row['bytes']) and st.st_uid==os.getuid(),'PRIVATE_FILE_IDENTITY_MODE')
       caps={'snapshot_initial18':1048576,'guided_log':16777216,'owned_events':8388608};cap=caps[role];require(st.st_size<=cap,'PRIVATE_ROLE_SIZE')
       raw=b''
       while len(raw)<=cap:
        chunk=os.read(fd,min(65536,cap+1-len(raw)))
        if not chunk:break
        raw+=chunk
       require(len(raw)<=cap and stable_stat(os.fstat(fd))==stable_stat(st),'PRIVATE_FILE_CHANGED')
      finally:os.close(fd)
     finally:os.close(parent)
    require(len(raw)==row['bytes'] and digest(raw)==row['sha256'],'PRIVATE_INPUT_CHANGED');data[role]=raw
   return data
  finally:os.close(root_fd)

def run(io,expected,local,now=None):
 # First fixed authorization refusal occurs before private manifest/root/stat/open.
 auth=io.read_public('authorization');a=decode(auth,65536)
 require(digest(auth)==expected.get('authorization'),'APPROVAL_HASH_MISMATCH')
 require(a.get('released') is True,'NO_EXECUTION_RELEASE')
 public={'authorization':auth}
 for alias in ['root_approval','quinn_approval','terminal','assessment']:public[alias]=io.read_public(alias)
 preauthorize(public,expected,local,now) # Includes scope-bound independent approval + whole terminal/public proof.
 for alias in ['receipt','before','after']:public[alias]=io.read_public(alias)
 permit=authorize(public,expected,local,now)
 io.claim_output(permit) # One actual release is consumed before any private manifest/native root read.
 manifest_raw=io.read_manifest(permit);m=validate_manifest(manifest_raw,permit)
 # Derive the actual03 TEMP from hash-bound source-guard XML BEFORE touching any native private root.
 xml_row=next(row for row in m['files'] if row['role']=='default_xml')
 xml_raw=io.read_default_xml(permit,xml_row)
 root_reference,_sid=parse_public_xml(xml_raw)
 require(root_reference==m['root']['path'],'WRONG03_TEMP_REFERENCE')
 inputs=io.read_inputs(permit,m,xml_raw);return project_bundle(permit,manifest_raw,inputs)

def local_bindings():
 # Verify the approved manifest contents, not only the manifest file's own digest.
 reader=ExactIO();manifest_raw=reader._regular(HERE/'manifest.json',1048576)
 manifest=decode(manifest_raw,1048576);keys(manifest,{'schemaVersion','files'})
 require(type(manifest['schemaVersion']) is int and manifest['schemaVersion']==1 and type(manifest['files']) is dict and 1<=len(manifest['files'])<=64,'PACKAGE_MANIFEST_SHAPE')
 require({'project_existing.py','source-contract.json','source-bindings.json','DESIGN.md','PROTOCOL.md'}<=set(manifest['files']),'PACKAGE_REQUIRED_FILES')
 for name,h in manifest['files'].items():
  path=PurePosixPath(name)
  require(not path.is_absolute() and '..' not in path.parts and len(path.parts)<=2 and path.parts[0] not in {'release','released-projection-01'} and type(h) is str and SHA.fullmatch(h),'PACKAGE_FILE_LOCATOR')
  require(digest(reader._regular(HERE/name,33554432))==h,'PACKAGE_ARTIFACT_CHANGED')
 raw=reader._regular(HERE/'source-bindings.json',1048576);bindings=decode(raw,1048576)
 require(type(bindings) is dict and set(bindings)==SOURCE_PATHS,'SOURCE_BINDING_SET')
 for path,h in bindings.items():
  locator=PurePosixPath(path)
  require(not locator.is_absolute() and '..' not in locator.parts and type(h) is str and SHA.fullmatch(h),'SOURCE_BINDING_LOCATOR')
  require(digest(reader._regular(ROOT/path,33554432))==h,'SOURCE_BINDING_CHANGED')
 return {'parserSha256':digest(reader._regular(Path(__file__),1048576)),'packageManifestSha256':digest(manifest_raw),'sourceBindingsSha256':digest(raw)}
def main():
 p=ClosedArgumentParser(description=__doc__)
 for role in ['authorization','root-approval','quinn-approval']:p.add_argument('--expected-'+role+'-sha',required=True)
 args=p.parse_args();expected={k.replace('-','_'):getattr(args,'expected_'+k.replace('-','_')+'_sha') for k in ['authorization','root-approval','quinn-approval']}
 output=run(ExactIO(),expected,local_bindings());folder=HERE/'released-projection-01'
 fd=os.open(folder/'projection.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  payload=canonical(output)+b'\n';offset=0
  while offset<len(payload):
   written=os.write(fd,payload[offset:]);require(written>0,'OUTPUT_WRITE_FAILURE');offset+=written
  os.fsync(fd)
 finally:os.close(fd)
 print(json.dumps({'status':output['status'],'cause':'UNPROVEN','privateRawExported':False,'nativeOrLaneCredit':False}))
if __name__=='__main__':
 try:main()
 except Refused as error:print(json.dumps({'status':'UNPROVEN_PROJECTION_REFUSED','reason':str(error),'privateRawExported':False,'nativeOrLaneCredit':False}));sys.exit(2)
 except BaseException:print(json.dumps({'status':'UNPROVEN_PROJECTION_REFUSED','reason':'MISSING_CHANGED_OR_UNSUPPORTED_INPUT','privateRawExported':False,'nativeOrLaneCredit':False}));sys.exit(2)

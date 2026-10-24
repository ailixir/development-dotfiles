"""Independent public-only same-execution assessment. No build/test/author entrypoint calls."""
from pathlib import Path
import collections
import datetime as dt
import hashlib
import html
import io
import json
import os
import re
import stat
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile

ROOT=Path.cwd()
T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
EX=ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution'
LABEL='obs011-t0-fresh-check03'
RUN=T0/'early/fullcheck-harness/resume3/runs'/LABEL
OUT=T0/'qa/fullcheck03-terminal-public'
os.umask(0o077)
assert stat.S_IMODE(OUT.stat().st_mode)==0o700
records=[];observed={};violations=[];checks=0
def sha(data):return hashlib.sha256(data).hexdigest()
def seconds(s):return dt.datetime.fromisoformat(s).timestamp()
def check(valid,reason):
    global checks
    checks+=1
    if not valid:violations.append(reason)
    return bool(valid)
def safe(path):
    path=Path(path)
    assert path.is_absolute()
    for part in [path,*path.parents]:
        if part==part.parent:break
        assert not part.is_symlink(),'SYMLINK_INPUT_REJECTED'
    assert stat.S_ISREG(path.lstat().st_mode),'NON_REGULAR_INPUT_REJECTED'
    return path
def stats(s):return (s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns,stat.S_IMODE(s.st_mode))
def read(path):
    path=safe(path);before=path.lstat()
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    with os.fdopen(fd,'rb') as f:
        assert stats(os.fstat(f.fileno()))==stats(before),'INPUT_CHANGED_BEFORE_READ'
        data=f.read();assert stats(os.fstat(f.fileno()))==stats(before),'INPUT_CHANGED_DURING_READ'
    assert stats(path.lstat())==stats(before),'INPUT_CHANGED_AFTER_READ'
    facts={'sha256':sha(data),'bytes':len(data),'mtimeNs':before.st_mtime_ns,'mode':f'{stat.S_IMODE(before.st_mode):04o}','device':before.st_dev,'inode':before.st_ino}
    prior=observed.get(str(path))
    assert prior is None or prior==facts,'INPUT_CHANGED_BETWEEN_READS'
    observed[str(path)]=facts
    return data,facts
def load(path):return json.loads(read(path)[0])
def bind(path,digest,alias):
    b,f=read(path);assert f['sha256']==digest,'IMMUTABLE_BINDING_MISMATCH:'+alias
    records.append({'alias':alias,'referencePath':str(path.relative_to(ROOT)),'fact':f,'classification':'IMMUTABLE_CONTROL_REFERENCE'})
    return b
def write(name,obj):
    data=(json.dumps(obj,indent=2,ensure_ascii=False)+'\n').encode()
    fd=os.open(OUT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as f:f.write(data)
def files(root):
    assert root.is_relative_to(ROOT)
    return sorted(p for p in root.rglob('*') if p.is_file() or p.is_symlink())

terminal=load(OUT/'terminal-precondition.json')
assert terminal['recordedIdentities']==2595 and terminal['counts']=={'PID_ABSENT':2595}
rootproof=bind(T0/'resume2-fullcheck03-root-terminal-proof.json','d8387a34113066c4e3bc2656bfe969df9b61779117fa48ac3e40bbc7d1a08def','ROOT_TERMINAL_PROOF')
h=json.loads(bind(RUN/'receipt.json','091d93b782a45406413d132e2e5d8fb921e4d21e22f3c7579773f8378afc4ff0','FINAL_HARNESS_RECEIPT'))
plan=json.loads(bind(T0/'early/fullcheck-harness/resume3/plan.json','576ebf9f01c0025cacc3bc6c7d6f4c747f8f84bb1f118a547cf11e21f7c94673','EXECUTED_PLAN'))
bind(T0/'early/fullcheck-harness/resume3/harness.py','a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae','EXECUTED_HARNESS')
bind(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/obs011-t0-fresh-check03-root-authorization.json','e115acd7def6263a125ae5bfc3fc8c7d7be1eb652b86677b90531da64ffc5b65','ROOT_AUTHORIZATION')
adoption=json.loads(bind(T0/'resume2-report-static-protocol-root-adoption.json','0a96a75830856906e4912cb50e0c8419c838003eab48390925723755fa5ad1f0','SAME_EXECUTION_PROTOCOL_ADOPTION'))
for key,alias in [('protocol','PROTOCOL'),('resourceCatalog','RESOURCE_CATALOG'),('independentQuinnReview','PROTOCOL_INDEPENDENT_REVIEW')]:
    entry=adoption[key];data=bind(ROOT/entry['path'],entry['sha256'],alias)
    if key=='resourceCatalog':resource_catalog=json.loads(data)
catalog=json.loads(bind(T0/'fullcheck03-case-catalog-candidate/resume2/expected-catalog.json','164e9d53985b7e1108d66952ae85d6293d83af907aa2d4c14ac94604e1d5b5b7','EXPECTED_CATALOG'))
bind(T0/'qa/fullcheck03-source-catalog/review.md','f8b43809a5243b69856a0c87fe721bd03a48826f0930de11cf4cbd6a0f001775','EXPECTED_CATALOG_INDEPENDENT_REVIEW')
catalog_adoption=load(T0/'resume2-fullcheck03-expected-catalog-root-adoption.json')
records.append({'alias':'CATALOG_ROOT_ADOPTION','referencePath':str((T0/'resume2-fullcheck03-expected-catalog-root-adoption.json').relative_to(ROOT)),'fact':observed[str(T0/'resume2-fullcheck03-expected-catalog-root-adoption.json')],'classification':'CONTROL_REFERENCE'})
collector=json.loads(bind(ROOT/h['primaryCollectorReceipt']['path'],h['primaryCollectorReceipt']['sha256'],'FINAL_COLLECTOR'))
start=seconds(collector['started']);end=seconds(h['collectorTerminatedAtUtc'])
fresh=lambda f:start<=f['mtimeNs']/1e9<=end+2
check(h['collectorInvocations']==1 and h['sourceWrites']==0,'COLLECTOR_MULTIPLICITY_OR_SOURCE_WRITE')
check(collector['explicitTestTasks']==['test','guidedIncrementalTest','crossReplicaTest'] and set(collector['requiredFreshExecTasks'])==set(collector['explicitTestTasks']) and len(collector['requiredFreshExecTasks'])==3,'TASK_SCOPE')
check(plan['commandGradle']==['--continue','check','--rerun-tasks','--no-daemon'],'FULL_NATIVE_COMMAND')
check(collector['command']==['caffeinate','-i','./gradlew',*plan['commandGradle']],'NATIVE_COMMAND_OPTIONS')

# Pin original public receipts/captures/log. Existing authoritative archives are referenced, not recopied.
controls={}
for suffix in ['-before.json','-after.json','-default-task-base-results.json','-results.json','.log']:
    path=EX/(LABEL+suffix);data,f=read(path);alias='PRIMARY_'+suffix.replace('.','_').strip('-_')
    archive=RUN/'primary'/path.name;arch,af=read(archive)
    check(data==arch,'PRIMARY_ARCHIVE_BYTES:'+alias)
    records.append({'alias':alias,'referencePath':str(path.relative_to(ROOT)),'fact':f,'existingArchiveReferencePath':str(archive.relative_to(ROOT)),'existingArchiveFact':af,'classification':'PUBLIC_EXISTING_PRIMARY_ARCHIVE'})
    controls[suffix]=data
before=json.loads(controls['-before.json']);after=json.loads(controls['-after.json'])
log=controls['.log'].decode(errors='replace')
check(sha(controls['.log'])==collector['logSha256'],'NATIVE_LOG_HASH')

source=plan['source']
source_actual=[]
for row in source['files']:
    data,f=read(ROOT/row['path']);source_actual.append({'path':row['path'],'sha256':f['sha256']})
    check(f['sha256']==row['sha256'],'SOURCE_PIN:'+row['path'])
source_digest=sha(json.dumps(source_actual,separators=(',',':')).encode())
check(source_digest==source['digest']==before['digest']==after['digest']==catalog['sourceDigest'],'SOURCE_DIGEST')
check(before['files']==after['files']==source['files'],'BEFORE_AFTER_SOURCE_MEMBERSHIP')
dist=[]
for p in files(ROOT/'studio-runner/dist'):
    _,f=read(p);dist.append({'path':str(p.relative_to(ROOT/'studio-runner/dist')),'sha256':f['sha256']})
check(dist==source['dist']['files']==before['dist']['files']==after['dist']['files'],'DIST_MEMBERSHIP_AND_HASHES')
check(sha(json.dumps(dist,separators=(',',':')).encode())==source['dist']['digest'],'DIST_DIGEST')
helm={str(p.relative_to(ROOT)):read(p)[1]['sha256'] for p in files(ROOT/'helm-chart')}
check(helm==plan['helm'],'ALL_22_HELM_INPUTS')
for group in ['quotedCurrent','immutableHelpers']:
    for path,digest in plan[group].items():check(read(ROOT/path)[1]['sha256']==digest,group+':'+path)
check(h['startInputs']==h['endInputs'],'HARNESS_START_END_INPUTS')
check(all(collector.get(k) is True for k in ['sourceStable','distStable','testInputStable','taskCollectionComplete']),'COLLECTOR_STABILITY_FLAGS')
check(collector['testInputDigestBefore']==collector['testInputDigestAfter']==source_digest,'COLLECTOR_TEST_INPUT_DIGESTS')
source_test_inventory=catalog['sourceTestJavaInventory']
check({str(p.relative_to(ROOT)) for p in files(ROOT/'backend/src/test/java') if p.suffix=='.java'}=={x['path'] for x in source_test_inventory},'356_TEST_JAVA_MEMBERSHIP')
for row in source_test_inventory:check(read(ROOT/row['path'])[1]['sha256']==row['sha256'],'TEST_JAVA_PIN:'+row['path'])
for row in catalog['sourceClassMappings']:check(read(ROOT/row['source'])[1]['sha256']==row['sha256'],'CLASS_SOURCE_PIN:'+row['class'])
source_info={'sourceFiles':len(source_actual),'sourceDigest':source_digest,'distFiles':len(dist),'distDigest':source['dist']['digest'],'helmFiles':len(helm),'quotedFiles':len(plan['quotedCurrent']),'immutableHelpers':len(plan['immutableHelpers']),'sourceBeforeAfterMembershipEqual':before['files']==after['files'],'currentListedPinsMatch':source_actual==source['files'],'all356TestJavaMembershipVerified':len(source_test_inventory)==356,'beforeAfterTestInputStable':collector['testInputStable'],'newGitIndexEnumerationPerformed':False}

# Exact dependency/JAR-entry provenance. No JAR or code execution.
resources={};jar_cache={};resource_provenance=[]
for index,row in enumerate(resource_catalog['resources']):
    jar=Path(row['dependencyJarPath'])
    if jar not in jar_cache:
        content,f=read(jar);check(f['sha256']==row['dependencyJarSha256'],'PRODUCER_JAR:'+str(index));jar_cache[jar]=(content,f)
    content,jf=jar_cache[jar]
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        entry=z.getinfo(row['dependencyEntry']);payload=z.read(entry)
    check(sha(payload)==row['resourceSha256'] and len(payload)==row['resourceBytes'],'PRODUCER_RESOURCE:'+str(index))
    resources[(row['generator'],row['reportRelativePath'])]=(index,row)
    resource_provenance.append({'resourceCatalogIndex':index,'generator':row['generator'],'relativePath':row['reportRelativePath'],'jarSha256':jf['sha256'],'jarEntry':row['dependencyEntry'],'resourceSha256':sha(payload),'resourceBytes':len(payload),'historicalRuntimeClasspathProved':False})

archive_root=EX/(LABEL+'-task-outputs')
groupdata={};xmlcases=[];xmlroots={};testhtml={};exec_info=[];public_json={};dynamic_counts=collections.Counter();static_counts=collections.Counter();unresolved=[]
for group in ['xmlFiles','testHtmlFiles','jacocoExecFiles','guidedCohortFiles','guardTallies']:
    facts=collector[group];check(facts==h['collectorArchiveReferences'][group],'HARNESS_COLLECTOR_ARCHIVE_REFS:'+group)
    groupdata[group]=[]
    for ordinal,item in enumerate(facts):
        path=ROOT/item['path'];check(path.is_relative_to(archive_root),'ARCHIVE_ROOT:'+group+str(ordinal));data,f=read(path)
        check(all(f[k]==item[k] for k in ['sha256','bytes','mtimeNs']),'ARCHIVE_HASH_SIZE_ORIGINAL_MTIME:'+group+str(ordinal))
        check(int(item['mode'],8)==int(f['mode'],8),'ARCHIVE_MODE:'+group+str(ordinal))
        task=item.get('task');alias=f'{group}:{task or "shared"}:{ordinal}'
        classification='DYNAMIC_FRESH' if fresh(f) else 'DYNAMIC_STALE_REJECTED'
        original=None;static_index=None
        if group=='xmlFiles':original=ROOT/'backend/build/test-results'/task/path.name
        elif group=='testHtmlFiles':
            rel=path.relative_to(archive_root/task/'html');original=ROOT/'backend/build/reports/tests'/task/rel
            resource=resources.get(('Gradle8.10.2-test-report',str(rel)))
            if resource:
                static_index,row=resource
                if f['sha256']==row['resourceSha256'] and f['bytes']==row['resourceBytes']:
                    classification='INHERITED_STATIC_RENDER_RESOURCE_NO_CASE_COVERAGE_RUNTIME_FRESHNESS_CREDIT';static_counts[task]+=1
                else:classification='STATIC_CONTENT_MISMATCH_REJECTED'
            elif rel.suffix!='.html':classification='UNKNOWN_REPORT_ASSET_REJECTED'
            else:testhtml[(task,str(rel))]=data
        elif group=='jacocoExecFiles':original=ROOT/'backend/build/jacoco'/path.name
        elif group=='guidedCohortFiles':
            rel=path.relative_to(archive_root/task/'cohorts');original=ROOT/'backend/build/guided-cohorts'/task/rel
            # Explicit existing public archive only. No private scratch/journal discovery or reads.
            assert path.name=='cohort.json' or path.name in ['audit-final.json','guard-tally.json'] or re.fullmatch(r'(model-budget-evidence|responses|privacy)-[A-Za-z0-9._-]+\.json',path.name)
            public_json[(task,path.name)]=json.loads(data)
        elif group=='guardTallies':original=ROOT/'backend/build/guard-tally'/path.name
        if original is not None:
            original_data,of=read(original)
            check(original_data==data and of['mtimeNs']==item['mtimeNs'],'PUBLIC_ORIGINAL_MATCH:'+alias)
        else:of=None
        if classification=='DYNAMIC_FRESH':dynamic_counts[group]+=1
        elif not classification.startswith('INHERITED_STATIC'):unresolved.append(alias)
        records.append({'alias':alias,'referenceReceiptAlias':'FINAL_COLLECTOR','referenceJsonPointer':f'/{group}/{ordinal}','fact':f,'originalPublicOutputFact':of,'classification':classification,'resourceCatalogIndex':static_index,'freshnessByOriginalMtime':fresh(f),'copyTimeFreshnessUsed':False})
        groupdata[group].append((item,data,f))
        if group=='xmlFiles':
            suite=ET.fromstring(data);xmlroots[(task,suite.get('name'))]=suite;cases=[]
            for c in suite.iter('testcase'):
                s='FAIL' if c.find('failure') is not None or c.find('error') is not None else 'SKIP' if c.find('skipped') is not None else 'PASS'
                cases.append({'task':task,'class':c.get('classname'),'name':c.get('name'),'status':s})
            check(len(cases)==int(suite.get('tests')),'XML_SUITE_COUNT:'+alias)
            check(sum(c['status']=='FAIL' for c in cases)==int(suite.get('failures'))+int(suite.get('errors')),'XML_SUITE_FAIL_COUNT:'+alias)
            check(sum(c['status']=='SKIP' for c in cases)==int(suite.get('skipped')),'XML_SUITE_SKIP_COUNT:'+alias)
            xmlcases+=cases

key=lambda c:(c['task'],c['class'],c['name'])
actual=collections.Counter(key(c) for c in xmlcases)
expected=collections.Counter(key(c) for c in catalog['expectedCaseIdentities'])
check(actual==expected,'ACTUAL_FULL_EXPECTED_IDENTITY_MULTISET')
check(collections.Counter((*key(c),c['status']) for c in xmlcases)==collections.Counter((*key(c),c['status']) for c in collector['testcases']),'XML_COLLECTOR_FULL_STATUS_MULTISET')
skips=[c for c in xmlcases if c['status']=='SKIP'];approved=load(ROOT/plan['skipPath'])
check(collections.Counter(map(key,skips))==collections.Counter(map(key,approved)) and len(skips)==9,'EXACT_NINE_SKIPS')
task_counts={task:dict(collections.Counter(c['status'] for c in xmlcases if c['task']==task)) for task in plan['testTasks']}
classes=collections.Counter((c['task'],c['class']) for c in xmlcases)
for (task,clazz),count in classes.items():
    path='classes/'+clazz+'.html';data=testhtml.get((task,path))
    check(data is not None,'HTML_CLASS_PRESENT:'+task+':'+clazz)
    if data:
        m=re.search(rb'id="tests".*?<div class="counter">(\d+)</div>',data,re.S)
        check(m is not None and int(m[1])==count,'HTML_CLASS_TEST_COUNT:'+task+':'+clazz)
check(sum(rel.startswith('classes/') for task,rel in testhtml)==len(classes),'HTML_CLASS_PARTITION_CARDINALITY')
for task in plan['testTasks']:
    index=testhtml.get((task,'index.html'));check(index is not None,'HTML_ACTIVE_INDEX:'+task)
    for (owner,rel),data in testhtml.items():
        if owner!=task or not (rel.startswith('packages/') or rel=='index.html'):continue
        for href in re.findall(rb'href="([^"]+\.html)(?:#[^"]*)?"',data):
            target=html.unescape(href.decode()).split('#')[0]
            if target.startswith(('http:','https:')):continue
            target=os.path.normpath(str(Path(rel).parent/target))
            check((task,target) in testhtml,'HTML_PACKAGE_INDEX_LINK:'+task+':'+target)
failed=[c for c in xmlcases if c['status']=='FAIL']
failures=[]
for case in failed:
    suite=xmlroots[(case['task'],case['class'])]
    for node in suite.iter('testcase'):
        if node.get('name')!=case['name']:continue
        failure=node.find('failure')
        if failure is None:failure=node.find('error')
        body=failure.text or ''
        frames=re.findall(r'\bat (?:[\w.$]+//)?(com\.citi\.put\.checks\.[\w.$]+)\((\w+\.java):(\d+)\)',body)
        failures.append({**case,'failureType':failure.get('type'),'sourceFrames':[{'symbol':a,'file':b,'line':int(c)} for a,b,c in frames[:6]],'rawMessageOrPayloadExported':False})

def parse_exec(data):
    stream=io.BytesIO(data);sessions=[];class_records=0;headers=0
    def n(count):
        b=stream.read(count);assert len(b)==count,'TRUNCATED_EXEC';return b
    def utf():n(struct.unpack('>H',n(2))[0])
    def variable():
        value=shift=0
        while True:
            x=n(1)[0];value|=(x&127)<<shift
            if not x&128:return value
            shift+=7;assert shift<35
    while stream.tell()<len(data):
        block=n(1)[0]
        if block==1:
            assert struct.unpack('>H',n(2))[0]==0xc0c0
            assert struct.unpack('>H',n(2))[0]==0x1007;headers+=1
        elif block==0x10:
            utf();a,b=struct.unpack('>qq',n(16));sessions.append((a/1000,b/1000))
        elif block==0x11:
            n(8);utf();count=variable();n((count+7)//8);class_records+=1
        else:raise ValueError('UNKNOWN_EXEC_BLOCK')
    return sessions,class_records,headers
for item,data,f in groupdata['jacocoExecFiles']:
    times,cr,headers=parse_exec(data);valid=bool(times) and all(start<=a<=b<=end+2 for a,b in times)
    check(valid,'EXEC_INTERNAL_SESSION_TIMES:'+item['task'])
    exec_info.append({'task':item['task'],'nonempty':len(data)>0,'originalMtimeFresh':fresh(f),'sessionCount':len(times),'sessionsWithinNativeInterval':valid,'earliestSessionStart':min(a for a,b in times),'latestSessionDump':max(b for a,b in times),'classRecords':cr,'formatHeaders':headers,'sha256':f['sha256'],'bytes':f['bytes']})

# Source-accepted method/provider expansion is carried by hashes, never inferred from the passing subset.
qa_receipt=load(T0/'qa/fullcheck03-source-catalog/receipt.json')
derived_path=T0/'qa/fullcheck03-source-catalog/derived-method-coverage.json'
derived=json.loads(bind(derived_path,qa_receipt['reviewFiles']['derived-method-coverage.json'],'ACCEPTED_SOURCE_METHOD_EXPANSION'))
methods=collections.Counter()
for m in derived['methods']:methods[(m['task'],m['class'],m['method'])]+=m['invocations']
cohort_summaries=[];per_inv=[]
flags=['auditComplete','privacyComplete','producersDrained','modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete']
replay='com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'
for task,ceiling,profile in [('test',4000,'original4000'),('guidedIncrementalTest',2048,'incremental2048')]:
    cohort=public_json[(task,'cohort.json')];inv=cohort['invocations'];audit=public_json[(task,'audit-final.json')];guard=public_json[(task,'guard-tally.json')]
    check(cohort['lane']==task and cohort['profile']==profile and cohort['declaredOutputCeiling']==ceiling,'COHORT_LANE_PROFILE:'+task)
    check(all(cohort.get(x) is True for x in flags),'SIX_FINAL_FLAGS:'+task)
    check(cohort['retentionFailures']==0 and cohort['finalScansAttempted'] is True,'COHORT_FINAL_RETENTION:'+task)
    check(audit['lane']==task and audit['runId']==cohort['runId'] and audit['cohortId']==cohort['cohortId'],'AUDIT_COHORT_INTERNAL_BINDING:'+task)
    check(all(audit[x] is True for x in ['auditComplete','producersDrained','contextClosed']),'AUDIT_CLOSED_BOUNDARY:'+task)
    check([x['invocationOrdinal'] for x in inv]==list(range(1,len(inv)+1)),'COHORT_ORDINAL_CLOSURE:'+task)
    expected_replay=collections.Counter((c['name'],c['status']) for c in xmlcases if c['task']==task and c['class']==replay)
    observed_replay=collections.Counter((x['displayLabel'],'PASS' if x['passed'] else 'FAIL') for x in inv)
    check(expected_replay==observed_replay,'COHORT_XML_FULL_STATUS_MULTISET:'+task)
    method_counts=collections.Counter(x['method'] for x in inv)
    check(method_counts==collections.Counter({method:count for (lane,clazz,method),count in methods.items() if lane==task and clazz==replay}),'COHORT_SOURCE_METHOD_VARIANT_MULTIPLICITY:'+task)
    expected_guard_names=collections.Counter(x['method']+'['+x['displayLabel']+']' if x['displayLabel'].startswith('incremental joined ') else x['method'] for x in inv)
    check(guard['class']==replay and guard['testsRecorded']==len(inv) and collections.Counter(x['test'] for x in guard['tests'])==expected_guard_names,'COHORT_GUARD_SOURCE_IDENTITIES:'+task)
    for row in inv:
        ordinal=row['invocationOrdinal'];case_alias=f'{task}/invocation-{ordinal}'
        check(row['afterEachComplete'] is True,'AFTER_EACH_CLOSED:'+case_alias)
        keyname=f"{task}-{ordinal}-{row['method']}-{row['variant']}"
        needed={'privacy':'privacy-'+keyname+'.json',**{f'{kind}-{phase}':kind+'-'+keyname+'-'+phase+'.json' for kind in ['model-budget-evidence','responses'] for phase in ['after-each','final']}}
        all_present=all((task,name) in public_json for name in needed.values());check(all_present,'PER_INVOCATION_FIVE_FILES:'+case_alias)
        if not all_present:continue
        for kind,name in needed.items():
            value=public_json[(task,name)]
            check(value['invocationOrdinal']==ordinal and value['variantOrdinal']==row['variantOrdinal'],'PER_INVOCATION_ORDINAL:'+case_alias+kind)
            if not kind.startswith('model-budget-evidence'):
                check(all(value[k]==row[k] for k in ['method','displayLabel','variant']) and value['class']==replay and value['lane']==task,'PER_INVOCATION_SOURCE_IDENTITY:'+case_alias+kind)
        privacy=public_json[(task,needed['privacy'])]
        check(all(privacy[x] is True for x in ['auditComplete','privacyComplete','producersDrained']),'PER_INVOCATION_PRIVACY_FLAGS:'+case_alias)
        check(privacy['wholeCohortSinkInventory']==cohort['finalSinkInventory'],'PER_INVOCATION_SINK_INVENTORY:'+case_alias)
        for phase in ['after-each','final']:
            budget=public_json[(task,needed['model-budget-evidence-'+phase])]
            check(budget['complete'] is True and budget['declaredFixtureCeiling']==ceiling and budget['transportOutputCeiling']>=4000,'BUDGET_COMPLETE_CEILING:'+case_alias+phase)
            for session in budget['sessions']:
                limits=session['sessionLimits'];cnt=session['actualCounters'];derived_prod=session['derivedProductionCeiling']
                check(limits=={'maxModelInputTokensTotal':786432,'maxModelOutputTokensTotal':98304,'maxModelProposals':100},'FROZEN_BUDGET_LIMITS:'+case_alias+phase)
                check(0<=cnt['modelInputTokens']<=786432 and 0<=cnt['modelOutputTokens']<=98304 and 0<=cnt['modelProposals']<=100,'ACTUAL_COUNTER_LIMITS:'+case_alias+phase)
                check(derived_prod['derivedNotARun'] is True and derived_prod['perCallOutputTokens']==4096 and derived_prod['proposals']==cnt['modelProposals'] and derived_prod['reservedOutputAtProductionCeiling']==cnt['modelProposals']*4096<=98304 and derived_prod['fitsFrozenOutputTotal'] is True,'DERIVED_IS_NOT_PRODUCTION_RUN:'+case_alias+phase)
                for witness in session['beforeGatewaySend']:
                    check(witness['outsideCallerTransaction'] is True and witness['committedCallingReservation'] is True,'COMMITTED_PRE_SEND:'+case_alias+phase)
                    check(all(witness[k]==ceiling for k in ['serviceReservationOutput','persistedOutputCeiling','actualGatewayOutputCeiling']) and witness['serviceReservationInput']==witness['persistedInputCeiling'],'PRE_SEND_CEILING:'+case_alias+phase)
                for attempt in session['attempts']:
                    check(attempt['persistedOutputCeiling']==ceiling,'ATTEMPT_PERSISTED_CEILING:'+case_alias+phase)
                    if attempt['wireFound']:check(attempt['actualWireOutputCeiling']==ceiling and attempt['actualCompleteEncodedInputBytes']<=attempt['persistedInputCeiling'],'ACTUAL_WIRE_BOUND:'+case_alias+phase)
        responses=public_json[(task,needed['responses-final'])];check(responses['diagnosticFailures']==0,'RESPONSE_DIAGNOSTIC_FAILURES:'+case_alias)
        budget=public_json[(task,needed['model-budget-evidence-final'])]
        witness_ids=collections.Counter((s['sessionOrdinal'],w['attemptOrdinal']) for s in budget['sessions'] for w in s['beforeGatewaySend'])
        call_ids=collections.Counter((c['sessionOrdinal'],c['attemptOrdinal']) for c in responses['calls'])
        for call in responses['calls']:
            check(all(call.get(k) is True for k in ['joined','terminalRecorded','attemptDispositionRead']),'RESPONSE_FINAL_JOIN_TERMINAL:'+case_alias)
            check(call['invocationOrdinal']==ordinal and call['variantOrdinal']==row['variantOrdinal'] and call['lane']==task,'RESPONSE_CALL_INVOCATION:'+case_alias)
            check(call_ids[(call['sessionOrdinal'],call['attemptOrdinal'])]==1 and witness_ids[(call['sessionOrdinal'],call['attemptOrdinal'])]==1,'RESPONSE_EXACT_PRE_SEND_JOIN:'+case_alias)
            check(call['requestedOutputCeiling']==call['actualWireOutputCeiling']==ceiling and call['requestUtf8Bytes']<=call['persistedInputCeiling'],'RESPONSE_REQUEST_CEILINGS:'+case_alias)
            if call['textEncoded']:check(call['textUtf8Bytes']<=call['responseTextByteBound'] and call['declaredInputUsage']==20 and call['declaredOutputUsage']==40,'RESPONSE_TEXT_BOUND:'+case_alias)
        per_inv.append({'task':task,'invocationOrdinal':ordinal,'method':row['method'],'variantOrdinal':row['variantOrdinal'],'passed':row['passed'],'afterEachComplete':row['afterEachComplete'],'publicFiles':5,'finalResponseCalls':len(responses['calls'])})
    cohort_summaries.append({'task':task,'invocations':len(inv),'passed':sum(x['passed'] is True for x in inv),'failed':sum(x['passed'] is False for x in inv),'afterEachComplete':sum(x['afterEachComplete'] is True for x in inv),'flags':{x:cohort[x] for x in flags},'auditContextClosed':audit['contextClosed'],'retentionFailures':cohort['retentionFailures'],'xmlStatusMultisetEquals':expected_replay==observed_replay,'completeAllPassed':all(x['passed'] and x['afterEachComplete'] for x in inv) and all(cohort[x] for x in flags),'privatePayloadRescanned':False})
for item,data,f in groupdata['guardTallies']:
    guard=json.loads(data);clazz=guard['class']
    if clazz==replay:
        check(guard==public_json[('guidedIncrementalTest','guard-tally.json')],'CANONICAL_FINAL_REPLAY_GUARD_EQUALS_INCREMENTAL')
    else:
        expected_methods=collections.Counter({m:n for (lane,c,m),n in methods.items() if lane=='test' and c==clazz})
        check(collections.Counter(x['test'] for x in guard['tests'])==expected_methods and guard['testsRecorded']==sum(expected_methods.values()),'PLANNING_GUARD_SOURCE_MULTIPLICITY')

statuses={}
for line in log.splitlines():
    match=re.fullmatch(r'> Task :([\w]+)(?: (.*))?',line)
    if match:statuses[match[1]]=match[2] or 'EXECUTED'
required={task:statuses.get(task,'ABSENT') for task in [*plan['testTasks'],*plan['coverageTasks']]}
check(required==h['requiredTaskStatuses'],'RAW_LOG_TASK_STATUSES')
build=read(ROOT/'backend/build.gradle.kts')[0].decode()
check('executionData.setFrom(layout.buildDirectory.file("jacoco/test.exec"), layout.buildDirectory.file("jacoco/guidedIncrementalTest.exec"))' in build,'MERGED_COVERAGE_TWO_PARTITIONS_WIRING')
check('tasks.register<Test>("crossReplicaTest")' in build and 'val guidedIncrementalTest = tasks.register<Test>' in build,'ALL_THREE_GRADLE_TEST_REPORT_ROOTS')

# Original JaCoCo report: retain all stale dynamic facts, never upgrade from copy time or new execs.
coverage_root=ROOT/'backend/build/reports/jacoco/test'
coverage_xml=coverage_root/'jacocoTestReport.xml'
report,rf=read(coverage_xml);sessions=ET.fromstring(report).findall('sessioninfo')
times=[(int(x.get('start'))/1000,int(x.get('dump'))/1000) for x in sessions]
cov_static=0;cov_dynamic=0;cov_dynamic_fresh=0;cov_unknown=[]
for ordinal,path in enumerate(files(coverage_root)):
    data,f=read(path);rel=str(path.relative_to(coverage_root));resource=resources.get(('JaCoCo0.8.12-html-report',rel));catalog_index=None
    if resource:
        catalog_index,row=resource
        if f['sha256']==row['resourceSha256'] and f['bytes']==row['resourceBytes']:
            classification='INHERITED_STATIC_RENDER_RESOURCE_NO_CASE_COVERAGE_RUNTIME_FRESHNESS_CREDIT';cov_static+=1
        else:classification='STATIC_CONTENT_MISMATCH_REJECTED';cov_unknown.append(rel)
    elif path.suffix in ['.html','.xml','.csv']:
        classification='UNCREDITED_COVERAGE_DYNAMIC_FRESH' if fresh(f) else 'UNCREDITED_COVERAGE_DYNAMIC_STALE';cov_dynamic+=1;cov_dynamic_fresh+=int(fresh(f))
    else:classification='UNKNOWN_COVERAGE_ASSET_REJECTED';cov_unknown.append(rel)
    records.append({'alias':'coverage:'+rel,'originalPublicOutputPath':str(path.relative_to(ROOT)),'fact':f,'classification':classification,'resourceCatalogIndex':catalog_index,'freshnessByOriginalMtime':fresh(f),'coverageCredit':False})
coverage={'reportExists':True,'reportSha256':rf['sha256'],'unchangedFromBefore':rf['sha256']==h['coverageReportBefore']['sha256'],'originalMtimeFresh':fresh(rf),'sessionCount':len(times),'sessionsWithinCurrentRun':bool(times) and all(start<=a<=b<=end+2 for a,b in times),'earliestSessionStart':min(a for a,b in times),'latestSessionDump':max(b for a,b in times),'dynamicFiles':cov_dynamic,'dynamicFilesFresh':cov_dynamic_fresh,'staticResourcesProven':cov_static,'unknownAssets':cov_unknown,'requiredTaskStatuses':required,'mergedExecTasks':['test','guidedIncrementalTest'],'crossReplicaExecRequiredSeparately':True,'reportAndVerificationActuallyExecuted':all(required[x]=='EXECUTED' for x in plan['coverageTasks']),'freshCoverageProved':False,'ratiosOrHeadroomCredited':False}

# Freeze post-read facts. Double hashing every referenced public input catches changed bytes/metadata.
for name,fact in list(observed.items()):
    again,current=read(Path(name));assert current==fact,'PUBLIC_INPUT_CHANGED_DURING_ASSESSMENT'
check(not unresolved,'DYNAMIC_OR_UNKNOWN_TEST_ARTIFACTS_UNRESOLVED')
ps=subprocess.run(['ps','-axo','pid=,lstart='],capture_output=True,text=True,check=True)
current={int(line.split(None,1)[0]):line.split(None,1)[1].strip() for line in ps.stdout.splitlines() if line.strip()}
terminal_counts=collections.Counter('PID_ABSENT' if row['pid'] not in current else 'DIFFERENT_KERNEL_START' if current[row['pid']]!=row['start'] else 'SAME_START_LIVE' for row in h['ownedIdentities'])
check(not terminal_counts['SAME_START_LIVE'],'FINAL_OWNED_TERMINAL_CENSUS')
terminal['finalRecheckAtUtc']=dt.datetime.now(dt.timezone.utc).isoformat()
terminal['finalRecheckCounts']=dict(terminal_counts)
counts=collections.Counter(c['status'] for c in xmlcases)
result={'status':'ASSESSMENT_COMPLETE_NATIVE_FAIL_COVERAGE_UNPROVED_OUTER_QUALIFIED','executionLabel':LABEL,'atUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'native':{'collectorExit':collector['exit'],'nativeGradleExit':collector['gradleExit'],'total':len(xmlcases),'passed':counts['PASS'],'failed':counts['FAIL'],'skipped':counts['SKIP'],'errors':collector['counts']['errors'],'taskCounts':task_counts,'failures':failures,'allPass':False},'scope':{'acceptedExpectedCases':catalog['expectedCaseCount'],'identityMultisetExact':actual==expected,'xmlCollectorStatusMultisetExact':collections.Counter((*key(c),c['status']) for c in xmlcases)==collections.Counter((*key(c),c['status']) for c in collector['testcases']),'missingExpected':sum((expected-actual).values()),'extraActual':sum((actual-expected).values()),'actualExclusions':[],'classes':len({c['class'] for c in xmlcases}),'taskQualifiedClasses':len(classes),'sourceClassMappings':len(catalog['sourceClassMappings']),'sourceAcceptedAnnotatedMethods':derived['plainMethods']+derived['parameterizedMethods'],'sourceAcceptedParameterizedMethods':derived['parameterizedMethods'],'sourceAcceptedParameterizedInvocations':derived['derivedInvocations']-derived['plainMethods'],'sourceAcceptedTotalInvocations':derived['derivedInvocations'],'nineExactSkips':len(skips)==9 and collections.Counter(map(key,skips))==collections.Counter(map(key,approved))},'cohorts':cohort_summaries,'freshExecAssessments':exec_info,'dynamicFreshness':{'freshCounts':dict(dynamic_counts),'unresolvedAliases':unresolved,'classHtmlCoverageVerified':len(classes),'originalPublicOutputsCompared':True,'copyTimeUsed':False},'staticResources':{'testReportRootProvenCounts':dict(static_counts),'jacocoProven':cov_static,'exactDependencyEntriesVerified':len(resource_provenance),'noFreshCaseRuntimeCoverageCredit':True,'rawNineStaleAssetErrorsPreserved':h['evidenceErrors'].count('TASK_ARCHIVE_ORIGINAL_NOT_FRESH'),'historicalRuntimeClasspathMeasured':False},'coverage':coverage,'source':source_info,'terminal':terminal,'outer':{'rawHarnessStatus':h['status'],'rawHarnessExit':h['exit'],'rawCollectorExit':h['collectorExit'],'rawEvidenceErrors':h['evidenceErrors'],'rawEvidenceComplete':h['evidenceComplete'],'rawFullGateSucceeded':h['fullGateSucceeded'],'ownedIdentityObservationGap':h['ownedIdentityObservationGap'],'interrupted':h['interrupted'],'rawJvmTerminalProofs':len(h['ownedJvmTerminalProof']),'rawRemainingOwnedNonJvm':len(h['remainingOwnedNonJvmFacts']),'historicalGapResolved':False,'inheritedBaselineCount':len(h['startInventory']['inheritedMatched']),'inheritedBaselineUnchanged':h['startInventory']['inheritedMatched']==h['endInventory']['inheritedMatched'],'quietHostOrInheritedCleanupClaim':False},'independentAudit':{'checks':checks,'violations':violations,'stableReferencedInputs':len(observed),'sourceEdits':0,'testBuildCompilerHelmNodeCalls':0,'privateRuntimeInputsRead':0,'authorEntrypointsExecuted':0,'newRawPublicPayloadCopies':0,'exclusiveReferenceArchive':True},'disposition':{'C8Passed':False,'freshCoveragePassed':False,'allJoinedInvocationsPassed':False,'W1Released':False,'laneCredit':False,'storyLifecycleChanged':False,'privateProjectionReleased':False,'sourceWriterReleased':False,'retryAuthorized':False,'rootCauseEstablished':False,'remaining':['Preserve native Order11 failure and establish its cause without weakening its oracle.','Satisfy C8 actual full fresh check and genuinely executed fresh merged coverage before lane credit.','Resolve or explicitly qualify the historical owned-identity observation gap under original authority.','Keep source/output hold until root adopts this completed assessment; unchanged-main five-class GS-T and all original sequencing/gates remain owed.']}}
write('assessment.json',result)
write('qualified-public-reference-archive.json',{'kind':'SAME_EXECUTION_PUBLIC_REFERENCE_ARCHIVE','executionLabel':LABEL,'originalBytesCopied':False,'rawHistoricalEvidenceRewritten':False,'privacy':'Public cohort paths use collector JSON-pointer references; no UUID/TEMP/private payload copied.','records':records,'dependencyResourceProvenance':resource_provenance})
write('public-invocation-assessment.json',{'publicCaseIdentifiersOnly':True,'invocations':per_inv})
print(json.dumps({'status':result['status'],'counts':dict(counts),'scopeExact':actual==expected,'checks':checks,'violations':violations,'references':len(records),'coverage':{k:coverage[k] for k in ['sessionCount','dynamicFiles','dynamicFilesFresh','staticResourcesProven']}}))

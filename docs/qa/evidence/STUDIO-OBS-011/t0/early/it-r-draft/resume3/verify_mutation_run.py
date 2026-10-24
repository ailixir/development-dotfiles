"""Read-only D5 evidence reconciliation. No launch/source application/native verdict.
CLI uses only hashed fresh artifacts in the actual root collector archive. Contract witnesses
inject an in-memory reader into the same core; they are Python fakes, never native proof.
Private Throwable text/identities are inspected locally and never exported.
"""
from pathlib import Path
from collections import Counter
import argparse,datetime,hashlib,json,re,sys,uuid
import xml.etree.ElementTree as ET
HERE=Path(__file__).resolve().parent
ROOT=next(p for p in HERE.parents if (p/'AGENTS.md').is_file())
FQCN='com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT'
EXEC=Path('docs/qa/evidence/STUDIO-OBS-011/execution')
ORDER39='auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass'
SUBSET='syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls'
CONTROLS={'M-gate-false','M-omit-variant','M-duplicate-variant'}
UNAFFECTED=('privacyComplete','modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete','producersDrained','finalScansAttempted')
sha=lambda b:hashlib.sha256(b).hexdigest()
def require(value,reason):
    if not value:raise ValueError(reason)
def default_reader(row):
    p=ROOT/row['path'];require(p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(ROOT),'UNSAFE_ARTIFACT')
    current=p.parent
    while current!=ROOT:
        require(not current.is_symlink(),'SYMLINK_PARENT');current=current.parent
    require(p.stat().st_mtime_ns==row['mtimeNs'],'ARCHIVE_MTIME_MISMATCH')
    return p.read_bytes()
def case_key(r):return r['task'],r['class'],r['name']
def invocation_key(r):return r['method'],r['variant'],r['variantOrdinal']
def profile_contract(wanted,subset=False):
    original=(HERE/'ReplayIT.original.java').read_text()
    def registry(field):
        a=original.index(field+' =');return re.findall(r'"([^"\n]+)"',original[a:original.index(';',a)])
    singleton=registry('SINGLETON_METHODS');incremental=registry('INCREMENTAL_METHODS');variants=registry('INCREMENTAL_VARIANTS')
    require(ORDER39 in singleton and ORDER39 not in incremental and len(variants)==35,'SOURCE_PROFILE_DRIFT')
    require(len([r for r in wanted['cases'] if r['task']=='test'])==46,'DEFAULT_SOURCE_UNION')
    require(len([r for r in wanted['cases'] if r['task']=='guidedIncrementalTest'])==62,'INCREMENTAL_SOURCE_UNION')
    result={}
    for task,profile in [('test','original4000'),('guidedIncrementalTest','incremental2048')]:
        selected=[r for r in wanted['cases'] if r['task']==task and (not subset or task=='test' and r['method']==SUBSET)]
        body=sum(r['method']==ORDER39 for r in selected)
        require(body==(0 if subset or task=='guidedIncrementalTest' else 1),'BODY_PROFILE_DRIFT')
        if not subset:
            require(all((r['method'] in incremental)==(task=='guidedIncrementalTest') for r in selected),'WRONG_SOURCE_PROFILE')
            require(sum(r['variant']!='singleton' for r in selected)==(35 if task=='guidedIncrementalTest' else 0),'VARIANT_UNION')
        result[task]={'profile':profile,'selected':selected,'bodyChecks':body,'caseCount':len(selected)}
    return result

def failure_contract(source,mutation):
    assertion=('isNotEmpty();' if mutation in ['M-empty-canaries','M-gate-true-subset'] else
       '.anyMatch(e -> e.getFormattedMessage().equals("GUIDED_ACTION_ADMITTED"))' if mutation=='M-missing-admitted' else
       '.anyMatch(e -> e.getFormattedMessage().equals("REPLAY_DISPATCHED"))')
    start=source.index('  private static void itrAssertAuditCorpus()')
    end=source.index('  private static void scanAuditContent()',start)
    offset=source.index(assertion,start,end)
    helper=source.index('        itrAssertAuditCorpus();',source.index('scanCompleteAuditStream(String'))
    owned=source.index('scanCompleteAuditStream("OWNED_SINKS",')
    closed=source.index('scanCompleteAuditStream("CONTEXT_CLOSED",')
    line=lambda i:source[:i].count('\n')+1
    return dict(assertionLine=line(offset),scanLine=line(helper),ownedLine=line(owned),closedLine=line(closed),
      description='the OBS-007 case registered its canaries' if mutation in ['M-empty-canaries','M-gate-true-subset'] else 'the joined runs emitted admitted-action and replay-dispatch events')

def validate_failure(element,contract):
    require(element.attrib.get('type')=='java.lang.AssertionError','UNEXPECTED_PRIMARY_FAILURE_TYPE')
    text=element.text or ''
    # Parse every throwable header, not just the presence of one desired frame in an aggregate.
    header=re.compile(r'^([ \t]*)(?:(Suppressed|Caused by):\s*)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)(?::(.*))?$')
    nodes=[];current=None
    for raw in text.splitlines():
        require('CIRCULAR REFERENCE' not in raw,'UNEXPECTED_THROWABLE_CYCLE')
        m=header.fullmatch(raw)
        if m:
            require(m[3]=='java.lang.AssertionError' and m[2]!='Caused by','UNRELATED_THROWABLE')
            require((not nodes and not m[2] and not m[1]) or (len(nodes)==1 and m[2]=='Suppressed' and bool(m[1])),'UNEXPECTED_FAILURE_TREE')
            current={'relation':m[2],'message':[m[4] or ''],'frames':[]};nodes.append(current)
        else:
            require(current is not None or not raw.strip(),'UNRECOGNIZED_FAILURE_HEADER')
            if current is not None:
                if re.match(r'^\s*at\s',raw):current['frames'].append(raw)
                elif not re.match(r'^\s*\.\.\. \d+ more$',raw):current['message'].append(raw)
    require(len(nodes)==2,'EXPECTED_TWO_BOUNDARY_THROWABLES')
    desc='['+contract['description']+']'
    require(element.attrib.get('message','').lstrip().startswith(desc),'WRONG_PRIMARY_MESSAGE')
    for node,boundary in zip(nodes,['OWNED_SINKS','CONTEXT_CLOSED']):
        messages=[s.strip() for s in node['message'] if s.strip()]
        require(messages and messages[0]==desc,'WRONG_ASSERTION_MESSAGE')
        frames=[]
        for raw in node['frames']:
            m=re.search(r'GuidedPublicationReplayIT\.([^\s(]+)\(GuidedPublicationReplayIT\.java:(\d+)\)',raw)
            if m:frames.append((m[1],int(m[2])))
        require(len(frames)>=3 and frames[0]==('itrAssertAuditCorpus',contract['assertionLine']) and frames[1]==('scanCompleteAuditStream',contract['scanLine']),'WRONG_ASSERTION_LOCATION')
        if boundary=='OWNED_SINKS':require(frames[2][0].startswith('lambda$scanFinalOwnedSinks$') and frames[2][1]==contract['ownedLine'],'WRONG_OWNED_BOUNDARY_PROVENANCE')
        else:require(frames[2]==('scanFinalAuditBoundary',contract['closedLine']),'WRONG_CONTEXT_BOUNDARY_PROVENANCE')
    return True

def reconcile(data,before,after,receipt_path,mutation_id,reader=default_reader):
    wanted=json.loads((HERE/'expected-cases.json').read_text())
    mutant=next(m for m in json.loads((HERE/'mutation-plan.json').read_text())['mutants'] if m['id']==mutation_id)
    source=(HERE/'mutations'/mutation_id/'repo'/wanted['sourcePath']).read_text()
    require(sha(source.encode())==mutant['mutantSha256'],'SEALED_MUTANT_SOURCE_DRIFT')
    receipt_path=Path(receipt_path)
    if receipt_path.is_absolute():receipt_path=receipt_path.relative_to(ROOT)
    require(receipt_path.parent==EXEC and receipt_path.name.endswith('-results.json'),'WRONG_ROOT_RECEIPT_PATH')
    label=receipt_path.name[:-len('-results.json')]
    require(re.fullmatch(r'[A-Za-z0-9_-]+',label),'WRONG_ROOT_LABEL')
    archive=EXEC/(label+'-task-outputs')
    subset=mutation_id=='M-gate-true-subset';fault=mutation_id not in CONTROLS
    tasks=['test'] if subset else ['test','guidedIncrementalTest']
    profiles=profile_contract(wanted,subset)
    require(data['explicitTestTasks']==tasks and len(data['requiredFreshExecTasks'])==len(tasks) and set(data['requiredFreshExecTasks'])==set(tasks),'TASK_SELECTION')
    require(set(data['taskResults'])==set(tasks),'EXTRA_TASK_FACTS')
    require(all(data.get(k) is True for k in ['sourceStable','distStable','testInputStable']),'UNSTABLE_INPUTS')
    require(before['files']==after['files'] and before['digest']==after['digest'] and before['dist']['digest']==after['dist']['digest'],'BEFORE_AFTER_SOURCE_DIST_MISMATCH')
    compact=sha(json.dumps(before['files'],separators=(',',':')).encode())
    require(data['testInputDigestBefore']==data['testInputDigestAfter']==compact,'BEFORE_AFTER_INPUT_DIGEST')
    source_facts=[r for r in before['files'] if r['path']==wanted['sourcePath']]
    require(len(source_facts)==1 and source_facts[0]['sha256']==mutant['mutantSha256'],'MUTANT_SOURCE_NOT_ACTUALLY_STAGED')
    require(data['expectedHistoricalSkips']==[] and data['historicalSkipSource'] is None,'SKIP_POLICY')
    require(data['cwd']=='backend' and data['command'][:3]==['caffeinate','-i','./gradlew'],'WRONG_ACTUAL_COMMAND')
    command=data['command'][3:]
    selector=FQCN+'.'+SUBSET if subset else FQCN
    for task in tasks:
        require(any(command[i:i+3]==[task,'--tests',selector] for i in range(len(command)-2)),'WRONG_NATIVE_SELECTOR')
    require(command==sum(([task,'--tests',selector] for task in tasks),[])+['--continue','--rerun-tasks','--no-daemon'],'WRONG_EXACT_NATIVE_COMMAND')
    expected=Counter(case_key(r) for task in tasks for r in profiles[task]['selected'])
    synthetic=Counter((task,FQCN,'executionError') for task in tasks) if fault else Counter()
    expected_status=Counter((*key,'PASS') for key in expected.elements())+Counter((*key,'FAIL') for key in synthetic.elements())
    require(Counter((*case_key(r),r['status']) for r in data['testcases'])==expected_status,'WRONG_COMPLETE_CASE_STATUS_UNION')
    started=datetime.datetime.fromisoformat(data['started']);require(started.tzinfo is not None,'MISSING_START_TIMEZONE')
    started_ns=int(started.timestamp()*1_000_000_000)
    seen_paths=set()
    def bound(row,task,kind):
        require(row.get('task')==task and task in tasks,'WRONG_ARTIFACT_TASK')
        path=Path(row['path']);require(not path.is_absolute() and '..' not in path.parts and path.is_relative_to(archive/task/kind),'WRONG_COLLECTOR_ARCHIVE')
        require(str(path) not in seen_paths,'DUPLICATE_ARTIFACT');seen_paths.add(str(path))
        raw=reader(row)
        require(len(raw)==row['bytes'] and sha(raw)==row['sha256'] and row['mtimeNs']>=started_ns,'STALE_OR_UNBOUND_ARTIFACT')
        return path,raw
    # Bind the actual root legacy receipt and both exact reviewed collectors, not a free-standing JSON.
    base_fact=data['defaultTaskBaseReceipt'];require(base_fact['path']==str(EXEC/(label+'-default-task-base-results.json')),'WRONG_ROOT_BASE_RECEIPT')
    base_raw=reader(base_fact);require(sha(base_raw)==base_fact['sha256'] and len(base_raw)==base_fact['bytes'] and base_fact['mtimeNs']>=started_ns,'UNBOUND_ROOT_BASE_RECEIPT')
    base=json.loads(base_raw)
    require(all(base[k]==data[k] for k in ['command','cwd','started','sourceStable','distStable','testInputStable','testInputDigestBefore','testInputDigestAfter']) and base['exit']==data['gradleExit'],'ROOT_BASE_PROVENANCE_MISMATCH')
    provenance=json.loads((HERE/'checker-input-provenance.json').read_text())
    for field,suffix in [('legacyWrapper','run-backend.py'),('taskedWrapper','run-backend-tasked.py')]:
        row=data[field];wanted_path=next(k for k in provenance['helpers'] if k.endswith('/'+suffix))
        require(row['path']==wanted_path and row['sha256']==provenance['helpers'][wanted_path],'UNREVIEWED_COLLECTOR_INPUT')
        raw=reader(row);require(sha(raw)==row['sha256'] and len(raw)==row['bytes'],'COLLECTOR_SOURCE_HASH_MISMATCH')
    exec_tasks=[]
    for row in data['jacocoExecFiles']:
        task=row['task'];path,raw=bound(row,task,'jacoco');exec_tasks.append(task)
        require(path.name==task+'.exec' and row.get('nonempty') is True and len(raw)>0,'MISSING_ACTUAL_FRESH_EXEC')
    require(Counter(exec_tasks)==Counter(tasks),'WRONG_FRESH_EXEC_UNION')
    xml_cases=Counter();failure_tasks=set();xml_counts={};xml_files={task:0 for task in tasks}
    contract=failure_contract(source,mutation_id) if fault else None
    for row in data['xmlFiles']:
        task=row['task'];path,raw=bound(row,task,'xml');xml_files[task]+=1
        require(path.name=='TEST-'+FQCN+'.xml','WRONG_XML_CLASS_ARCHIVE')
        tree=ET.fromstring(raw);suite_counts=Counter(total=0,passed=0,failed=0,errors=0,skipped=0)
        for case in tree.iter('testcase'):
            failures=case.findall('failure')+case.findall('error');skip=case.find('skipped')
            require(len(failures)<=1 and skip is None,'SKIPPED_OR_MULTIPLE_CASE_FAILURE')
            key=(task,case.attrib['classname'],case.attrib['name']);status='FAIL' if failures else 'PASS'
            xml_cases[(*key,status)]+=1;suite_counts['total']+=1
            if failures:
                require(fault and key==(task,FQCN,'executionError') and task not in failure_tasks,'UNRELATED_CASE_FAILURE')
                validate_failure(failures[0],contract);failure_tasks.add(task)
                suite_counts['failed' if failures[0].tag=='failure' else 'errors']+=1
            else:suite_counts['passed']+=1
        for xml_key,count_key in [('tests','total'),('failures','failed'),('errors','errors'),('skipped','skipped')]:require(int(tree.attrib[xml_key])==suite_counts[count_key],'XML_SUITE_COUNT_MISMATCH')
        require(task not in xml_counts,'DUPLICATE_TASK_XML');xml_counts[task]=dict(suite_counts)
    require(xml_cases==expected_status and set(xml_counts)==set(tasks),'XML_COMPLETE_CASE_UNION')
    require(failure_tasks==(set(tasks) if fault else set()),'MISSING_EXPECTED_BOUNDARY_FAILURE')
    totals=Counter()
    for task in tasks:
        facts=data['taskResults'][task]
        require(facts['freshExec'] is True and facts['execRequired'] is True and facts['freshHtmlIndex'] is True and facts['joinCasesPresent'] is True and facts['freshJoinCohorts']==1 and facts['freshXmlFiles']==xml_files[task],'INCOMPLETE_FRESH_TASK')
        require(facts['counts']==xml_counts[task],'TASK_COUNT_UNION');totals.update(xml_counts[task])
    require(data['counts']==dict(totals),'ROOT_COUNT_UNION')
    grouped={task:{} for task in tasks};cohort_dirs={};artifacts={}
    for row in data['guidedCohortFiles']:
        task=row['task'];path,raw=bound(row,task,'cohorts')
        rest=path.relative_to(archive/task/'cohorts');require(len(rest.parts)==3,'WRONG_COHORT_ARCHIVE_DEPTH')
        run,cohort,name=rest.parts
        require(str(uuid.UUID(run))==run and str(uuid.UUID(cohort))==cohort,'WRONG_RUN_COHORT_ID')
        folder=path.parent
        require(task not in cohort_dirs or cohort_dirs[task]==folder,'MIXED_FRESH_COHORT_RUNS');cohort_dirs[task]=folder
        require(name not in grouped[task],'DUPLICATE_COHORT_ARTIFACT');grouped[task][name]=json.loads(raw);artifacts[(task,name)]=row['sha256']
    activation_hashes={};profile_facts={};gate_rejections=[]
    for task in tasks:
        files=grouped[task];require('cohort.json' in files and 'guard-tally.json' in files,'MISSING_COHORT_OR_GUARD')
        cohort=files['cohort.json'];p=profiles[task];folder=cohort_dirs[task]
        require(cohort.get('declaredOutputCeiling')==(4000 if task=='test' else 2048) and cohort['lane']==task and cohort['profile']==p['profile'] and cohort['runId']==folder.parts[-2] and cohort['cohortId']==folder.parts[-1],'COHORT_PROFILE_RUN_BINDING')
        require(all(cohort.get(k) is True for k in UNAFFECTED),'UNRELATED_COHORT_SEMANTIC_FAILURE')
        require(type(cohort.get('retentionFailures')) is int and cohort['retentionFailures']==0,'RETENTION_FAILURE')
        require(cohort.get('auditComplete') is (not fault),'WRONG_AUDIT_FAILURE_SCOPE')
        invocations=cohort['invocations'];require(Counter(invocation_key(r) for r in invocations)==Counter(invocation_key(r) for r in p['selected']),'WRONG_COHORT_INVOCATION_UNION')
        require(all(type(r['invocationOrdinal']) is int and type(r['variantOrdinal']) is int for r in invocations),'INVOCATION_NUMERIC_TYPES')
        require(Counter(r['invocationOrdinal'] for r in invocations)==Counter(range(1,p['caseCount']+1)),'WRONG_INVOCATION_ORDINALS')
        require(all(r.get('passed') is True and r.get('afterEachComplete') is True for r in invocations),'BODY_OR_AFTEREACH_FAILURE')
        require(sum(r['method']==ORDER39 for r in invocations)==p['bodyChecks'],'DEFAULT_BODY_PROVENANCE')
        expected_files={'cohort.json','guard-tally.json'}
        for invocation in invocations:
            key=f"{task}-{invocation['invocationOrdinal']}-{invocation['method']}-{invocation['variant']}"
            names=['privacy-'+key+'.json','model-budget-evidence-'+key+'-final.json','responses-'+key+'-final.json']
            for name in names:
                require(name in files,'MISSING_UNAFFECTED_FINAL_EVIDENCE');expected_files.add(name);obj=files[name]
                if name.startswith('model-budget-'):
                    require(obj.get('invocationOrdinal')==invocation['invocationOrdinal'] and obj.get('variantOrdinal')==invocation['variantOrdinal'] and obj.get('declaredFixtureCeiling')==(4000 if task=='test' else 2048) and obj.get('transportOutputCeiling',0)>=4000,'BUDGET_SOURCE_SCOPE_BINDING')
                    require(obj.get('complete') is True,'SCOPED_BUDGET_FAILURE')
                else:
                    for field,value in [('lane',task),('method',invocation['method']),('class',FQCN),('variant',invocation['variant']),('variantOrdinal',invocation['variantOrdinal']),('invocationOrdinal',invocation['invocationOrdinal'])]:require(obj.get(field)==value,'SCOPED_EVIDENCE_INVOCATION_BINDING')
                    if name.startswith('privacy-'):
                        require(obj.get('privacyComplete') is True and obj.get('producersDrained') is True and obj.get('auditComplete') is (not fault),'SCOPED_PRIVACY_FAILURE')
                    else:require(obj.get('phase')=='final' and type(obj.get('diagnosticFailures')) is int and obj['diagnosticFailures']==0,'SCOPED_RESPONSE_FAILURE')
            # Both after-each outputs are source-required on every actual passed/complete invocation.
            for prefix in ['model-budget-evidence-','responses-']:
                name=prefix+key+'-after-each.json'
                require(name in files,'MISSING_AFTER_EACH_EVIDENCE');expected_files.add(name);obj=files[name]
                require(obj.get('invocationOrdinal')==invocation['invocationOrdinal'] and obj.get('variantOrdinal')==invocation['variantOrdinal'],'AFTER_EACH_SCOPE_BINDING')
                if prefix.startswith('model'):
                    require(obj.get('complete') is True and obj.get('declaredFixtureCeiling')==(4000 if task=='test' else 2048) and obj.get('transportOutputCeiling',0)>=4000,'AFTER_EACH_BUDGET_FAILURE')
                else:
                    require(obj.get('lane')==task and obj.get('method')==invocation['method'] and obj.get('variant')==invocation['variant'] and obj.get('phase')=='after-each' and type(obj.get('diagnosticFailures')) is int and obj['diagnosticFailures']==0,'AFTER_EACH_RESPONSE_FAILURE')
        if fault:
            require('audit-final.json' not in files,'UNEXPECTED_NEGATIVE_AUDIT_FINAL')
            previous=None;activation_hashes[task]={}
            schema=json.loads((HERE/'boundary-activation.schema.json').read_text())
            for boundary in ['OWNED_SINKS','CONTEXT_CLOSED']:
                name='privacy-itr-final-fault-'+boundary+'.json';require(name in files,'MISSING_FINAL_ACTIVATION');expected_files.add(name);a=files[name]
                require(set(a)==set(schema['required']),'ACTIVATION_SCHEMA')
                require(all(type(a[k]) is int for k in ['schemaVersion','observedInvocations','expectedInvocations','bodyCorpusChecksBeforeActivation','finalCorpusChecksBeforeActivation']),'ACTIVATION_COUNTER_TYPES')
                require(a['schemaVersion']==1 and a['fault']==mutation_id and a['boundary']==boundary and a['lane']==task,'ACTIVATION_PROFILE_FAULT_BINDING')
                require(a['observedInvocations']==p['caseCount'] and a['expectedInvocations']==wanted['counts'][task] and a['actualMultiplicityComplete'] is (not subset),'ACTIVATION_CASE_UNION')
                require(a['bodyCorpusChecksBeforeActivation']==p['bodyChecks'] and a['finalCorpusChecksBeforeActivation']==0,'PROFILE_BODY_FINAL_COUNTERS')
                require(a['producersDrained'] is True and a['contextClosed'] is (boundary=='CONTEXT_CLOSED'),'BOUNDARY_DRAIN_CONTEXT')
                require(all(type(a[k]) is int and a[k]>=0 for k in ['realCanaryCount','realAdmittedCount','realDispatchedCount','contentScansBeforeActivation']),'ACTIVATION_NUMERIC_FACTS')
                require(a['realCanaryCount']==0 if subset else all(a[k]>0 for k in ['realCanaryCount','realAdmittedCount','realDispatchedCount']),'REAL_BOUNDARY_CORPUS')
                require(a['contentScansBeforeActivation']>=1 and (previous is None or a['contentScansBeforeActivation']==previous+1),'UNCONDITIONAL_CONTENT_BOUNDARIES');previous=a['contentScansBeforeActivation']
                activation_hashes[task][boundary]=artifacts[(task,name)]
        else:
            require('audit-final.json' in files,'MISSING_POSITIVE_GATE_AUDIT');expected_files.add('audit-final.json');a=files['audit-final.json']
            gate=not (mutation_id=='M-gate-false' or task=='guidedIncrementalTest')
            final=2 if gate else 0
            require(all(a.get(k) is True for k in ['auditComplete','producersDrained','contextClosed']),'UNRELATED_GATE_AUDIT_FAILURE')
            require(a['lane']==task and a['runId']==cohort['runId'] and a['cohortId']==cohort['cohortId'],'GATE_AUDIT_RUN_BINDING')
            require(a['exactLaneObserved'] is gate and a['finalCorpusControlChecks']==final and a['corpusControlChecks']==p['bodyChecks']+final and a['observedInvocations']==p['caseCount'] and a['expectedInvocations']==p['caseCount']-int(mutation_id=='M-omit-variant' and task=='guidedIncrementalTest') and a['contentScans']>=2,'EXACT_GATE_REJECTION_CONTRACT')
            if not gate:gate_rejections.append(task)
        require(set(files)==expected_files,'EXTRA_UNJOINED_COHORT_ARTIFACT')
        profile_facts[task]={'expectedActualBodyChecks':p['bodyChecks'],'exactActualCaseCount':p['caseCount'],'positiveBodyCaseProvenanceBound':True}
    if fault:
        expected_errors=Counter((task,'MISSING_FRESH_COHORT_FILE','audit-final.json') for task in tasks)
        require(Counter((r.get('task'),r.get('reason'),r.get('file')) for r in data['taskCollectionErrors'])==expected_errors and all(set(r)=={'task','reason','file'} for r in data['taskCollectionErrors']),'UNRELATED_COLLECTION_FAILURE')
        require(data['exit']!=0 and data['gradleExit']!=0 and data['taskCollectionComplete'] is False and data.get('validationSucceeded') is False,'RAW_NEGATIVE_STATUS_CHANGED')
    else:
        require(data['exit']==data['gradleExit']==0 and data['taskCollectionComplete'] is True and data['taskCollectionErrors']==[] and data.get('validationSucceeded') is True and gate_rejections,'GATE_REJECTION_STATUS')
    return dict(status='EXPECTED_NEGATIVE_EVIDENCE_RECONCILED_NOT_GATE_SUCCESS',mutation=mutation_id,acceptedMutantSha256=mutant['mutantSha256'],
       actualProfiles=profile_facts,activationReceiptHashes=activation_hashes,gateEvidenceRejectedTasks=gate_rejections,
       rawCollectorExit=data['exit'],rawGradleExit=data['gradleExit'],rawTaskCollectionComplete=data['taskCollectionComplete'],
       unaffectedFactsRequired=list(UNAFFECTED)+['zero retentionFailures','exact XML/root/cohort case union','each passed and afterEachComplete','only pinned two-node final assertion failure tree','same fresh root archive/run/cohort'],
       privateFailureDetailsExported=False,notQaVerdict=True,nativePrivacyOwnershipTimingDisposition='REMAINS_INDEPENDENT')

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('receipt',type=Path);parser.add_argument('--mutation-id',required=True);args=parser.parse_args()
    stem=args.receipt.name.removesuffix('-results.json')
    data=json.loads(args.receipt.read_text());before=json.loads(args.receipt.with_name(stem+'-before.json').read_text());after=json.loads(args.receipt.with_name(stem+'-after.json').read_text())
    print(json.dumps(reconcile(data,before,after,args.receipt.resolve(),args.mutation_id)))
if __name__=='__main__':
    try:main()
    except Exception:
        print(json.dumps({'status':'INCOMPLETE_OR_INVALID_MUTATION_PROOF','notQaVerdict':True,'privateFailureDetailsExported':False}));sys.exit(2)

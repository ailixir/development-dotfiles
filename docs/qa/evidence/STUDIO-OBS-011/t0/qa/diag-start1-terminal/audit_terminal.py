from pathlib import Path
import json,hashlib,re,stat,subprocess,datetime,collections,xml.etree.ElementTree as ET
ROOT=Path.cwd();BASE=ROOT/'docs/qa/evidence/STUDIO-OBS-011';T0=BASE/'t0';OUT=T0/'qa/diag-start1-terminal'
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_text())
def lex(s):
    # Preserve literals atomically; discard only comments/whitespace.
    pat = r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|\S'
    return [m.group() for m in re.finditer(pat,s) if not m.group().startswith(('//','/*'))]
def balanced(ts, i, a='(',b=')'):
    assert ts[i]==a
    n=0
    for j in range(i,len(ts)):
        n += ts[j]==a
        n -= ts[j]==b
        if n==0:return j
    raise AssertionError('unbalanced')
def tests(s):
    ts=lex(s); out=[]; i=0
    while i<len(ts):
        if ts[i]!='@': i+=1;continue
        j=i+2
        while j+1<len(ts) and ts[j]=='.' and re.match(r'^[\w$]+$',ts[j+1]):j+=2
        kind=''.join(ts[i+1:j])
        if kind.split('.')[-1] not in ('Test','ParameterizedTest'):i+=1;continue
        begin=i
        if ts[j]=='(':j=balanced(ts,j)+1
        ann=[]
        while ts[j]=='@':
            a=j;j+=2
            while j+1<len(ts) and ts[j]=='.' and re.match(r'^[\w$]+$',ts[j+1]):j+=2
            if ts[j]=='(':j=balanced(ts,j)+1
            ann.extend(ts[a:j])
        while ts[j]!='(':j+=1
        name=ts[j-1]; end=balanced(ts,j)
        out.append({'method':name,'headerTokens':ts[begin:end+1], 'parameterized':kind.endswith('ParameterizedTest'),'providerTokens':ann})
        i=end+1
    return out
def assertion_roots(s):
    ts=lex(s);out=[]
    for i,t in enumerate(ts):
        if (t.startswith('assertThat') or t in ('assertThrows','assertEquals','assertTrue','assertFalse','fail')) and i+1<len(ts) and ts[i+1]=='(':
            end=balanced(ts,i+1);out.append(ts[i:end+1])
    return out
def testbody(s,name):
    ts=lex(s)
    for i,t in enumerate(ts):
        if t==name and ts[i+1]=='(':
            end=balanced(ts,i+1);j=end+1
            while j<len(ts) and ts[j] not in ('{',';'):j+=1
            if j<len(ts) and ts[j]=='{':return ts[j+1:balanced(ts,j,'{','}')]
    raise AssertionError(name)
def undo_env(ts):
    members={x['afterPerClassEnvironmentMember']:x['beforeStaticField'] for x in load(BASE/'gs-t2-draft/state-reader-map.json')}
    out=[];i=0
    while i<len(ts):
        if ts[i:i+2]==['ENV','.']:
            out.append(members[ts[i+2]]);i+=3
        else:out.append(ts[i]);i+=1
    return out
def undo_directwaits(ts):
    out=[];i=0
    prefix=['org','.','awaitility','.','Awaitility','.','await','(',')']
    while i<len(ts):
        if ts[i:i+len(prefix)]!=prefix:out.append(ts[i]);i+=1;continue
        j=i+len(prefix);timeout=None;until=None
        while ts[j]=='.':
            method=ts[j+1];assert ts[j+2]=='(';end=balanced(ts,j+2);args=ts[j+3:end]
            if method=='atMost':timeout=args[args.index('ofMillis')+2]
            if method=='until':until=args;j=end+1;break
            j=end+1
        assert until and timeout and ts[j]==';'
        j+=1
        # Original helper final fresh read was expanded at each call site.
        arrow=next(k for k in range(len(until)-1) if until[k:k+2]==['-','>'])
        expr=until[arrow+2:]
        expected=['assertThat','(']+expr+[')', '.', 'isTrue','(',')',';']
        assert ts[j:j+len(expected)]==expected
        out+=['await','(']+until+[',',timeout,')',';'];i=j+len(expected)
    return out
def native_names(case, source):
    if not case['parameterized']: return [case['method']+'()']
    pt=case['providerTokens']; h=case['headerTokens'];start=h.index('(',h.index(case['method']))
    args=h[start+1:-1]; segments=[];last=0
    for i,t in enumerate(args):
        if t==',':segments.append(args[last:i]);last=i+1
    segments.append(args[last:]);params=[x[-1] for x in segments]
    if 'EnumSource' in pt:
        enumname=pt[pt.index('EnumSource')+2]; tokens=lex(source);start=tokens.index(enumname,tokens.index('enum'))+1
        assert tokens[start]=='{';end=tokens.index(';',start) if ';' in tokens[start:balanced(tokens,start,'{','}')+1] else balanced(tokens,start,'{','}')
        vals=[[x] for x in tokens[start+1:end] if re.match(r'^[A-Z_0-9]+$',x)]
    else:
        start=pt.index('{');end=balanced(pt,start,'{','}');content=pt[start+1:end]
        if 'CsvSource' in pt:
            vals=[[v.strip() for v in json.loads(t).split(',')] for t in content if t.startswith('"')]
        else:
            vals=[[json.loads(t) if t.startswith('"') else t] for t in content if t!=',']
    assert all(len(v)==len(params) for v in vals)
    return ['['+str(i+1)+'] '+', '.join(k+'='+v for k,v in zip(params,row)) for i,row in enumerate(vals)]
def apply(patch,base):
    lines=patch.splitlines(keepends=True); result={};i=0
    while i<len(lines):
        if not lines[i].startswith('--- '):i+=1;continue
        old=lines[i][4:].strip();new=lines[i+1][4:].strip();i+=2
        path=new.removeprefix('b/'); src=[] if old=='/dev/null' else base[path].decode().splitlines(keepends=True)
        dst=[];pos=0
        while i<len(lines) and not lines[i].startswith('--- '):
            m=re.match(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@',lines[i])
            if not m:i+=1;continue
            start=int(m[1])-1 if int(m[1]) else 0
            assert start>=pos,(path,start,pos)
            dst+=src[pos:start];pos=start;i+=1
            oldcount=newcount=0
            while i<len(lines) and not lines[i].startswith(('@@','--- ')):
                l=lines[i]
                if l.startswith(' '):assert src[pos]==l[1:];dst.append(l[1:]);pos+=1;oldcount+=1;newcount+=1
                elif l.startswith('-'):assert src[pos]==l[1:];pos+=1;oldcount+=1
                elif l.startswith('+'):dst.append(l[1:]);newcount+=1
                elif l.startswith('\\'):pass
                else:raise AssertionError((path,l))
                i+=1
            assert oldcount==int(m[2] or 1) and newcount==int(m[4] or 1),(path,oldcount,newcount)
        dst+=src[pos:];result[path]=''.join(dst).encode()
    return result

LABEL='obs011-diag-start1-full01'
run=T0/'early/diag-start1-harness/resume2/runs'/LABEL
hfile=run/'receipt.json';h=load(hfile)
expected_starts={48509:'Sun Oct 18 22:41:26 2026',48510:'Sun Oct 18 22:41:26 2026',50004:'Sun Oct 18 22:41:40 2026'}
process_text=subprocess.run(['ps','-p',','.join(map(str,expected_starts)),'-o','pid=,lstart='],capture_output=True,text=True).stdout
current={int(line.split(None,1)[0]):line.split(None,1)[1] for line in process_text.splitlines()}
if h.get('status')=='STARTING' or any(current.get(pid)==start for pid,start in expected_starts.items()):
    raise SystemExit('STILL_LIVE_NO_TERMINAL_ASSESSMENT')
assert h['phases'][-1]['phase']=='FINISHED' and h['collectorInvocations']==1
source=ROOT/'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'
original='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'
assert h['sourceRestored'] is True and h['originalCompileSucceeded'] is True and sha(source.read_bytes())==original and stat.S_IMODE(source.stat().st_mode)==0o644
assert sha((run/'ReplayIT.original.java').read_bytes())==original
phases={x['phase']:x for x in h['processes']}
assert set(phases)=={'diagnostic-compile','single-full-class','restored-compile'}
assert all(x['exit'] is not None for x in phases.values())
assert phases['diagnostic-compile']['exit']==0 and phases['restored-compile']['exit']==0
for phase,p in phases.items():
    assert p['terminatedAtUtc'] and p['ownedJvmTerminalProof']
    assert not p['remainingNativeOrFixtureFacts']
    proofkeys={(r['pid'],r['start']) for r in p['ownedJvmTerminalProof']}
    known={(r['pid'],r['start']) for r in p['descendants'] if r['role'] in {'GRADLE','TEST_JVM'}}
    assert proofkeys==known
    for row in p['ownedJvmTerminalProof']:
        text=subprocess.run(['ps','-p',str(row['pid']),'-o','lstart='],capture_output=True,text=True).stdout.strip()
        assert text!=row['start']
    log=run/(phase+'.private.log');assert sha(log.read_bytes())==p['logSha256']

resultfile=BASE/'execution'/(LABEL+'-results.json');r=load(resultfile)
assert r['explicitTestTasks']==['test','guidedIncrementalTest'] and set(r['requiredFreshExecTasks'])=={'test','guidedIncrementalTest'}
assert r['expectedHistoricalSkips']==[] and r['historicalSkipSource'] is None
assert r['taskCollectionComplete'] and not r['taskCollectionErrors']
started=datetime.datetime.fromisoformat(r['started']).timestamp();ended=started+r['elapsedSeconds']
groups=['xmlFiles','testHtmlFiles','jacocoExecFiles','guidedCohortFiles','guardTallies'];verified={};reused_html_assets=[]
for group in groups:
    for fact in r[group]:
        file=ROOT/fact['path'];assert not file.is_symlink() and file.stat().st_size==fact['bytes'] and sha(file.read_bytes())==fact['sha256']
        if group=='testHtmlFiles' and file.suffix in {'.css','.js'}:
            if not started<=fact['mtimeNs']/1e9<=ended+3:reused_html_assets.append(fact['path'])
        else:assert started<=fact['mtimeNs']/1e9<=ended+3
    verified[group]=len(r[group])
before=load(BASE/'execution'/(LABEL+'-before.json'));after=load(BASE/'execution'/(LABEL+'-after.json'))
assert before['files']==after['files'] and before['digest']==after['digest'] and before['dist']==after['dist']
assert r['sourceStable'] and r['testInputStable'] and r['distStable'] and r['testInputDigestBefore']==r['testInputDigestAfter']
assert 'explicitDisjointValidationExclusions' not in r
for fact in before['dist']['files']:assert sha((ROOT/'studio-runner/dist'/fact['path']).read_bytes())==fact['sha256']
assert before['dist']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210'
assert next(x['sha256'] for x in before['files'] if x['path']==str(source.relative_to(ROOT)))=='d5cafe9818f29587cd646d2ac96c70c9b2c9c47c6433645fc0b80ec84d880d6d'

gradle=(ROOT/'backend/build.gradle.kts').read_text()
def catalog(name):
    text=re.search(r'val '+name+r' = (?:setOf|listOf)\(([\s\S]*?)\n\)',gradle)[1]
    return re.findall(r'"([^"\n]+)"',text)
default=catalog('joinedDefaultMethods');incremental=catalog('joinedIncrementalMethods');prefix=catalog('joinedPrefixSyncMethods');added=catalog('joinedAddedLowMethods');labels=catalog('joinedIncrementalLabels')
expected={'test':{(m,'singleton') for m in default},'guidedIncrementalTest':{(m,'singleton') for m in [incremental[0],incremental[2],*prefix,*added]}|{(incremental[1],label) for label in labels}}
original_source=(run/'ReplayIT.original.java').read_text();source_cases=tests(original_source)
assert {c['method'] for c in source_cases}==set(default+incremental+prefix+added) and len(source_cases)==74
assert sum(c['parameterized'] for c in source_cases)==1
assert source_cases==tests((T0/'early/diag-start1-draft/repo/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java').read_text())
casebyname={c['method']:c for c in source_cases}
def original_display_names(case):
    names=native_names(case,original_source)
    if case['parameterized']:
        header=case['headerTokens'];index=header.index('name');assert header[index+1]=='='
        pattern=json.loads(header[index+2]);assert pattern=='incremental joined {0}'
        names=[pattern.replace('{0}',name.split('=',1)[1]) for name in names]
    return names
native_expected={task:[name for method in sorted({m for m,_ in ids}) for name in original_display_names(casebyname[method])] for task,ids in expected.items()}
cases=[];taskfacts={};cohorts=[]
for task in r['explicitTestTasks']:
    xmlfacts=[f for f in r['xmlFiles'] if f['task']==task];assert len(xmlfacts)==1
    suite=ET.parse(ROOT/xmlfacts[0]['path']).getroot();native=[]
    for c in suite.findall('testcase'):
        state='SKIP' if c.find('skipped') is not None else 'FAIL' if c.find('failure') is not None or c.find('error') is not None else 'PASS'
        native.append(c.attrib['name']);cases.append({'task':task,'class':c.attrib['classname'],'name':c.attrib['name'],'status':state})
    assert collections.Counter(native)==collections.Counter(native_expected[task])
    execs=[f for f in r['jacocoExecFiles'] if f['task']==task];assert len(execs)==1 and execs[0]['bytes']>0 and execs[0]['nonempty']
    cf=next(f for f in r['guidedCohortFiles'] if f['task']==task and Path(f['path']).name=='cohort.json');c=load(ROOT/cf['path']);folder=(ROOT/cf['path']).parent
    flags=['auditComplete','privacyComplete','producersDrained','modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete']
    assert all(c[k] is True for k in flags) and c['retentionFailures']==0 and c['finalScansAttempted'] is True
    inv=c['invocations'];assert len(inv)==len(expected[task]) and {(i['method'],i['variant']) for i in inv}==expected[task]
    assert all(i['passed'] is True and i['afterEachComplete'] is True for i in inv)
    assert collections.Counter(i['displayLabel'] for i in inv)==collections.Counter(native)
    assert c['runId']==folder.parent.name and c['cohortId']==folder.name and c['lane']==task
    af=load(folder/'audit-final.json');assert all(af[k] is True for k in ['auditComplete','producersDrained','contextClosed']) and af['runId']==c['runId'] and af['cohortId']==c['cohortId']
    guards=load(folder/'guard-tally.json');assert guards['testsRecorded']==len(inv)==len(guards['tests'])
    guard_expected=[i['method']+('['+i['displayLabel']+']' if i['variant']!='singleton' else '') for i in inv]
    assert collections.Counter(g['test'] for g in guards['tests'])==collections.Counter(guard_expected)
    for kind in ['passed','refused']:
        tally=collections.Counter()
        for g in guards['tests']:tally.update(g[kind])
        assert dict(tally)==guards['totals'][kind]
    assert sum(g['confirmFirst'] for g in guards['tests'])==guards['totals']['confirmFirst']
    for i in inv:
        base=task+'-'+str(i['invocationOrdinal'])+'-'+i['method']+'-'+i['variant']
        privacy=load(folder/('privacy-'+base+'.json'));assert all(privacy[k] is True for k in ['auditComplete','privacyComplete','producersDrained'])
        assert privacy['method']==i['method'] and privacy['invocationOrdinal']==i['invocationOrdinal'] and privacy['variant']==i['variant'] and privacy['lane']==task
        for stage in ['after-each','final']:
            model=load(folder/('model-budget-evidence-'+base+'-'+stage+'.json'));response=load(folder/('responses-'+base+'-'+stage+'.json'))
            assert model['complete'] is True and model['invocationOrdinal']==i['invocationOrdinal'] and model['variantOrdinal']==i['variantOrdinal']
            assert response['diagnosticFailures']==0 and response['invocationOrdinal']==i['invocationOrdinal'] and response['method']==i['method'] and response['phase']==stage and response['variant']==i['variant']
    taskfacts[task]={'total':len(native),'suiteTimeSeconds':float(suite.attrib['time']),'cohortInvocations':len(inv),'passedAndAfterEachClosed':True,'sixFlagsAndPerInvocationFilesVerified':True,'guardCaseNamesAndTotalsVerified':True,'guardTotals':guards['totals'],'execBytes':execs[0]['bytes'],'execSha256':execs[0]['sha256'],'xmlSha256':xmlfacts[0]['sha256'],'cohortSha256':cf['sha256'],'runId':c['runId'],'cohortId':c['cohortId']}
assert len(r['guardTallies'])==1 and load(ROOT/r['guardTallies'][0]['path'])==guards
key=lambda x:(x['task'],x['class'],x['name'],x['status'])
assert collections.Counter(map(key,cases))==collections.Counter(map(key,r['testcases'])) and all(c['status']=='PASS' for c in cases) and len(cases)==108
assert r['counts']=={'total':108,'passed':108,'failed':0,'errors':0,'skipped':0}
log=BASE/'execution'/(LABEL+'.log');assert sha(log.read_bytes())==r['logSha256']
taskstates={}
for line in log.read_text(errors='replace').splitlines():
    m=re.match(r'^> Task :([\w]+)(?: (.*))?$',line)
    if m:taskstates[m[1]]=m[2] or 'EXECUTED'
assert all(taskstates.get(t)=='EXECUTED' for t in ['test','guidedIncrementalTest','retainOriginalGuidedCohort','retainIncrementalGuidedCohort'])
coverage={k:taskstates.get(k,'ABSENT') for k in ['requireFreshGuidedPartitions','jacocoTestReport','jacocoTestCoverageVerification','check']}
plan=load(T0/'early/diag-start1-harness/resume2/plan.json')
for path,digest in plan['files'].items():assert sha((ROOT/path).read_bytes())==digest
actual_members={str(p.relative_to(ROOT)) for directory in plan['trees'] for p in (ROOT/directory).rglob('*') if p.is_file() or p.is_symlink()}
assert actual_members==set(plan['treeFiles'])
# Independent end census covers every recorded child identity, including previously unclassified ones.
census=subprocess.run(['ps','-axo','pid=,lstart='],capture_output=True,text=True,check=True).stdout
end_starts={int(line.split(None,1)[0]):line.split(None,1)[1] for line in census.splitlines()}
all_known={(x['pid'],x['start']) for p in h['processes'] for x in p['descendants']}
assert not any(end_starts.get(pid)==start for pid,start in all_known)
baseline=load(T0/'early/diag-start1-harness/resume2/preexisting-baseline.json')['identities']
for old in baseline:
    pid=old['pid']
    def column(name):return subprocess.run(['ps','-ww','-p',str(pid),'-o',name+'='],capture_output=True,text=True,check=True).stdout.strip()
    assert column('lstart')==old['start'] and sha(column('comm').encode())==old['commHash'] and sha(column('command').encode())==old['argvHash']
    exe=Path(column('comm')).name
    txt=subprocess.run(['/usr/sbin/lsof','-nP','-a','-p',str(pid),'-d','txt','-F','n'],capture_output=True,text=True).stdout
    matches={Path(line[1:]).resolve() for line in txt.splitlines() if line.startswith('n') and Path(line[1:]).is_absolute() and Path(line[1:]).name==exe and Path(line[1:]).is_file()}
    assert len(matches)==1;binary=matches.pop()
    assert sha(str(binary).encode())==old['executableHash'] and sha(binary.read_bytes())==old['executableFileHash']
    assert column('lstart')==old['start']
flags={k:h.get(k,False) for k in ['receiptWriteFailed','nativeOrFixtureUnresolved','interrupted','observationFailure','subprocessWaitObservationFailed','ownedIdentityObservationGap','newUnownedProjectFactsSeen','baselineIdentityDrift','hostSampleIncomplete']}
audit={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'independent final focused diagnostic/native/restoration evidence; not story or lane verdict','harnessReceiptSha256':sha(hfile.read_bytes()),'harnessStatus':h['status'],'harnessExit':h['exit'],'collectorSha256':sha(resultfile.read_bytes()),'collectorExit':r['exit'],'gradleExit':r['gradleExit'],'counts':r['counts'],'all74OriginalMethodsAnd108TaskQualifiedCasesAccounted':True,'methodCountCorrection':'73 plain @Test plus1 @ParameterizedTest; original/source/catalog sets equal74','zeroSubsetSkipsNoBorrowedPolicy':True,'manifestVerification':verified,'reusedHtmlStaticAssetsNotFreshCaseEvidence':reused_html_assets,'tasks':taskfacts,'coverageTasks':coverage,'sourceStableDuringCandidateRun':True,'distAndInputStable':True,'originalSourceRestoredSha256':sha(source.read_bytes()),'originalMode':'0644','originalCompileSucceeded':True,'allRecordedOwnedJvmsNowAbsentOrDifferentStart':True,'recordedOwnedNativeFixtureLeftovers':False,'outerObservationFlags':flags,'outerComplete':h['nativeEvidenceComplete'],'sixInheritedIdentitiesNotCleanupTargets':True,'originalB1CauseResolved':False,'wholeFreshFullCheckOrCoverageCredit':False,'W1OrLaneQaLifecycleApproval':False}
audit['recordedOwnedChildIdentityCountNowAbsentOrDifferentStart']=len(all_known)
audit['all6InheritedFullIdentitiesIndependentlyStillMatched']=True
audit['all1240PinnedInputsAndTreeMembershipRestoredCurrent']=True
(OUT/'terminal-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print(json.dumps(audit,indent=2))


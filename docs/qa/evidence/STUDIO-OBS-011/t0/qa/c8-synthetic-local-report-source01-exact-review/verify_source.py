"""Finite public-source integrity/AST/schema review. Executes no target definitions."""
from pathlib import Path
import ast,json,hashlib,stat
OUT=Path(__file__).parent;T0=OUT.parents[1]
SRC=T0/'early/c8-synthetic-local-report-prep/resume1'
PEER=T0/'resume-architecture/resume2/c8-synthetic-local-report-source01-exact-review'
CHECKS=[];PINS=[]
def sha(raw):return hashlib.sha256(raw).hexdigest()
def check(ok,name):
    CHECKS.append(dict(id=name,passed=ok is True))
    if ok is not True:raise RuntimeError(name)
def pin(path,expected=None):
    raw=path.read_bytes();s=path.stat();row=dict(path=str(path),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(s.st_mode))
    if expected is not None:
        for k in ('sha256','bytes','mode'):check(row[k]==expected[k],str(path)+':'+k)
    PINS.append(row);return raw
manifest_raw=pin(SRC/'manifest.json');check(sha(manifest_raw)=='bf6ff7d9cd627c40c6df37c9edc841cb7242170a287d3d15c9f1681899d764b7','subject-manifest')
manifest=json.loads(manifest_raw);files={}
check(len(manifest['files'])==48,'subject-48-members')
for row in manifest['files']:
    check(row['path'] not in files,'unique:'+row['path']);files[row['path']]=pin(SRC/row['path'],row)
check(set(p.name for p in SRC.iterdir())==set(files)|{'manifest.json','SHA256SUMS'},'subject-exact-membership')
sums=pin(SRC/'SHA256SUMS');lines=sums.decode().splitlines()
check(len(lines)==49,'subject-49-checksum-lines')
for line in lines:
    digest,name=line.split('  ',1);raw=manifest_raw if name=='manifest.json' else files[name]
    check(sha(raw)==digest,'checksum:'+name)
check(b"path.name in ('manifest.json','SHA256SUMS')" in files['seal_packet.py'],'explicit-no-integrity-cycle-policy')
peer_raw=pin(PEER/'manifest.json');check(sha(peer_raw)=='69f7fbd9835e5c8953b85b3362c4fa4c92c86fdcee77bb8008c60e435deca444','peer-manifest')
peer=json.loads(peer_raw)
for row in peer['files']:pin(PEER/row['path'],row)
for row in json.loads(files['verified-preparation-inputs.json']):
    path=Path(row['path'])
    check(str(path).startswith(str(T0.resolve())+'/') and '/runtime/' not in str(path) and 'preexisting-baseline' not in str(path),'public-preparation-input:'+path.name)
    pin(path,row)
trees={}
for name,raw in files.items():
    if name.endswith('.json'):json.loads(raw);check(True,'json-parse:'+name)
    if name.endswith('.py'):
        tree=ast.parse(raw,filename=name);trees[name]=tree
        check(not any(isinstance(n,ast.Assert) for n in ast.walk(tree)),'no-removable-assert:'+name)
methods=[]
for name in ('entry.py','profile.py','qualification_custody.py','storage.py','runtime.py','mode_predicates.py','controls.py'):
    def visit(node,prefix=''):
        for n in getattr(node,'body',[]):
            if isinstance(n,(ast.FunctionDef,ast.ClassDef)):
                full=prefix+n.name
                methods.append(dict(file=name,name=full,line=n.lineno,kind=type(n).__name__,calls=sorted({ast.unparse(c.func) for c in ast.walk(n) if isinstance(c,ast.Call)}) if isinstance(n,ast.FunctionDef) else []))
                if isinstance(n,ast.ClassDef):visit(n,full+'.')
    visit(trees[name])
declared=json.loads(files['finite-method-dependency-map.json'])
check(methods==declared['methods'],'complete-method-call-map-equality')
for row in methods:check(row in declared['methods'],'method:'+row['file']+':'+row['name'])
schema=json.loads(files['claim.schema.json'])
check(len(schema['properties']['guarantees']['properties'])==10,'ten-false-guarantees')
for name,row in schema['properties']['guarantees']['properties'].items():check(row=={'const':False},'false-guarantee:'+name)
for name,row in schema['properties']['unsupportedEvidence']['properties'].items():check(row['const']==dict(value=None,reason='NOT_PROVED_BY_SYNTHETIC_LOCAL_REPORT_PROFILE'),'unsupported-null:'+name)
for name in ('identityComplete','kernelIdentityComplete','C8','credit','cleanupAuthorized'):check(schema['properties'][name]=={'const':False},'false-envelope:'+name)
check(schema['properties']['historicalIdentityUncertainty']=={'const':True},'history-uncertainty')
entry=files['entry.py'].decode();caller=files['root-caller.bash'].decode();template=files['root-caller.template.bash'].decode()
literal="readonly C8_S0_ENTRY='"+entry.replace("'","'\"'\"'")+"'"
check(caller==template.replace('# @LITERAL_VERIFIED_ENTRY_ASSIGNMENT@',literal),'exact-consumed-entry-shell-literal')
caller_map=json.loads(files['caller-literal-map.json'])
check(caller_map['callerSha256']==sha(files['root-caller.bash']) and caller_map['callerBytes']==len(files['root-caller.bash']),'caller-map')
check(caller_map['firstReadCap']==len(files['root-caller.bash'])+1,'bounded-shell-read')
for name,digest in [('observer-fragment.java.txt','0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66'),('ObserverBoundaryHarness.java','82a90d1a0925e8118cb146d652c73bf2a3a748a1df2de89337e7a9e50d73f25f')]:check(sha(files[name])==digest,'frozen:'+name)
prior=T0/'early/c8-public-observer-java-qualification-prep/resume2'
for name in ('ObserverBoundaryHarness.java','observer-fragment.java.txt','java-harness-body.java.txt','tls-driver.java.txt','public_contract.py','public-observation.schema.json','qualification_custody.py'):
    check(files[name]==pin(prior/name),'unchanged-reused-source:'+name)
checks2=json.loads(files['fake-results-attempt2.json']);history=json.loads(files['attempt-history.json'])
check(checks2['executedCases']==24 and checks2['failures']==0 and checks2['checks']==26849 and checks2['deniedHostEvents']==[],'author-exact-fake-attempt2')
check(history['attempts'][0]['actualExit']==1 and history['attempts'][0]['contemporaneousSourceHashesCaptured'] is False,'author-attempt1-preserved')
for name,digest in checks2['sourceHashes'].items():check(sha(files[name])==digest,'author-current-source:'+name)
def function(file,klass,name):
    tree=trees[file]
    body=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name==klass).body if klass else tree.body
    return next(n for n in body if isinstance(n,ast.FunctionDef) and n.name==name)
def calls(node):return [(ast.unparse(n.func),n.lineno) for n in ast.walk(node) if isinstance(n,ast.Call)]
runtime=files['runtime.py'].decode();storage=files['storage.py'].decode();java=files['observer-fragment.java.txt'].decode()
facts={}
facts['utilityAcquiresBeforeSizeCheck']='out,err=child.communicate(timeout=15)' in runtime and runtime.index('out,err=child.communicate(timeout=15)')<runtime.index('len(out)<=16777216')
facts['bareWriteFinallyClose']='try:self.write_fd(sink,raw)\n        finally:self.close_sink(sink)' in storage
facts['selfUtf8EncodeBeforeByteBound']=runtime.index("raw=value.encode('utf-8','strict')")<runtime.index('if len(raw)>4096:')
facts['postcloseLaunchRequiresDeadHeldParent']="release['holder']['shell']['pid']==desc['expectedShellPid']" in entry and "os.getppid()==desc['expectedShellPid']" in entry
facts['predecessorHistoryOnlyCapture']='captures=self.matched(inputs[\'capture\']' in runtime and 'self.history(inputs)' not in ast.get_source_segment(runtime,function('runtime.py','Unit','archive'))
facts['directoryNoReserve']=not any(name=='budget.reserve' for name,line in calls(function('storage.py','Storage','inventory')))
facts['directoryNamesAllocatedBeforeCount']=b'names = self.os.listdir(self.fd)' in files['qualification_custody.py']
facts['knownUnknownDispositionUnimplemented']='UNIMPLEMENTED' in files['REVIEW-AND-ACTUAL-OBLIGATIONS.md'].decode().upper()
facts['ownerReadAfterModuleInterpretation']=entry.index('p,k,f,m,c,r=modules(buffers)')<entry.index('unit=r.Unit(') and 'self.owners()' in runtime
facts['leaseCheckedBeforeSetupOnly']=not any(name=='time.time' for name,line in calls(function('runtime.py','Unit','native'))) and not any(isinstance(n,ast.Constant) and n.value=='lease' or isinstance(n,ast.Name) and n.id=='lease' for n in ast.walk(function('runtime.py','Unit','current')))
facts['relayPythonRequiresPath']= "env.get('CHECKS_PUBLIC_OBSERVER_CONTROL')==r['launchControlPin']['path']" in runtime
facts['relayJavaRequiresBase64Bytes']='java.util.Base64.getUrlDecoder().decode(launch)' in java and 'pin.equals(p3PublicSha(raw))' in java and 'raw.length > 4096' in java
facts['fakeRelayFramesBypassJava']="self.connection.inbound=frame(data)+frame(commit)" in files['fake_check.py'].decode()
for name,value in facts.items():check(value is True,'source-counterexample:'+name)
limits=json.loads(files['role-input-phase-map.json']);check(limits['JavaModes']['actualExecuted']==0 and limits['JavaModes']['status']=='UNEXECUTED_OWED','all-nine-actual-owed')
result=dict(kind='QUINN_FINITE_COMPLETE_SOURCE_REVIEW',checks=len(CHECKS),failures=0,checksDetailed=CHECKS,pins=PINS,
    completeSubjectPayloads=48,subjectChecksumRows=49,completeSourceMethods=len(methods),completeMethodMap=methods,
    preparationInputPins=200,peerPayloads=len(peer['files']),boundaryFacts=facts,
    targetDefinitionsExecuted=0,actualRuntime=0,actualJava=0,actualModes=0,newOwnerRulings=0,
    reviewerReadFailure='Wrong guessed prior QA review.json path was absent (e0652e); corrected via rg to exact review-record.json/findings.json. No target action/source change.')
(OUT/'finite-results.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
print(json.dumps(dict(checks=len(CHECKS),payloads=48,checksumRows=49,preparationPins=200,methods=len(methods),failures=0)))

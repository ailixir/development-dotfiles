"""Independent source/AST and in-memory controls. No helper import/main/private OS IO."""
from pathlib import Path,PurePosixPath
from types import ModuleType,SimpleNamespace
import ast,copy,datetime,hashlib,json,os,re,stat,sys
import xml.etree.ElementTree as ET

ROOT=Path.cwd();T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
PKG=T0/'early/order11-snapshot-manifest-capture'
OLD=T0/'early/order11-existing-evidence-projection/resume2'
OUT=T0/'qa/order11-snapshot-manifest-review'
checks=[];seals={}
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
    # Only caller-specified public SOURCE/package paths; never native TEMP or runtime private inputs.
    assert p.is_relative_to(ROOT)
    assert not p.is_symlink()
    a=p.stat();data=p.read_bytes();b=p.stat()
    assert (a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns)==(b.st_ino,b.st_size,b.st_mtime_ns,b.st_ctime_ns)
    rec={'sha256':sha(data),'bytes':len(data),'mode':f'{stat.S_IMODE(a.st_mode):04o}'}
    if p in seals:assert seals[p]==rec
    seals[p]=rec;return data
def check(name,value):
    assert value,name
    checks.append(name)
def load(p):return json.loads(read(p))
def write(name,value):
    fd=os.open(OUT/name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(value,f,indent=2);f.write('\n')
context=read(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/order11-snapshot-manifest-review-context.txt').decode()
for path,digest in re.findall(r'^(.+) SHA256 ([a-f0-9]{64})$',context,re.M):check('dispatch pin '+Path(path).name,sha(read(ROOT/path))==digest)
manifest=load(PKG/'manifest.json')
for path,digest in manifest['files'].items():check('sealed current '+path,sha(read(PKG/path))==digest)
bindings=load(PKG/'bindings.json')
for path,digest in bindings.items():check('source/public pin '+path,sha(read(ROOT/path))==digest)
for row in load(OLD/'manifest.json')['files'] if isinstance(load(OLD/'manifest.json')['files'],list) else []:pass
old_manifest=load(OLD/'manifest.json')
if isinstance(old_manifest['files'],dict):
    for path,digest in old_manifest['files'].items():check('retained core package '+path,sha(read(OLD/path))==digest)

core_text=read(OLD/'project_existing.py').decode();contract=load(OLD/'source-contract.json')
check('exact reviewed core',sha(core_text.encode())=='dc9dd58361c17f2efd4e298a925b3b6e891991963072dcdca5a01cf81d0f39f5')
check('exact reviewed core contract',sha(read(OLD/'source-contract.json'))=='64b739b6c66e5f72c18a2cd344b2cba6eaab9d2721ff10860f0f4dfdb5446bd7')
loader_tree=ast.parse(read(PKG/'load_core.py'))
load_node=next(x for x in loader_tree.body if isinstance(x,ast.FunctionDef) and x.name=='load')
# Review the loader's explicit definition allowlists and writer-only adaptation. Do not call load().
core_tree=ast.parse(core_text)
classes={'Refused','ClosedArgumentParser','ExactIO'}
functions={'require','digest','stable_stat','canonical','keys','integer','pairs','decode','uuid_text','scope_contract','preauthorize','authorize','numbers','snapshot','instant_ns','owned_producer','validate_manifest'}
constants={'SOURCE_PATHS','FQCN','ROLES','SAFE','SHA','OPERATIONS'}
P=ModuleType('independent_source_only_core');P.__dict__.update(HERE=PKG,ROOT=ROOT,C=copy.deepcopy(contract))
core_nodes=[x for x in core_tree.body if isinstance(x,(ast.Import,ast.ImportFrom)) or isinstance(x,ast.ClassDef) and x.name in classes or isinstance(x,ast.FunctionDef) and x.name in functions or isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id in constants for t in x.targets)]
exec(compile(ast.Module(body=core_nodes,type_ignores=[]),'<independent-reviewed-pure-and-FD-definitions>','exec'),P.__dict__)
check('no core entrypoint or module input executed','main' not in P.__dict__ and 'local_bindings' not in P.__dict__ and 'project_bundle' not in P.__dict__)
check('retained FD definition literal exact',ast.dump(next(x for x in core_nodes if isinstance(x,ast.ClassDef) and x.name=='ExactIO'),include_attributes=False)==ast.dump(next(x for x in core_tree.body if isinstance(x,ast.ClassDef) and x.name=='ExactIO'),include_attributes=False))
loader=read(PKG/'load_core.py').decode()
check('writer adaptation fixed names/validator only',"n.value=='projection.json'" in loader and "n.id=='validate_output'" in loader and "writer.args.args.append(ast.arg(arg='filename'))" in loader)
helper_text=read(PKG/'capture_snapshot.py').decode();helper_tree=ast.parse(helper_text)
P.C['purpose']='ORDER11_SNAPSHOT_FACTS_MANIFEST_CAPTURE'
H=ModuleType('independent_snapshot_definitions');H.__dict__.update(P=P,HERE=PKG,ROOT=ROOT,Path=Path,PurePosixPath=PurePosixPath,argparse=P.argparse,datetime=datetime,hashlib=hashlib,json=json,os=os,re=re,stat=stat,sys=sys,ET=ET)
new_nodes=[]
allowed_constants={'PURPOSE','CONDITIONAL','XML_PATH','SNAPSHOT','TARGET','PINS','BINDING_PATHS','base_scope'}
for n in helper_tree.body:
    if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and getattr(n,'name','') not in {'main','local_bindings'}:new_nodes.append(n)
    elif isinstance(n,ast.Assign):
        if any(isinstance(t,ast.Name) and t.id in allowed_constants for t in n.targets):new_nodes.append(n)
        elif any(isinstance(t,ast.Attribute) and isinstance(t.value,ast.Name) and t.value.id=='P' and t.attr in {'scope_contract','validate_document'} for t in n.targets):new_nodes.append(n)
exec(compile(ast.Module(body=new_nodes,type_ignores=[]),'<independent-new-helper-pure-definitions-no-main>','exec'),H.__dict__)
check('no helper CLI/local binding executed','main' not in H.__dict__ and 'local_bindings' not in H.__dict__)
BASE=copy.deepcopy(P.C)
class ForbiddenPrivateOS:
    def getuid(self):return 123
    def fstat(self,fd):return SimpleNamespace(st_dev=3,st_ino=4,st_uid=123,st_mode=stat.S_IFDIR|0o700)
    def __getattr__(self,key):raise AssertionError('Actual OS operation forbidden in synthetic controls: '+key)
P.os=ForbiddenPrivateOS()
class IO:
    def __init__(self,f):self.f=f
    def read_public(self,alias):self.f['calls'].append('public:'+alias);return self.f['public'][alias]
    def claim_output(self,permit):
        self.f['calls'].append('claim')
        if self.f.get('claimed'):raise P.Refused('SYNTHETIC_OUTPUT_REUSED')
        self.f['claimed']=True
    def read_control(self,permit):self.f['calls'].append('control');return P.canonical(self.f['control'])
    def read_xml(self,permit):return self.f['xml'],self.fact('default_xml',H.XML_PATH,self.f['xml'])
    def _dirs(self,path):assert path==self.f['temp'];return [{'fd':99}]
    def _check_chain(self,chain):pass
    def _close_chain(self,chain):pass
    def fact(self,role,path,raw):return {'role':role,'path':path,'sha256':sha(raw),'bytes':len(raw),'mode':0o600,'dev':3,'ino':10+len(role),'uid':123}
    def read_child(self,chain,path,cap,role,required_mode=None):
        self.f['calls'].append('role:'+role)
        if role in self.f.get('faults',{}):raise self.f['faults'][role]
        raw=self.f['inputs'][role];assert len(raw)<=cap
        return raw,self.fact(role,path,raw)
    def write_doc(self,out,filename):H.validate_document(out);self.f['outputs'].append((filename,copy.deepcopy(out)))
def packet(optional=False):
    P.C=copy.deepcopy(BASE)
    temp='/synthetic/obs007-joined-review-only'
    snapshot={'schemaVersion':1,'sessionId':'00000000-0000-4000-8000-000000000018','testId':'00000000-0000-4000-8000-000000000004','testMethod':P.C['method'],'state':'FAILED','errorCode':'OTHER','bootstrapPhase':'ALLOCATED','publicationSnapshotPresent':False,'publicationRevisionPresent':False,'materializationPresent':True,'counters':{},'coordinate':{},'observationCounts':{},'acquisition':{},'activeAcquisition':{},'fixtureModelHttpCalls':1,'fixturePhysicalProviderReads':0,'fixtureProviderFailures':0,'fixtureModelKinds':{},'actions':[],'obligationAdmissions':[],'modelAttempts':[]}
    tree=ET.Element('testsuite',tests='46',failures='1',errors='0');case=ET.SubElement(tree,'testcase',classname=P.FQCN,name=P.C['method']+'()');ET.SubElement(case,'failure',type='org.opentest4j.AssertionFailedError',message='[second explicit learning; logs '+temp+'] ')
    xml=ET.tostring(tree);P.C['publicFacts']['xmlSha256']=sha(xml)
    f={'temp':temp,'snapshot':snapshot,'xml':xml,'control':{'schemaVersion':1,'target':copy.deepcopy(H.TARGET),'provenanceBasis':H.CONDITIONAL,'expectedRoot':None,'expectedIds':None},'calls':[],'outputs':[],'optional':optional,'released':True,'rootApproved':True,'quinnApproved':True,'faults':{}}
    event={'role':'guided','generation':2,'pid':123,'started':'2026-10-19T00:00:00Z','wrapperSha256':'b'*64,'configSha256':'c'*64,'commandSha256':'d'*64,'poolSize':1,'readinessNonceHash':'e'*64,'readyPort':4000,'ownedTemp':temp}
    f['events']=[dict(event,event='SPAWN',alive=True),dict(event,event='READY',alive=True),dict(event,event='EXIT_CONFIRMED',alive=False)]
    return f
def sign(f):
    f['inputs']={'snapshot_initial18':P.canonical(f['snapshot']),'owned_events':b''.join(P.canonical(e)+b'\n' for e in f['events']),'guided_log':b'synthetic opaque bytes with no startup record\n'}
    local={'parserSha256':sha(read(PKG/'capture_snapshot.py')),'packageManifestSha256':sha(read(PKG/'manifest.json')),'sourceBindingsSha256':sha(read(PKG/'bindings.json'))};f['local']=local
    command=['caffeinate','-i','./gradlew','--continue','check','--rerun-tasks','--no-daemon']
    receipt={'command':command,'sourceStable':True,'distStable':True,'testInputStable':True,'explicitTestTasks':['test','guidedIncrementalTest','crossReplicaTest'],'exit':1,'gradleExit':1,'taskCollectionComplete':False,'testcases':[{'task':'test','class':P.FQCN,'name':P.C['method']+'()','status':'FAIL'}]}
    before={'digest':P.C['sourceDigest'],'dist':{'digest':P.C['distDigest']},'files':[]};after=copy.deepcopy(before)
    terminal={'schemaVersion':1,'executionLabel':P.C['executionLabel'],'rawReceiptSha256':sha(P.canonical(receipt)),'nativeCommandSha256':sha(P.canonical(command)),'sourceDigest':P.C['sourceDigest'],'distDigest':P.C['distDigest'],'originalProtocolSha256':P.C['originalProtocolSha256'],'collectorTerminal':True,'sameStartOwnedJvmTerminal':True,'ownedUnknownTerminal':True,'wholeExecutionClosed':True,'terminalInferredFromTimeout':False,'sourceHoldVerified':True,'quotesHelmHelpersHeld':True,'observationGapSticky':True,'authoritativeClosureEvidenceSha256':[H.PINS['freshInputsSha256'],H.PINS['closedRootTerminalProofSha256']],'completedAtUtc':'2026-10-19T11:59:00+00:00'}
    terminal.update(f.get('terminalEdit',{}))
    assessment={'schemaVersion':1,'executionLabel':P.C['executionLabel'],'rawReceiptSha256':sha(P.canonical(receipt)),'nativeCommandSha256':sha(P.canonical(command)),'sourceDigest':P.C['sourceDigest'],'distDigest':P.C['distDigest'],'terminalProofSha256':sha(P.canonical(terminal)),'wholePublicArchiveFrozen':True,'wholePublicAssessmentComplete':True,'rawFailPreserved':True,'observationGapPreserved':True,'noLaneApproval':True};assessment.update(f.get('assessmentEdit',{}))
    scope={'purpose':H.PURPOSE,'executionLabel':P.C['executionLabel'],**local,'sourceDigest':P.C['sourceDigest'],'distDigest':P.C['distDigest'],'nativeCommandSha256':sha(P.canonical(command)),'rawReceiptSha256':sha(P.canonical(receipt)),'beforeSha256':sha(P.canonical(before)),'afterSha256':sha(P.canonical(after)),'terminalProofSha256':sha(P.canonical(terminal)),'publicAssessmentSha256':sha(P.canonical(assessment)),'captureControlSha256':sha(P.canonical(f['control'])),'originalProtocolSha256':P.C['originalProtocolSha256'],'allowedRoles':sorted(P.ROLES),'issuedAtUtc':'2026-10-19T12:00:00+00:00','expiresAtUtc':'2026-10-19T12:30:00+00:00',**H.PINS,'optionalCorrelation':f['optional'],'journalAuthority':'ONE_FIXED_OWNED_JOURNAL_GUIDED_INTERVAL_ONLY' if f['optional'] else 'NONE'};scope.update(f.get('scopeEdit',{}))
    request=sha(P.canonical(scope));root={'schemaVersion':1,'role':'ROOT','approved':f['rootApproved'],'scopeSha256':request};quinn={'schemaVersion':1,'role':'QUINN','approved':f['quinnApproved'],'scopeSha256':request}
    auth={'schemaVersion':1,'released':f['released'],'scope':scope,'rootApprovalSha256':sha(P.canonical(root)),'quinnApprovalSha256':sha(P.canonical(quinn))}
    f['public']={k:P.canonical(v) for k,v in dict(authorization=auth,root_approval=root,quinn_approval=quinn,terminal=terminal,assessment=assessment,receipt=receipt,before=before,after=after).items()};f['expected']={k:sha(f['public'][k]) for k in ['authorization','root_approval','quinn_approval']}
results=[]
def vector(name,edit=None,optional=False,want=True,wantcode=0):
    f=packet(optional)
    if edit:edit(f)
    sign(f);out=None;reason=None;code=None
    try:out,code=H.run(IO(f),f['expected'],f['local'],datetime.datetime.fromisoformat('2026-10-19T12:00:01+00:00'));accepted=True
    except P.Refused as e:accepted=False;reason=str(e)
    check('synthetic '+name,accepted is want and (not accepted or code==wantcode))
    if out:
        encoded=P.canonical(out)
        check('public identity redaction '+name,f['temp'].encode() not in encoded and f['snapshot']['sessionId'].encode() not in encoded and out['snapshot']['externalUuidJoinProved'] is False and out['cause']=='UNPROVEN')
    if not optional:check('snapshot-only has no optional-role read '+name,not any(x in f['calls'] for x in ['role:owned_events','role:guided_log']))
    results.append({'name':name,'accepted':accepted,'code':code,'reason':reason,'syntheticReads':[x for x in f['calls'] if x.startswith('role:')],'protectedControlRead':'control' in f['calls'],'optionalStatus':None if out is None else out['optionalCorrelation'],'actualPrivateOSIO':0})
    return f,out,code
vector('snapshot-without-warning-startup-or-preknown-ID')
vector('OTHER-is-not-no-error')
f,out,_=vector('missing-numerics-not-zero');check('missing numeric dictionary remains omitted',P.snapshot(f['inputs']['snapshot_initial18'])['counters']=={})
vector('different-wellformed-opaque-ID-remains-conditional',lambda f:f['snapshot'].update(sessionId='00000000-0000-4000-8000-000000000099'))
for field in ['state','errorCode','bootstrapPhase','sessionId','testId','modelAttempts']:
    vector('required snapshot field missing '+field,lambda f,k=field:f['snapshot'].pop(k),want=False)
for field,value in [('captureFailure',True),('message','SYNTHETIC_SECRET'),('executions',[]),('errorCode','SYNTHETIC_SECRET'),('testMethod','other'),('sessionId','not-uuid'),('continuation','STOPPED')]:
    vector('reject partial or unknown '+field,lambda f,k=field,v=value:f['snapshot'].update({k:v}),want=False)
for field,value in [('invocationOrdinal',13),('sessionOrdinal',19),('scopeOrdinal',3),('variantOrdinal',True)]:
    vector('wrong control target '+field,lambda f,k=field,v=value:f['control']['target'].update({k:v}),want=False)
for attr in ['released','rootApproved','quinnApproved']:
    f,_,_=vector('false release gate '+attr,lambda f,k=attr:f.update({k:False}),want=False)
    check('false gate has zero protected input reads '+attr,'control' not in f['calls'] and not any(x.startswith('role:') for x in f['calls']))
for flag in ['collectorTerminal','sameStartOwnedJvmTerminal','ownedUnknownTerminal','wholeExecutionClosed','sourceHoldVerified','quotesHelmHelpersHeld']:
    f,_,_=vector('false whole closure '+flag,lambda f,k=flag:f.update(terminalEdit={k:False}),want=False)
    check('closure gate zero protected input '+flag,'control' not in f['calls'])
for edit in [{'purpose':'OLD_PURPOSE'},{'expiresAtUtc':'2026-10-19T12:00:00+00:00'},{'optionalCorrelation':True,'journalAuthority':'NONE'},{'freshInputsSha256':'0'*64}]:
    vector('bad scope '+str(list(edit)),lambda f,e=edit:f.update(scopeEdit=e),want=False)
vector('whole-public-assessment-not-certified',lambda f:f.update(assessmentEdit={'wholePublicAssessmentComplete':False}),want=False)
vector('one-shot-output-refuses',lambda f:f.update(claimed=True),want=False)
vector('optional-unique-manifest-with-no-startup-record',optional=True)
vector('optional-missing-journal-retains-facts',lambda f:f['faults'].update(owned_events=FileNotFoundError()),optional=True)
vector('optional-ambiguous-journal-retains-facts',lambda f:f['events'].append(copy.deepcopy(f['events'][0])),optional=True)
vector('optional-close-fault-is-nonzero',lambda f:f['faults'].update(owned_events=P.Refused('INPUT_CLOSE_FAILURE')),optional=True,wantcode=2)
finding_cases=[]
for role in ['owned_events','guided_log']:
    for code in ['INPUT_READ_CHANGED','INPUT_LEAF_SUBSTITUTED','INPUT_OPENED_IDENTITY_MISMATCH','INPUT_APPROVED_FD_BINDING','DIRECTORY_ENTRY_SUBSTITUTED']:
        _,out,result=vector('counterexample optional '+role+' '+code,lambda f,r=role,c=code:f['faults'].update({r:P.Refused(c)}),optional=True)
        finding_cases.append({'role':role,'fault':code,'actualCode':result,'requiredCode':'NONZERO_INCOMPLETE','actualReason':out['optionalCorrelation']['reason']})
check('optional IO finding reproduced for ten retained-FD faults',len(finding_cases)==10 and all(x['actualCode']==0 for x in finding_cases))
for name,expected in [('root-authorization.example.json',False),('root-approval.example.json',False),('quinn-approval.example.json',False)]:
    value=load(PKG/'examples'/name);check('false template '+name,value['released' if name.startswith('root-authorization') else 'approved'] is expected)
check('snapshot branch is syntactically gated',"if permit['scope']['optionalCorrelation']:" in helper_text and "scope.get('journalAuthority')==('ONE_FIXED_OWNED_JOURNAL_GUIDED_INTERVAL_ONLY' if scope['optionalCorrelation'] else 'NONE')" in helper_text)
check('only fixed private filenames and no enumeration',"io.read_child(chain,SNAPSHOT" in helper_text and "io.read_child(chain,'owned-worker-generations.jsonl'" in helper_text and not any(x in helper_text for x in ['.glob(','.rglob(','.iterdir(','listdir(','scandir(']))
for path,record in list(seals.items()):check('final preserved '+path.name,sha(read(path))==record['sha256'])
result={'scope':'INDEPENDENT_SOURCE_AST_SYNTHETIC_ONLY','checksPassed':len(checks),'checks':checks,'pureSyntheticVectors':results,'counterexamples':finding_cases,'helperSha256':sha(read(PKG/'capture_snapshot.py')),'manifestSha256':sha(read(PKG/'manifest.json')),'sourceBindingsSha256':sha(read(PKG/'bindings.json')),'snapshotOnlyConditionalStaticReady':True,'optionalManifestConditionalStaticReady':False,'requiredFindings':[{'id':'SNAP-MANIFEST-IO-01','reachableWhenOptionalCorrelation':True,'reachableWhenSnapshotOnly':False}],'actualPrivateEnumerationStatOpenReadGlobCopyExport':0,'helperMainOrCLIExecuted':False,'authorContractLoopsExecuted':False,'ownOSPrivateMethodsCalled':0,'actualPacketReviewed':False,'executionReleased':False,'newNativeOrSourceAction':False,'sourceInputSeals':[{'path':str(p.relative_to(ROOT)),'fact':v} for p,v in seals.items()]}
write('audit.json',result)
print(json.dumps({k:result[k] for k in ['checksPassed','snapshotOnlyConditionalStaticReady','optionalManifestConditionalStaticReady','requiredFindings']}))

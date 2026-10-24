"""Frozen Gateway red01 adjudication; no current process/W/lock/baseline operations."""
from pathlib import Path,PurePosixPath
from collections import Counter
import ast,builtins,hashlib,json,os,re,stat,sys
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0').absolute();E=D/'runtime/obs009-gateway80-offtree03-20261019';P=D/'early/gateway80-proof-prep/resume6';O=Path(__file__).absolute().parent
indexpath=D/'resume2-gateway80-resume6-red01-terminal-index.json';indexraw=indexpath.read_bytes();assert hashlib.sha256(indexraw).hexdigest()=='67994db98e1cf81d6aabd60899333f3979fd9993eae8b756211c434095288228';index=json.loads(indexraw)
source_names=['manifest.json','contracts.py','case-map.json','run-private.py','verified-inputs.py','capture-admission.py','final-controls.py','guard-exit.bash','banks/integrations.test.ts','scope.json']
extra=[D/'resume2-gateway80-resume6-red01-failed-terminal-assessment.json',D/'early/gateway80-root-after-negative-held-06.py',D/'early/gateway80-root-admission-01.py',D/'resume2-c8-check01-qualified-failed-resource-root-adoption.json',D/'early/c8-check01-failed-resource-prep/resume4/manifest.json',D/'early/c8-check01-failed-resource-prep/resume4/RECIPE.md',D/'qa/gateway80-resume6-exact-review/manifest.json',D/'resume-architecture/resume2/gateway80-resume6-exact-review/manifest.json']
allowed={str(E/r['path']) for r in index['members']}|{str(P/n) for n in source_names}|{str(p) for p in extra}|{str(indexpath)}
denied=[]
def audit(event,args):
 if event=='open':
  name,mode,flags=args
  if isinstance(name,int):raise AssertionError('UNEXPECTED_REAL_FD')
  path=Path(name).absolute();write=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
  ok=(O==path or O in path.parents) if write else str(path) in allowed
  if not ok:denied.append(event);raise AssertionError('UNAUTHORIZED_PATH_ACCESS')
 if event.startswith(('subprocess.','socket.','os.kill','os.system','os.posix_spawn')) or event in ('fcntl.flock','fcntl.lockf'):
  denied.append(event);raise AssertionError('OPERATION_FORBIDDEN')
sys.addaudithook(audit)
checks=[];pins=[];values={}
def check(name,ok):assert ok,name;checks.append({'check':name,'passed':True})
def bound(path,expected=None):
 st=path.lstat();check('regular named input '+path.name,not stat.S_ISLNK(st.st_mode) and stat.S_ISREG(st.st_mode))
 raw=path.read_bytes();h=hashlib.sha256(raw).hexdigest()
 if expected is not None:check('exact named input hash '+path.name,h==expected)
 pins.append({'path':str(path.relative_to(Path.cwd())),'sha256':h,'bytes':len(raw),'mode':stat.S_IMODE(st.st_mode)});return raw
bound(indexpath,'67994db98e1cf81d6aabd60899333f3979fd9993eae8b756211c434095288228')
check('exact frozen member count',len(index['members'])==2263)
seen=set();buffers={}
for row in index['members']:
 name=row['path'];pp=PurePosixPath(name)
 check('canonical direct E member',pp.name==name and str(pp)==name and not pp.is_absolute() and name not in seen);seen.add(name)
 raw=bound(E/name,row['sha256']);check('frozen metadata exact '+name,len(raw)==row['bytes'] and stat.S_IMODE((E/name).lstat().st_mode)==row['mode'])
 if name.endswith('.json'):buffers[name]=raw
 # Exact stdout/stderr members are HASH-ONLY; never parse, decode or export bodies.
check('no progressed success phase/final state frozen',not any(n.startswith(('install-fixed.','green.','archive.','final-','close.','allow-close','postclose')) for n in seen))
for name in source_names:values[name]=bound(P/name)
for path in extra:values[str(path)]=bound(path)
check('exact actual source06 manifest',hashlib.sha256(values['manifest.json']).hexdigest()=='e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585')
m=json.loads(values['manifest.json']);sourcepins={r['path']:r for r in m['files']}
for n in source_names:
 if n!='manifest.json':check('reviewed library/source member '+n,hashlib.sha256(values[n]).hexdigest()==sourcepins[n]['sha256'])
for path,h in [(extra[0],'1a4678333a0a968dfe1c5936ce74b55638b9e3a2a9bffe8c375b724ea8398b7d'),(extra[1],'b89e94e647d7702f845a004d98043fffa5c992cc31771417b5f95e5b025a0237'),(extra[2],'49294775837827d66614b1253214db16f8206770a6affbda63929f3d97095d3c'),(extra[3],'14db07064b927666a75f403a2f808b07c90e19cb32a8ee4289ef570969389459'),(extra[4],'e0cdc50f6970e595d3c1095b9b182e116d60663b0eb37d3c4793b56a8b2ada11'),(extra[6],'ec64b9b5fb243c9c6bf2a29828e03784cbba720b0b77a4ed3d03c3896db3658a')]:check('explicit source/reference authority '+path.name,hashlib.sha256(values[str(path)]).hexdigest()==h)
red=json.loads(buffers['red.receipt.json']);native=red['native'];prepare=json.loads(buffers['prepare.receipt.json']);assessment=json.loads(values[str(extra[0])]);A=json.loads(buffers['root-authorization.json'])
check('root exact release',hashlib.sha256(buffers['root-authorization.json']).hexdigest()=='43ff6885ad33d1084a6a60ccb94390a099e097fd31b35496442b46ebce24ce71')
check('actual red receipt assessment pin',hashlib.sha256(buffers['red.receipt.json']).hexdigest()==assessment['redReceiptSha256'])
check('failed red statuses preserved',red['accepted'] is False and red['status']=='HOLD' and red['failureCode']=='NATIVE_OWNERSHIP_HOLD' and red['nativeExecuted'] is True and native['nativeExit']==1 and type(native['nativeExit']) is int and native['timedOut'] is False and native['status']=='HOLD')
check('exact sticky native flags',set(native['stickyFlags'])=={'OWNED_IDENTITY_RACE_OR_INCOMPLETE','RESIDENT_REPARENTED_OR_UNKNOWN_CANDIDATE'})
check('root collector status separately attested',assessment['actualCollectorStatus']==assessment['actualPhaseSeparateStatus']==1 and assessment['phaseAccepted'] is False)
check('prepare accepted once',prepare['accepted'] is True and prepare['status']=='TERMINAL_ACCEPTED_LOCAL_ONLY' and prepare['nativeExecuted'] is False and not prepare['stickyFlags'])
check('accepted prepare before/after source and deps',prepare['preSource']['sourceDigest']==prepare['postSource']['sourceDigest']==A['sourceDigest'] and prepare['preSource']['dependenciesExact'] and prepare['postSource']['dependenciesExact'])
check('postred source/resource observations absent','postSource' not in red and 'postResources' not in red)
check('no product/source window authorization',A['sourceWrites'] is False and A['sourceWindowOpened'] is False and A['nativePhaseChainingAuthorized'] is False)
unknowns=native['candidateObservations'];union={x['pid'] for row in unknowns for x in row['unknownCandidates']};missing=[x for row in unknowns for x in row['unknownCandidates'] if 'start' not in x]
check('three snapshots/four unknown PID numbers/one unpaired record',len(unknowns)==3 and len(union)==4 and len(missing)==1)
check('last sample empty not historical repair',not unknowns[-1]['unknownCandidates'] and any(row['unknownCandidates'] for row in unknowns[:-1]))
check('two complete recorded identities',len(native['ownedIdentities'])==2 and all(x['identityComplete'] is True for x in native['ownedIdentities']))
check('initial direct child complete',native['initialBindingAttempted'] is True and native['initialChildIdentity']['identityComplete'] is True)
check('candidate snapshots bind baseline',all(row['baselineSha256']==A['candidateBaselineSha256'] for row in unknowns))
# Interpret ONLY the pure contract definitions. No driver/helper imports/mains or OS callbacks.
contract={};exec(compile(values['contracts.py'],'<exact-pure-closed-red-adjudicator>','exec'),contract)
report=json.loads(buffers['red-vitest.json']);cases=json.loads(values['case-map.json']);qualified=contract['assess'](report,'red',native['nativeExit'],cases)
check('exact report component matches root',qualified==assessment['pureClosedReportAssessment'])
check('report buffer pin',hashlib.sha256(buffers['red-vitest.json']).hexdigest()==native['reportSha256']==assessment['redReportSha256'])
check('report actual95/48/47/0',qualified['all95IdentitiesReconciled'] and qualified['counts']=={'failed':48,'skipped':47} and report['numPassedTests']==0)
check('fixture frame exact line310',values['banks/integrations.test.ts'].decode().splitlines()[309].strip()=='expect(outcome.ok).toBe(false);')
# Normal transition denial is adjudication of this actual failed receipt, not a retry design.
try:contract['transition_allowed']('install-fixed',{'phase':'install-fixed','authorized':True},{'red':red})
except ValueError as exc:denial=str(exc)
else:raise AssertionError('FAILED_RED_INCORRECTLY_ACCEPTED')
check('normal install-fixed prohibited',denial=='PRECEDING_RECEIPT_NOT_ACCEPTED')
# Closed journal history profile, never current facts or full fingerprints.
observations=[json.loads(raw) for name,raw in buffers.items() if name.startswith('observation-')]
check('all frozen2245 observation records',len(observations)==2245)
check('all journal records waited complete no-signal',all(x['classification']=='WAITED_POPEN_CHILD' and x['terminalWaitConfirmed'] is True and type(x['actualExit']) is int and x['stdoutComplete'] is True and x['stderrComplete'] is True and x['timeoutSignalSent'] is False for x in observations))
clients={(x['client']['pid'],x['client']['start']) for x in observations};limitations=Counter(x['client'].get('identityLimitation') for x in observations)
check('all journal clients census-bound limitations retained',all(start for pid,start in clients) and all(x['client'].get('identityLimitation')=='PID_START_ARGV_PARENT_CENSUS_BOUND_BINARY_NOT_FULLY_FINGERPRINTED' for x in observations))
# Verify every root/phase decision immutable pin against a frozen exact JSON buffer.
for control in ['root-authorization.json','prepare.root-decision.json','red.root-decision.json']:
 value=json.loads(buffers[control]);check('all explicit immutable input pins '+control,all(name in buffers and hashlib.sha256(buffers[name]).hexdigest()==h for name,h in value['immutableInputPins'].items()))
caller=values[str(extra[1])].decode();check('new caller explicitly outside sealed06',extra[1].name not in sourcepins)
check('caller exact leaf/release/package bindings',all(t in caller for t in ['47db173dd0ad632f607a2effeb753754b581db6f601d78bf00e5f619d6e0a45c','43ff6885ad33d1084a6a60ccb94390a099e097fd31b35496442b46ebce24ce71','e2e3340b48628c76884d6b243dd69134052e8e2ff3d25f5ab09d94f4e9150585']))
check('caller contains no phase/native/exit invocation',not any(isinstance(n,ast.Call) and ast.unparse(n.func) in ['d.main','d.run_native','d.make_copy','d.install_fixed','d.archive','os.kill','subprocess.Popen'] for n in ast.walk(ast.parse(caller))))
check('root source claims narrow and postred remain owed',assessment['sourceWrites'] is False and assessment['assessmentDoesNotQualifyFailedPhase'] is True and assessment['fixedHelperInstallOrGreenOrArchive']=='NOT_STARTED_NOT_AUTHORIZED')
check('no denied boundary attempts',not denied)
profile={'frozenMembersVerified':2263,'hashOnlyRawMembers':2,'structuredReportFiles':1,'reportIdentities':95,'intendedFailures':48,'filtered':47,'passing':0,'recordedOwnedCompleteIdentities':2,'candidateSnapshots':3,'distinctUnknownPidNumbers':4,'unknownRecordsWithoutStart':1,'lastSnapshotUnknownCount':0,'observationRecords':len(observations),'distinctClientIdentityPairs':len(clients),'observedUtilityExitCounts':dict(Counter(x['actualExit'] for x in observations)),'fullClientBinaryFingerprintsProved':False,'currentProcessSourceDependencyFactsProved':False,'rawBodiesExported':False,'actualResourceClosureAccepted':False,'normalPhaseProgressAccepted':False}
(O/'pins.json').write_text(json.dumps({'sourcePacketSha256':hashlib.sha256(values['manifest.json']).hexdigest(),'terminalIndexSha256':hashlib.sha256(indexraw).hexdigest(),'pins':pins,'forbiddenBaselineOrCurrentWAccess':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'checks':checks,'count':len(checks),'allExpected':True,'profile':profile,'pureAssessment':qualified,'rootToolClaims':'Tool reference strings and separately captured statuses are root/parent attestations; this reviewer did not read direct tool history.','reviewReadHistory':[{'tool':'063445','actualExit':1,'reason':'Bounded attempt to read nonexistent reference README.md; reference manifest names RECIPE.md instead. No protected path access or source mutation.'}],'deniedAuditCalls':denied,'currentOSProcessLockNativeOrPrivateActions':0},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'allExpected':True,'profile':profile,'actualActions':0}))

"""Closed actual-data checks only; no observer/runtime/helper/gate mains."""
import ast,collections,hashlib,json,pathlib,re,stat
R=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-t0-c8-check01')
N=R/'failed-resource-disposition01';D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume4')
O=pathlib.Path(__file__).parent
def read(p):return json.loads(pathlib.Path(p).read_text())
def digest(b):return hashlib.sha256(b).hexdigest()
def sha(p):return digest(pathlib.Path(p).read_bytes())
checks=[];pins=[]
def check(label,value):assert value,label;checks.append({'check':label,'passed':True})
chain_path=R/'root-failed-resource-actual-chain-01.json';chain=read(chain_path)
check('root trace pin',sha(chain_path)=='09346126f4f0e5d635a25c6394d9605f4cfcc097b0934dcb2b87045475be885d')
check('namespace directory mode',stat.S_ISDIR(N.lstat().st_mode) and stat.S_IMODE(N.lstat().st_mode)==0o700)
members=chain['runtimeMembers'];check('1004 bound members',len(members)==1004 and len({x['path'] for x in members})==1004)
names={};raws={};data={}
for f in members:
 p=pathlib.Path(f['path']);check('member scope '+p.name,p.parent==N and p.name not in ['.','..'] and '/' not in p.name)
 st=p.lstat();check('member regular/mode '+p.name,stat.S_ISREG(st.st_mode) and stat.S_IMODE(st.st_mode)==f['mode']==0o600)
 b=p.read_bytes();check('member bytes/hash '+p.name,len(b)==f['bytes'] and digest(b)==f['sha256']);names[p.name]=f;raws[p.name]=b
 if p.suffix=='.json':data[p.name]=json.loads(b)
 pins.append(f)
check('exact current namespace membership',{p.name for p in N.iterdir()}==set(names))
def h(name):return digest(raws[name])
a=data['root-disposition-authorization.json'];release=h('root-disposition-authorization.json')
check('actual release pin',release==chain['newReleaseSha256']=='b45b165ae1ca6b08774146534e7a6bdb7321b6f2f6ee47673dc94a6bc9cfc5ef')
check('exact code04 packet',sha(D/'manifest.json')==a['implementationPacket']=='e0cdc50f6970e595d3c1095b9b182e116d60663b0eb37d3c4793b56a8b2ada11')
for name,want in (a['codePins']|a['pins']).items():
 check('reviewed installed member '+name,h(name)==want==sha(D/name));pins.append({'path':str(D/name),'sha256':want})
for role,f in a['reviewRecords'].items():
 check('exact authority review '+role,sha(f['path'])==f['sha256']==a['reviewPins'][role]);pins.append(f)
adoption=read(a['reviewRecords']['rootAdoption']['path'])
check('actual one-unit root dual exception',adoption['kind']=='ROOT_ONE_UNIT_OPERATIONAL_DUAL_EXCEPTION_FOR_QUALIFIED_FAILED_RESOURCE_ONLY' and adoption['explicitClosingEntrypointException']['authorized'] is True and adoption['explicitFailedBuildZeroException']['authorized'] is True and adoption['maximumNewGuardedClosingOperations']==1)
for role,f in adoption['exactIndependentCodeReviews'].items():
 check('code review manifest '+role,sha(f['manifestPath'])==f['manifestSha256']);pins.append({'path':f['manifestPath'],'sha256':f['manifestSha256']})
check('code QA manifest binding',adoption['exactIndependentCodeReviews']['qaCode']['manifestSha256']=='5a59c67521fef9255e2b005d4dc4c2737d75a17bc5c2f377864d477978fd9178')
check('code architecture manifest binding',adoption['exactIndependentCodeReviews']['architectureCode']['manifestSha256']=='7c59e190497531d8dfa1f1f86dde3c9ccfa7d826327088e9aefeec47e7f7cc0d')
check('original release immutable',sha(R/'root-actual-unit-release.json')==a['originalReleaseSha256']=='9f347db3774a785a0b732392b2711976476ac4ae8743fcad839026c121fc3511')
check('original lock metadata immutable',sha(R/'active-lock.json')==a['activeLockSha256']=='a938fadcc56ddb8b8e86b80cb2a50589c558cb8a135e934c7443d2508b827b24')
check('original terminal index immutable',sha(R/'root-terminal-evidence-index-01.json')==a['terminalIndexSha256']=='f3d5b283f86fe0196d570f0a04002c758a292689203ddb93a6fe1a4c8d62ebcb')
# Only reviewed pure dictionary predicates are executed, never adapter imports
# or any original/full-body parser or operational entrypoint.
g={};exec(compile(ast.parse(raws['predicates.py']),'<reviewed pure closed-data contracts>','exec'),g)
g['authority'](a);g['preserved'](a,data['retained-contract.json'],data['input-pins.json']['retainedContract'])
check('actual pure authority/preserved data checks',True)
clients={k:v for k,v in data.items() if k.startswith('client-')};utilities={k:v for k,v in data.items() if k.startswith('utility-')}
check('five clients and985 utilities',len(clients)==5 and len(utilities)==985)
check('closed remaining14 members',len(set(names)-set(clients)-set(utilities))==14)
identities={};utility_counts=collections.Counter();utility_indices=collections.defaultdict(list);status_counts=collections.Counter();commands=collections.Counter()
roles=a['pythonRoles']
for name,item in clients.items():
 who=item['identity'];g['typed_identity'](who);key=(who['pid'],who['start']);identities[key]=who
 check('client exact subject/name '+name,item['kind']=='NEW_VERIFICATION_CLIENT' and item['releaseSha256']==release and name=='client-'+str(who['pid'])+'-'+digest(who['start'].encode())[:16]+'.json')
 check('client APP fingerprint '+name,who['executableHash']==digest(roles['process']['path'].encode()) and who['commHash']==digest(roles['process']['path'].encode()) and who['executableFileHash']==roles['process']['sha256'])
 check('client BIN/configured/observed role '+name,who['reportedExecutableHash']==digest(roles['reported']['path'].encode()) and who['reportedExecutableFileHash']==roles['reported']['sha256'] and who['configuredLaunchExecutableHash']==digest(roles['launch']['path'].encode()) and who['observedArgumentExecutableHash']==digest(roles['observedArgument']['path'].encode()) and who['observedArgumentExecutableFileHash']==roles['observedArgument']['sha256'])
 if item['mode']!='postclose':check('held client SAME original shell '+name,who['ppid']==45227)
check('five distinct client PID/start pairs',len(identities)==5)
check('actual five client modes',collections.Counter(v['mode'] for v in clients.values())=={'gate':2,'held-proof':1,'final':1,'postclose':1})
for name,u in utilities.items():
 who=u['client'];key=(who['pid'],who['start']);check('utility client join '+name,identities.get(key)==who and u['releaseSha256']==release)
 match=re.fullmatch(r'utility-([0-9]+)-([0-9a-f]{16})-([0-9]+)\.json',name)
 check('utility exclusive identity/counter '+name,bool(match) and int(match[1])==who['pid'] and match[2]==digest(who['start'].encode())[:16])
 utility_indices[key].append(int(match[3]));utility_counts[key]+=1
 check('complete waited utility '+name,u['kind']=='SYNCHRONOUS_BOUND_OBSERVATION_UTILITY' and type(u['pid']) is int and u['pid']>0 and u['terminal'] is True and type(u['status']) is int and u['status']==0 and u['stdoutComplete'] is True and u['stderrComplete'] is True and u['stderrEmpty'] is True and u['status'] in u['allowedStatuses'])
 bindings=[v for v in a['observationExecutables'].values() if v['path']==u['command'][0]]
 check('utility executable binding '+name,len(bindings)==1 and bindings[0]['sha256']==u['executableSha256'])
 check('closed diagnostic metadata '+name,not any(x in u for x in ['stderr','stdout','error','output']))
 status_counts[u['status']]+=1;commands[u['command'][0]]+=1
for key,indices in utility_indices.items():check('contiguous unique utility journals '+str(key[0]),sorted(indices)==list(range(1,len(indices)+1)))
denial=data['negative-readiness-denial.json'];held=data['held-proof.json'];ad=data['root-admission.json'];ready=data['readiness.json'];permit=data['permit.json'];allow=data['gate-allow.json'];wrapper=data['root-wrapper-result.json'];post=data['postclose.json']
g['negative_record'](denial,clients[denial['clientJournal']],release,a['activeLockSha256'],45227)
g['held_record'](held,release,h('negative-readiness-denial.json'));g['admission'](ad,release,a['activeLockSha256'])
check('held journal canonical link',held['clientJournalSha256']==digest(g['compact'](clients[held['clientJournal']])) and clients[held['clientJournal']]['identity']==held['client'] and clients[held['clientJournal']]['mode']=='held-proof')
check('actual admission denial/held links',ad['negativeDenialSha256']==h('negative-readiness-denial.json') and ad['heldProofSha256']==h('held-proof.json') and type(ad['heldProofActualStatus']) is int and ad['heldProofActualStatus']==0 and ad['heldProofSeparateStatusCaptured'] is True)
check('root launch readonly/command attestation',ad['configuredLaunch']==roles['launch'] and ad['configuredLaunchInspected'] is True and bool(ad['exactOperatorCommandEvidence']) and ad['originalExitAndBindingsUnchanged'] is True and ad['newReadonlyFunctionInspected'] is True)
check('ready admission/permit links',ready['admissionSha256']==h('root-admission.json') and permit['readinessSha256']==h('readiness.json') and allow['readinessSha256']==h('readiness.json') and allow['permitSha256']==h('permit.json'))
snapshot_summary=[]
ordered_clients=sorted(clients.values(),key=lambda v:v['identity']['start'])
for phase,obj,count in [('held-proof',held,2),('final',ready,3),('gate',allow,4),('postclose',post,5)]:
 for side in ['before','after']:
  snap=obj[side];g['current'](snap,phase=='postclose')
  check('snapshot exact clients '+phase+'/'+side,len(snap['clientIdentities'])==count and {g['compact'](x) for x in snap['clientIdentities']}=={g['compact'](x['identity']) for x in ordered_clients[:count]})
  check('snapshot exact kernel mode '+phase+'/'+side,snap['kernelHeld'] is (phase!='postclose') and snap['kernelFree'] is (phase=='postclose') and snap['controllersAbsentOrReused'] is (phase=='postclose'))
  snapshot_summary.append({'phase':phase,'side':side,'atEpoch':snap['observedAtEpoch'],'sourceDigest':snap['sourceDigest'],'recordedCount':snap['recordedCount'],'inheritedMatched':snap['inheritedMatched'],'clientCount':count,'kernelFree':snap['kernelFree'],'priorClientsLive':snap['priorClientsLive']})
 check('snapshot phase order '+phase,obj['before']['observedAtEpoch']<=obj['after']['observedAtEpoch'])
check('final/gate/postclose timestamp order',held['after']['observedAtEpoch']<=ready['before']['observedAtEpoch']<=ready['after']['observedAtEpoch']<=ready['verifiedAtEpoch']<=permit['issuedAtEpoch']<=allow['before']['observedAtEpoch']<=allow['after']['observedAtEpoch']<=allow['atEpoch']<=post['before']['observedAtEpoch']<=post['after']['observedAtEpoch'])
# Code04 enforces entry and exit freshness. Recorded before/after snapshots and
# atEpoch independently bound the visible interval; entry's exact clock value is
# not separately serialized. Root phase ordering is an explicit attestation.
for when in [allow['before']['observedAtEpoch'],allow['after']['observedAtEpoch'],allow['atEpoch']]:
 g['readiness'](ready,release,a['retainedContractSha256'],when);g['permit'](permit,ready,h('readiness.json'),release,when,1)
g['gate'](a,data['retained-contract.json'],data['input-pins.json']['retainedContract'],ad,ready,permit,release,h('readiness.json'),allow['before'],allow['after'],allow['before']['observedAtEpoch'],allow['atEpoch'],1)
check('actual gate decision/exit1',allow['decision']=='ALLOW_QUALIFIED_FAILED_RESOURCE_EXIT_ONE' and type(allow['expectedWrapperExit']) is int and allow['expectedWrapperExit']==1 and allow['C8Credit'] is False)
check('actual wrapper record',type(wrapper['actualWrapperExit']) is int and wrapper['actualWrapperExit']==1 and wrapper['separatelyCaptured'] is True and wrapper['releaseSha256']==release and wrapper['gateAllowSha256']==h('gate-allow.json'))
check('actual postclose exact result',h('postclose.json')=='ead7420c8882db6d4de6ad2b79fe59796f6d3223326be61a03afe44ad381c6c6' and post['status']=='QUALIFIED_FAILED_RESOURCE_POSTCLOSE_OBSERVED' and post['actualWrapperExit']==1 and post['releaseSha256']==release and post['C8Credit'] is False)
steps=chain['separateSteps'];check('complete separate trace order',[x['step'] for x in steps]==['guardSetup','negative','heldProof','rootAdmission','standaloneFinal','separateRootPermit','guardedExit','separateActualWrapperRecord','separateOuterPostclose'])
check('separate statuses attested',[steps[i]['actualStatus'] for i in [0,1,2,4]]==[0,1,0,0] and steps[6]['actualWrapperExit']==1 and steps[8]['actualOuterExit']==0)
for step,name in [(steps[3],'root-admission.json'),(steps[5],'permit.json'),(steps[7],'root-wrapper-result.json'),(steps[8],'postclose.json')]:check('trace actual hash '+name,step['sha256']==h(name))
check('trace gate hash',steps[6]['gateAllowSha256']==h('gate-allow.json'))
check('wrapper actual tool binding',wrapper['actualToolResultEvidence']['sessionId']==19501 and wrapper['actualToolResultEvidence']['completionChunk']==steps[6]['completionChunk']=='bc93de' and steps[8]['completionChunk']=='ed5b69' and steps[8]['toolSession']==43837)
check('no native/compile/write/credit change',chain['newProductWrites']==chain['newNativeInvocations']==0 and chain['compileState']=='NOT_STARTED' and chain['C8Credit'] is False and chain['sourceRelease'] is False and post['historicalGapCodes']==a['historicalGapCodes'])
result={'verdict':'ACCEPT_QUALIFIED_FAILED_RESOURCE_CLOSURE_ONLY','checks':checks,'allPassed':True,'namespaceMembers':1004,'clients':5,'utilities':985,'utilitiesByClient':[{'pid':x['identity']['pid'],'mode':x['mode'],'count':utility_counts[(x['identity']['pid'],x['identity']['start'])]} for x in ordered_clients],'utilityStatusCounts':dict(status_counts),'utilityCommandCounts':dict(commands),'snapshots':snapshot_summary,'gateReadinessAgeAtCompletionSeconds':allow['atEpoch']-ready['verifiedAtEpoch'],'gatePermitAgeAtCompletionSeconds':allow['atEpoch']-permit['issuedAtEpoch'],'gateBeforeSnapshotReadinessAgeSeconds':allow['before']['observedAtEpoch']-ready['verifiedAtEpoch'],'rootToolHistoryDirectAccess':False,'rootTraceIsOperatorAttestation':True,'postcloseCurrentClientDischargedByAttestedOuterExit0':'ed5b69/session43837','newRuntimeOsPrivateActions':0,'C8Credit':False}
(O/'checks.json').write_text(json.dumps(result,indent=2)+'\n')
(O/'pins.json').write_text(json.dumps({'actualChain':{'path':str(chain_path),'sha256':sha(chain_path)},'namespaceAndReviewPins':pins},indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['verdict','namespaceMembers','clients','utilities','utilitiesByClient','utilityStatusCounts','gateReadinessAgeAtCompletionSeconds','gatePermitAgeAtCompletionSeconds','gateBeforeSnapshotReadinessAgeSeconds']}))

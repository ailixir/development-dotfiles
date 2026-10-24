"""Finite CODE05 whole-source/API/reuse/seal verification. No target suite replay."""
import ast,hashlib,json,stat
from pathlib import Path
B=Path('docs/qa/evidence/STUDIO-OBS-011/t0');S=B/'early/gateway80-failed-red-resource-prep/resume5';OLD=S.parent/'resume4';O=B/'qa/gateway80-failed-red-resource-code05-exact-review';AR=B/'resume-architecture/resume2/gateway80-failed-red-resource-code05-exact-review';checks=[];pins=[];cache={}
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,v):
 if v is not True:raise AssertionError(n)
 checks.append({'id':n,'passed':True})
def bound(p,r):
 p=Path(p);assert '/runtime/' not in str(p) and '..' not in p.parts
 raw=p.read_bytes();info=p.lstat();mode=r['mode'];mode=int(mode,0) if isinstance(mode,str) and mode.startswith('0o') else int(mode,8) if isinstance(mode,str) else mode
 check('EXACT_PUBLIC_PIN_'+str(len(pins)),sha(raw)==r['sha256'] and len(raw)==r['bytes'] and stat.S_IMODE(info.st_mode)==mode and stat.S_ISREG(info.st_mode));pins.append(dict(path=str(p),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(info.st_mode)));cache[str(p)]=raw;return raw
raw=(S/'manifest.json').read_bytes();m=json.loads(raw);check('EXACT_MANIFEST',sha(raw)=='bd9da067c9d56545171050373a1926f9cd9d061966847ad35db680841cc8e9aa' and len(raw)==17740);bound(S/'manifest.json',dict(sha256=sha(raw),bytes=len(raw),mode=420))
for r in m['files']:bound(S/r['path'],r)
check('EXACT92',len(m['files'])==92 and {p.name for p in S.iterdir()}=={r['path'] for r in m['files']}|{'manifest.json'})
for r in json.loads((S/'input-pins.json').read_bytes())['inputs']:bound(Path(r['path']),r)
peer=[('verify_source.py','182ff8187d4de791f507cb73aac42e188a6e44c8649927d00f81cf7b37697ccc',8675),('static-attempt01.stdout','ee3c9ab96c8cdf495e7b67203662522240f6afdc002d995199ac46d2ee542041',204105),('critical_checks.py','c51d17a9eaeec05fc14138673ecedab2904c773b861156060e808295dfd5a958',10777),('critical-attempt01.stdout','5e88efd42e1eff5524e17a6c5f9874994d2cee5d1994d952e939e0111adf29b1',5358),('whole-invariant-trace.json','b914cecdafa7e81a5fb4beeb13cd4b6dd941ac234ab4293639cbac3afe0f3eab',3372)]
for n,h,size in peer:bound(AR/n,dict(sha256=h,bytes=size,mode=420))
api=json.loads(cache[str(S/'api-map.json')]);interp=json.loads(cache[str(S/'interpretation-map.json')]);reuse=json.loads(cache[str(S/'reuse-analysis.json')])
def functions(raw):
 t=ast.parse(raw);out={}
 for node in t.body:
  if isinstance(node,ast.FunctionDef):out[node.name]=node
  elif isinstance(node,ast.ClassDef):out.update({node.name+'.'+n.name:n for n in node.body if isinstance(n,ast.FunctionDef)})
 return out
now={};old={}
for key,r in api['functions'].items():
 name=r['file'];now.setdefault(name,functions(cache[str(S/name)]));symbol=key.split(':',1)[1];n=now[name][symbol]
 check('API_'+key,n.lineno==r['line'] and n.end_lineno==r['endLine'] and ast.unparse(n.args)==r['signature'] and sha(ast.dump(n,include_attributes=False).encode())==r['astSha256'])
check('API132_SITE140_CLASS14',len(api['functions'])==132 and interp['functions']==api['functions'] and len(interp['reachedInterpretationSites'])==interp['reachedInterpretationSiteCount']==140 and len(interp['inputClasses'])==interp['inputClassCount']==14)
for r in reuse['unchangedFunctions']:
 filename,symbol=r['function'].split(':',1);old.setdefault(filename,functions(cache[str(OLD/filename)]));a=ast.dump(now[filename][symbol],include_attributes=False);b=ast.dump(old[filename][symbol],include_attributes=False);check('AST_REUSE_'+r['function'],a==b and sha(a.encode())==r['astSha256'])
check('EXACT88_UNCHANGED',len(reuse['unchangedFunctions'])==88 and reuse['currentReplayOf313'] is False and reuse['currentReplayOf19'] is False)
k=json.loads(cache[str(S/'contract.json')]);check('EXACT7_BOTH_PRIORS_11ACTORS',len({r['path'] for r in [*k['expectedPhysicalPythonRoles'].values(),*k['expectedObservationExecutables'].values(),*k['binaryAncestors'].values()]})==7 and [len(p['members']) for p in k['priorNamespaces']]==[7,8] and len(k['knownPostBaseActors'])==11)
check('TYPED_NON_EQUIVALENT_NO_OWNER_AUTHORITY',k['typedRoleContract']['kind']=='FAILED_RESOURCE_TYPED_SELF_TEXT_AND_PHYSICAL_ROLES_V1' and k['typedRoleContract']['legacyReportedCanonicalPredicateSatisfied'] is False and k['typedRoleContract']['oldAndNewPredicatesEquivalent'] is False and m['actualOwnerRulingsIssued'] is False)
author=json.loads(cache[str(S/'check-results.json')]);flow=json.loads(cache[str(S/'bounded-flow-check-results.json')]);history=json.loads(cache[str(S/'author-history.json')]);check('AUTHOR78_CURRENT_147_HISTORICAL',author['passed']==78 and flow['passed']==62 and author['outerDeliveryChecks']==16 and history['actualAssertionsAcrossCandidateAndFinalBatches']==147 and history['finalSupportedUniqueChecks']==78 and all(r.get('pass_',r.get('pass')) is True for r in author['checks']))
for n,h in author['sourcePins'].items():check('AUTHOR_SOURCE_'+n,sha(cache[str(S/n)])==h)
peerstatic=json.loads(cache[str(AR/'static-attempt01.stdout')]);peertarget=json.loads(cache[str(AR/'critical-attempt01.stdout')]);check('PEER813_34_BOUND',peerstatic['passed']==813 and peertarget['passed']==34 and peertarget['caseGroups']==8 and all(r['passed'] for r in peerstatic['checks']) and all(r['passed'] for r in peertarget['checks']))
critical=json.loads((O/'critical.stdout').read_bytes());late=json.loads((O/'afterallow.stdout').read_bytes());check('QUINN9_PLUS8_COMPLETE',critical['checks']==9 and late['checks']==8 and all(r['passed'] for r in critical['results']) and all(r['passed'] for r in late['results']) and critical['realBoundaryCalls']==late['realBoundaryCalls']==[])
check('REPRO_FOUR_CATEGORY_EVIDENCE',next(r for r in critical['cases'] if r['case']=='owner_numeric_boolean_coercion')['preflightAccepted'] is True and all(next(r for r in critical['cases'] if r['case']=='current_author_'+s)['qualifiedNegativeProduced'] is True for s in ('self_completed','omitted')) and late['case']['guardPythonStatus']==0 and late['case']['afterSelectedOuterCloseClock']>late['case']['issuedAtEpoch']+60)
check('CORRECTED_TAIL_AND_LATE_STDERR_EMPTY',(O/'critical.stderr').read_bytes()==(O/'afterallow.stderr').read_bytes()==b'')
check('ATTEMPT01_KEYERROR_PRESERVED',b"KeyError: 'qualified'" in (O/'critical-attempt01.stderr').read_bytes() and (O/'critical-attempt01.stdout').read_bytes()==b'')
protocol=cache[str(S/'protocol.py')].decode();runtime=cache[str(S/'failed_gateway.py')].decode();guard=cache[str(S/'guard-failed-red.bash')].decode();owner=ast.get_source_segment(protocol,now['protocol.py']['owner_records']);setup=ast.get_source_segment(runtime,now['failed_gateway.py']['Unit.require_setup']);operate=ast.get_source_segment(runtime,now['failed_gateway.py']['Unit.operate'])
check('OWNER_WHOLE_DICT_EQUALITY',"decode(raw)==owner_expected(a,k,who)" in owner)
check('PENDING_ROWS_NOT_CURRENT_AUTHOR_BOUND',"resolve_actor_completions" in setup and 'controlAuthor' not in setup)
check('UNCHECKED_SUFFIX_AFTER_ALLOW',operate.rfind('P.freshness(')<operate.index("self.write('gate-allow.json'") and 'if gateway80_failed_red04_invoke gate' in guard and 'builtin exit 1' in guard)
check('CONCRETE_CALLER_GAP_BOUND',peerstatic['callerGap']['setupAndCurrentControlAuthorImplementationFound'] is False and peerstatic['callerGap']['productionControlAuthorSymbols']==[])
for name in ('author_control','write_control','setup_control','current_control'):check('NO_PRODUCTION_AUTHOR_'+name,not any(key.endswith(':'+name) for key in api['functions']))
check('INSTALL_DERIVES_MAP_ONLY',"scope['inputPins']={path:h" in cache[str(S/'install-cli.py')].decode() and 'Root then uses only parent/operator builtins' in cache[str(S/'RECIPE05.md')].decode())
# Exact borrowed peer evidence only; no circular future review manifest dependency.
(O/'peer-evidence-binding.json').write_text(json.dumps({'peer':'Aria','pins':[r for r in pins if r['path'].startswith(str(AR)+'/')],'finiteChecks':813,'independentTargetChecks':34,'caseGroups':8,'futurePeerManifestNotRequired':True,'replayedByQuinn':False},indent=2)+'\n')
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':sha(raw),'pins':pins,'pinRecords':len(pins),'uniquePaths':len({r['path'] for r in pins}),'exactPublicOnly':True,'runtimePrivateBaselineReads':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'QUINN_COMPLETE_CODE05_SOURCE_CONTROL_SECURITY_REVIEW','checks':len(checks),'results':checks,'pinRecords':len(pins),'apiFunctions':132,'interpretationSites':140,'inputClasses':14,'unchangedFunctionAsts':88,'attributedAuthorCurrentChecks':78,'authorHistoricalCandidateAssertions':147,'independentQuinnCompleteAssertions':17,'peerAriaAssertions':34,'peerAriaFiniteChecks':813,'reviewerAttempt01FailurePreserved':True,'mandatoryCategories':4,'actualTargetOperations':0,'old313And332Replayed':False},indent=2)+'\n')
(O/'source-binding.json').write_text(json.dumps({'subjectManifestSha256':'bd9da067c9d56545171050373a1926f9cd9d061966847ad35db680841cc8e9aa','installedCode':{n:sha(cache[str(S/n)]) for n in k['installedCode']},'criticalFixtureSourceSha256':sha(cache[str(S/'source05_checks.py')]),'outerFixtureSourceSha256':sha(cache[str(S/'outer_delivery_checks.py')]),'sameCompiledFakeNamespaces':True,'persistentAuditUnchanged':True,'subjectSafetyEdits':False,'actualRuntimeAuthority':False,'ownerPolicyDecision':False},indent=2)+'\n')
carriers={n:json.loads(cache[str(S/n)]) for n in ('adopted-design-conditions.json','design-root-adoption.json','ancestor04-root-exact-source-adoption.json')}
(O/'condition-bindings.json').write_text(json.dumps({'allInheritedCarriers':carriers,'pins':[{k:r[k] for k in ('path','sha256','bytes','mode')} for r in pins if r['path'] in {str(S/n) for n in carriers}],'historicalScopesNotNewAuthority':True,'source04HoldAndAllActualGatesPreserved':True},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'pinRecords':len(pins),'uniquePaths':len({r['path'] for r in pins}),'apiFunctions':132,'sites':140,'classes':14,'unchangedAsts':88,'quinnAssertions':17,'peerAriaAssertions':34,'mandatoryCategories':4,'actualTargetOperations':0}))

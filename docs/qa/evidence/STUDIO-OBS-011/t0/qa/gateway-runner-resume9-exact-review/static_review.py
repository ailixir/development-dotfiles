"""Independent finite source/pin/AST/control/shell-map checks. No subject execution."""
from pathlib import Path
import ast,hashlib,json,re,shlex,stat
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume9');O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway-runner-resume9-exact-review')
checks=[];pins=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(name,ok):
 if not ok:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def verify(row,prefix=None):
 p=Path(row['path']) if prefix is None else prefix/row['path'];check('PUBLIC_ONLY_'+str(p),'/runtime/' not in str(p) and not str(p).endswith('preexisting-baseline.json'))
 b=p.read_bytes();st=p.stat();check('SHA_'+str(p),h(b)==row['sha256']);check('BYTES_'+str(p),len(b)==row['bytes']);check('MODE_'+str(p),stat.S_IMODE(st.st_mode)==(int(row['mode'],8) if type(row['mode'])is str else row['mode']));pins.append({'path':str(p),'sha256':h(b),'bytes':len(b),'mode':stat.S_IMODE(st.st_mode)});return b
raw=(S/'manifest.json').read_bytes();check('EXACT_SUBJECT',h(raw)=='1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7');m=json.loads(raw);check('PAYLOAD50',len(m['files'])==50)
for row in m['files']:verify(row,S)
prep=json.loads((S/'preparation-input-pins.json').read_bytes())
for row in prep['directInputs']+prep['source8PayloadsVerified']:verify(row)
for packet in prep['reviewPackets']:
 verify(packet['manifest']);check('OLD_SIX_HOLD_'+packet['reviewer'],len(packet['mandatoryFindingIds'])==6 and packet['oldFindingsPreservedNonempty'] is True)
 for row in packet['members']:verify(row)
for row in prep['selectedStaticInputs'].values():verify(row)
oldprep=json.loads((S.parent/'resume8/preparation-input-pins.json').read_bytes())
for row in oldprep['files']:verify(row)
for line in (S/'SHA256SUMS').read_text().splitlines():
 sha,name=line.split(None,1);check('CHECKSUM_'+name,h((S/name).read_bytes())==sha)
ex=json.loads((S/'external-inputs.json').read_bytes());oldex=json.loads((S.parent/'resume8/external-inputs.json').read_bytes());check('STATIC39_UNCHANGED',ex['files']==oldex['files'] and len(ex['files'])==39)
check('SOURCE06_MANIFEST',h(Path(ex['staticManifest']['path']).read_bytes())==ex['staticManifest']['sha256'])
r=(S/'runtime.py').read_text();e=(S/'entry.py').read_text();trees={'runtime.py':ast.parse(r),'entry.py':ast.parse(e)}
check('NO_RUNTIME_ASSERT',not any(isinstance(n,ast.Assert) for t in trees.values() for n in ast.walk(t)))
mp=json.loads((S/'interpretation-sites.json').read_bytes())
for row in mp['functionSpans']:
 check('SPAN_'+row['source']+row['qualifiedOwner'],any(isinstance(n,ast.FunctionDef) and n.name==row['qualifiedOwner'].split('.')[-1] and n.lineno==row['line'] and n.end_lineno==row['endLine'] for n in ast.walk(trees[row['source']])))
for row in mp['sites']:
 if row['source'] in trees:check('SITE_'+row['source']+str(row['line'])+row['call'],any(isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['call'] for n in ast.walk(trees[row['source']])))
for row in mp['callbackSites']:
 check('CALLBACK_'+row['source']+str(row['line']),any(isinstance(n,ast.Lambda) and n.lineno==row['line'] and ast.unparse(n)==row['expression'] for n in ast.walk(trees[row['source']])))
check('COMPLETE_INTERPRETATIONS',{(s,n.lineno,ast.unparse(n.func)) for s,t in trees.items() for n in ast.walk(t) if isinstance(n,ast.Call) and ast.unparse(n.func) in ('json.loads','ast.parse','compile','exec')}=={(row['source'],row['line'],row['call']) for row in mp['sites'] if row['source'] in trees})
check('COMPLETE_CALLBACKS',{(s,n.lineno,ast.unparse(n)) for s,t in trees.items() for n in ast.walk(t) if isinstance(n,ast.Lambda)}=={(row['source'],row['line'],row['expression']) for row in mp['callbackSites']})
check('COMPLETE_FUNCTION_SPANS',{(s,n.lineno,n.end_lineno) for s,t in trees.items() for n in ast.walk(t) if isinstance(n,ast.FunctionDef)}=={(row['source'],row['line'],row['endLine']) for row in mp['functionSpans']})
check('COUNTS42_20_119_6',len(mp['sites'])==42 and mp['pythonSiteCount']==38 and len(mp['callbackSites'])==20 and len(mp['functionSpans'])==119 and sum(isinstance(n,ast.ClassDef) for n in ast.walk(trees['runtime.py']))==6)
check('MAPPINGS16',[g['mapping'] for g in json.loads((S/'integration-map.json').read_bytes())['groups']]==list(range(1,17)))
for name in ['capture-once.bash','guard-exit.bash','author-control.template.bash','postclose.template.bash']:
 shell=(S/name).read_text();literal=shlex.quote(e);check('EXACT_LOADER_'+name,shell.count(literal)==1);outer=shell.replace(literal,"'<VERIFIED_ENTRY>'")
 check('NO_GLOBAL_SETTING_'+name,re.search(r'^\s*(?:set\s+[-+]|shopt\s)',outer,re.M) is None)
 check('LOCAL_STATUS_'+name,bool(re.search(r'if .* -I -B -c ',outer)))
 if name=='capture-once.bash':check('CONSUMED_BEFORE_PYTHON',outer.index('readonly G8_CAPTURE_CONSUMED=1')<outer.index('if "$G8_CAPTURE_PYTHON"'))
 if name=='guard-exit.bash':check('ONLY_GATED_BUILTIN_EXIT',outer.count('builtin exit')==1 and 'if [[ $g8_gate_status == 0 ]]; then builtin exit 0; fi' in outer)
check('SHELL_CONDITIONAL_READ_HASH_SETUP',all(t in (S/'SHELL-BINDING.md').read_text() for t in ["if IFS= read -r -d ''",'G8_CAPTURE_HASH_STATUS=$?','if gateway8_bind_capture_buffer','if exit 0; then','No top-level option mutation']))
ret=json.loads((O/'retained.stdout').read_bytes());combined=json.loads((O/'combined.stdout').read_bytes());prior=json.loads((S.parent/'resume8/guarded-current-results.json').read_bytes())
check('RETAINED159',ret['checks']==len(ret['results'])==159 and [v['id'] for v in ret['results']]==[v['id'] for v in prior['results']])
check('COMBINED237',combined['checks']==len(combined['results'])==237 and combined['wholeFlowChecks']==25 and combined['newTargetedChecks']==212)
check('CURRENT396_ASSERTIONS_371_UNIQUE',len(ret['results']+combined['results'])==396 and len({v['id'] for v in ret['results']+combined['results']})==371)
check('ALL_CURRENT_PASS',all(v['passed'] is True for v in ret['results']+combined['results']))
check('NO_CURRENT_BOUNDARY_ATTEMPTS',ret['boundaryAttempts']==combined['boundaryAttempts']==[])
check('CURRENT_SOURCES_BOUND',ret['runtimeSourceSha256']==combined['runtimeSha256']==h(r.encode()) and ret['entrySourceSha256']==combined['entrySha256']==h(e.encode()))
check('NO_AST_SAFETY_EDIT',ret['subjectAstInstrumentation'] is False and combined['subjectAstSafetyStatementEdits'] is False and combined['prefixReverseProof'] is True)
check('ZERO_ACTUAL_TARGET_ACTIONS',ret['actualNativeOrOsProviderActions']==combined['actualOsToolNativeProviderPrivateActions']==0)
check('NO_REPLAY_STDERR',(O/'retained.stderr').read_bytes()==(O/'combined.stderr').read_bytes()==b'')
fix=json.loads((S/'six-fix-map.json').read_bytes());check('SIX_CATEGORIES',[g['category'] for g in fix['categories']]==list(range(1,7)))
ids={v['id'] for v in ret['results']+combined['results']}
for cat in fix['categories']:check('FIX_CASES_BOUND_'+str(cat['category']),set(cat['currentTargetedSemanticIds'])<=ids and cat['actualQualification'] is False)
scope=json.loads((S/'scope.json').read_bytes());oldscope=json.loads((S.parent/'resume8/scope.json').read_bytes())
for k in ['phases','node','helm','dependencies','maximumSeconds','parentUmask','childUmask','noRetry','noSignals','phaseIds','workspace','runtime','protocol']:check('NATIVE_ORACLE_UNCHANGED_'+k,scope[k]==oldscope[k])
templates=json.loads((S/'control-templates.json').read_bytes());schema=json.loads((S/'document-factories.schema.json').read_bytes())
for name,v in templates.items():
 if type(v)is dict and 'guarantees' in v:
  check('TEN_FALSE_'+name,len(v['guarantees'])==10 and all(x is False for x in v['guarantees'].values()));check('SIX_NULL_'+name,len(v['unsupportedEvidence'])==6 and all(x=={'value':None,'reason':'NOT_PROVED_BY_LOCAL_RUNNER_PROFILE'} for x in v['unsupportedEvidence'].values()));check('HISTORY_SCOPE_'+name,v['historicalIdentityUncertainty'] is True and v['credit'] is False and v['C8'] is False and v['cleanupAuthorized'] is False and v['sourceWrites']==[])
check('PENDING_FUTURE_FACTS_NULL',all(templates['rootProposal']['proposedAuthorization'][k] is None for k in schema['pendingOnlyNullFields']))
check('AUTHOR327_STATIC_ATTRIBUTION',json.loads((S/'static-verification.json').read_bytes())['checks']==327)
existing=json.loads((O/'pins.json').read_text());existing['pins']=pins;existing.update(externalSelectedInputs=39,source8PayloadsVerified=60,priorReviewPayloadsVerified=45,protectedBaselineBodyReadStatHash=False);(O/'pins.json').write_text(json.dumps(existing,indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'INDEPENDENT_FINITE_SOURCE09_REVIEW_CHECKS','count':len(checks),'checks':checks,'allExpected':True,'requiredRetained':159,'requiredCombined':237,'executedAssertions':396,'uniqueSemanticIds':371,'repeatedWholeFlowIds':25,'prior333Replayed':0,'author327StaticChecks':'Hash-bound attribution only; own finite checks separate.','actualActions':0,'subjectFunctionsExecutedHere':0,'actualShellExecuted':False},indent=2)+'\n')
print(json.dumps({'staticChecks':len(checks),'requiredAssertions':396,'uniqueCurrentSemanticIds':371,'allExpected':True,'actualActions':0}))

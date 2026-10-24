"""Finite approved-public-packet integrity and architectural map verification.

No subject execution, operational-resource reads, discovery or OS/provider probe.
Quinn's complete current suites are bound/reused, not replayed here.
"""
from pathlib import Path
import ast, hashlib, json, re, shlex, stat

T=Path('docs/qa/evidence/STUDIO-OBS-011/t0')
S=T/'early/gateway80-proof-prep/resume9'
O=T/'resume-architecture/resume2/gateway-runner-resume9-exact-review'
Q=T/'qa/gateway-runner-resume9-exact-review'
checks=[];pins=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(name,ok):
 if not ok:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def verify(row,prefix=None):
 p=Path(row['path']) if prefix is None else prefix/row['path']
 check('PUBLIC_APPROVED_'+str(p),'/runtime/' not in str(p) and not str(p).endswith('preexisting-baseline.json') and p.is_relative_to(Path('docs')) or str(p).startswith('.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/') or (p.is_absolute() and '/t0/early/' in str(p) and '/runtime/' not in str(p) and not str(p).endswith('preexisting-baseline.json')))
 raw=p.read_bytes();info=p.stat();mode=row['mode']
 if type(mode) is str:mode=int(mode,8) if mode.startswith('0') and not mode.startswith('0o') else int(mode,0)
 check('HASH_'+str(p),h(raw)==row['sha256']);check('BYTES_'+str(p),len(raw)==row['bytes']);check('MODE_'+str(p),stat.S_IMODE(info.st_mode)==mode)
 pins.append({'path':str(p),'sha256':h(raw),'bytes':len(raw),'mode':stat.S_IMODE(info.st_mode)})
 return raw
def manifest(path,expected):
 raw=path.read_bytes();check('MANIFEST_'+str(path),h(raw)==expected)
 check('MANIFEST_MODE_'+str(path),stat.S_IMODE(path.stat().st_mode)==0o644)
 pins.append({'path':str(path),'sha256':h(raw),'bytes':len(raw),'mode':0o644})
 value=json.loads(raw)
 for row in value.get('files',value.get('members',[])):verify(row,path.parent)
 return value
m=manifest(S/'manifest.json','1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7')
check('SOURCE09_50',len(m['files'])==50)
qm=manifest(Q/'manifest.json','fef6a0b862bcdc1920dd99b6a4901b5959f53dddb23977d9bb4120df71228b8d')
check('QUINN_PAYLOAD12',len(qm['files'])==12)
prep=json.loads((S/'preparation-input-pins.json').read_bytes())
for row in prep['directInputs']+prep['source8PayloadsVerified']:verify(row)
for packet in prep['reviewPackets']:
 verify(packet['manifest'])
 for row in packet['members']:verify(row)
 check('OLD_NONEMPTY_FINDINGS_'+packet['reviewer'],len(packet['mandatoryFindingIds'])==6 and packet['oldFindingsPreservedNonempty'] is True)
for row in prep['selectedStaticInputs'].values():verify(row)
oldprep=json.loads((S.parent/'resume8/preparation-input-pins.json').read_bytes())
for row in oldprep['files']:verify(row)
for directory,expected in [('resume-architecture/resume2/gateway-next-execution-evidence-design','3bbc86a625a2e362508ab81c8cf15c8a09ca55a0abd15e1e49e502ea4f91e007'),('qa/gateway-next-execution-evidence-design-review','2f148fc323164547b59e7b945436b3fd221a0d826dbfd192e2f4ca7ccd4eb5b4')]:manifest(T/directory/'manifest.json',expected)
for line in (S/'SHA256SUMS').read_text().splitlines():
 sha,name=line.split(None,1);check('SUM_'+name,h((S/name).read_bytes())==sha)
r=(S/'runtime.py').read_text();e=(S/'entry.py').read_text();trees={'runtime.py':ast.parse(r),'entry.py':ast.parse(e)}
check('NONREMOVABLE_RUNTIME_CHECKS',not any(isinstance(n,ast.Assert) for t in trees.values() for n in ast.walk(t)))
mp=json.loads((S/'interpretation-sites.json').read_bytes())
for row in mp['functionSpans']:
 check('SPAN_'+row['source']+'_'+str(row['line']),any(isinstance(n,ast.FunctionDef) and n.name==row['qualifiedOwner'].split('.')[-1] and n.lineno==row['line'] and n.end_lineno==row['endLine'] for n in ast.walk(trees[row['source']])))
for row in mp['sites']:
 if row['source'] in trees:check('SITE_'+row['source']+'_'+str(row['line'])+'_'+row['call'],any(isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['call'] for n in ast.walk(trees[row['source']])))
for row in mp['callbackSites']:check('CALLBACK_'+row['source']+'_'+str(row['line']),any(isinstance(n,ast.Lambda) and n.lineno==row['line'] and ast.unparse(n)==row['expression'] for n in ast.walk(trees[row['source']])))
check('EXACT_COMPLETE_INTERPRETATIONS',{(s,n.lineno,ast.unparse(n.func)) for s,t in trees.items() for n in ast.walk(t) if isinstance(n,ast.Call) and ast.unparse(n.func) in ('json.loads','ast.parse','compile','exec')}=={(x['source'],x['line'],x['call']) for x in mp['sites'] if x['source'] in trees})
check('EXACT_COMPLETE_CALLBACKS',{(s,n.lineno,ast.unparse(n)) for s,t in trees.items() for n in ast.walk(t) if isinstance(n,ast.Lambda)}=={(x['source'],x['line'],x['expression']) for x in mp['callbackSites']})
check('MAP_42_38_4_20_119_6',len(mp['sites'])==42 and mp['pythonSiteCount']==38 and mp['documentedShellEvalCount']==4 and len(mp['callbackSites'])==20 and len(mp['functionSpans'])==119 and sum(isinstance(n,ast.ClassDef) for n in ast.walk(trees['runtime.py']))==6)
groups=json.loads((S/'integration-map.json').read_bytes())['groups']
check('ALL16_GROUPS',[x['mapping'] for x in groups]==list(range(1,17)))
check('NO_MAP_RUNTIME_AUTHORITY',all(x['implementationPrepared'] is True and x['actualInstalledOrQualified'] is False and x['originalDesignImplementedFlag'] is False for x in groups))
for name in ('capture-once.bash','guard-exit.bash','author-control.template.bash','postclose.template.bash'):
 text=(S/name).read_text();literal=shlex.quote(e);check('EXACT_ENTRY_LITERAL_'+name,text.count(literal)==1)
 outer=text.replace(literal,"'<REVIEWED_ENTRY>'")
 check('UNCHANGED_PARENT_SETTINGS_'+name,re.search(r'^\s*(set\s+[-+]|shopt\s)',outer,re.M) is None)
 check('EXPLICIT_LOCAL_STATUS_'+name,re.search(r'if .* -I -B -c ',outer) is not None)
 if name=='capture-once.bash':check('CAP_CONSUMED_BEFORE_PYTHON',outer.index('readonly G8_CAPTURE_CONSUMED=1')<outer.index('if "$G8_CAPTURE_PYTHON"'))
 if name=='guard-exit.bash':check('GATE0_ONLY_BUILTIN_EXIT',outer.count('builtin exit')==1 and 'if [[ $g8_gate_status == 0 ]]; then builtin exit 0; fi' in outer)
ex=json.loads((S/'external-inputs.json').read_bytes());oldex=json.loads((S.parent/'resume8/external-inputs.json').read_bytes())
check('UNCHANGED39_STATIC_INPUTS',ex['files']==oldex['files'] and len(ex['files'])==39)
for key in ('phases','node','helm','dependencies','maximumSeconds','parentUmask','childUmask','noRetry','noSignals','phaseIds','workspace','runtime','protocol'):
 check('UNCHANGED_NATIVE_'+key,json.loads((S/'scope.json').read_bytes())[key]==json.loads((S.parent/'resume8/scope.json').read_bytes())[key])
ret=json.loads((Q/'retained.stdout').read_bytes());combined=json.loads((Q/'combined.stdout').read_bytes());qc=json.loads((Q/'checks.json').read_bytes());record=json.loads((Q/'review-record.json').read_bytes())
check('QUINN_COMPLETE_RECORD',record['reviewer']=='Quinn' and record['subjectManifestSha256']=='1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7' and record['protocol']==m['protocol'] and record['mandatoryFindings']==[])
check('QUINN_INDEPENDENT1137',qc['count']==1137 and all(x['passed'] is True for x in qc['checks']))
check('QUINN159_237_396_371',ret['checks']==159 and combined['checks']==237 and len(ret['results']+combined['results'])==396 and len({x['id'] for x in ret['results']+combined['results']})==371)
check('QUINN_ALL_PASS_AND_ZERO_BOUNDARIES',all(x['passed'] is True for x in ret['results']+combined['results']) and ret['boundaryAttempts']==combined['boundaryAttempts']==[])
check('QUINN_SOURCE_BINDING',ret['runtimeSourceSha256']==combined['runtimeSha256']==h(r.encode()) and ret['entrySourceSha256']==combined['entrySha256']==h(e.encode()))
check('QUINN_EMPTY_STDERR',(Q/'retained.stderr').read_bytes()==(Q/'combined.stderr').read_bytes()==b'')
fix=json.loads((S/'six-fix-map.json').read_bytes());ids={x['id'] for x in ret['results']+combined['results']}
check('ALL_SIX_CATEGORIES',[x['category'] for x in fix['categories']]==list(range(1,7)))
for x in fix['categories']:check('CATEGORY_IDS_'+str(x['category']),set(x['currentTargetedSemanticIds'])<=ids and x['actualQualification'] is False)
templates=json.loads((S/'control-templates.json').read_bytes())
for name,value in templates.items():
 if type(value) is dict and 'guarantees' in value:
  check('TEN_FALSE_'+name,len(value['guarantees'])==10 and all(x is False for x in value['guarantees'].values()))
  check('SIX_NULL_'+name,len(value['unsupportedEvidence'])==6 and all(x=={'value':None,'reason':'NOT_PROVED_BY_LOCAL_RUNNER_PROFILE'} for x in value['unsupportedEvidence'].values()))
  check('CLOSED_SCOPE_'+name,value['historicalIdentityUncertainty'] is True and value['credit'] is False and value['C8'] is False and value['cleanupAuthorized'] is False and value['sourceWrites']==[])
schema=json.loads((S/'document-factories.schema.json').read_bytes())
check('PENDING_NO_INVENTED_FACTS',all(templates['rootProposal']['proposedAuthorization'][key] is None for key in schema['pendingOnlyNullFields']))
target=json.loads((O/'targeted-attempt01.stdout').read_bytes())
check('ARIA48_CURRENT_EXPECTED',target['checks']==48 and len(target['results'])==48 and all(x['passed'] is True for x in target['results']) and target['boundaryAttempts']==[])
check('ARIA_EMPTY_STDERR',(O/'targeted-attempt01.stderr').read_bytes()==b'')
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':h((S/'manifest.json').read_bytes()),'pins':pins,'protectedBaselineBodyStatHash':False,'currentOperationalReads':0},indent=2)+'\n')
(O/'source-checks.json').write_text(json.dumps({'kind':'ARIA_SOURCE09_FINITE_INTEGRITY_AND_MAP_CHECKS','checks':len(checks),'results':checks,'subjectFunctionsExecuted':0,'actualShellExecuted':False,'actualActions':0,'quinn396And1137BoundNotReplayed':True},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'pins':len(pins),'allPassed':True,'actualActions':0,'quinnBoundNotReplayed':[396,1137]}))

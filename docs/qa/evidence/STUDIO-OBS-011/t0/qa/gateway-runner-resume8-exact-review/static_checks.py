"""Finite pinned source/metadata/map verification; no subject function execution."""
from pathlib import Path
import ast,hashlib,json,shlex,stat
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume8')
P=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway-runner-resume8-exact-review')
results=[]
def check(name,condition):
 if not condition:raise ValueError(name)
 results.append({'id':name,'passed':True})
h=lambda x:hashlib.sha256(x).hexdigest()
raw=(S/'manifest.json').read_bytes();check('EXACT_MANIFEST',h(raw)=='c0dc0bc2646537b4ae466a7d715ed31103cc27d1d72eaf5683ecf8222279523c');m=json.loads(raw)
check('PAYLOAD60',len(m['files'])==60)
for r in m['files']:
 x=S/r['path'];b=x.read_bytes()
 check('HASH_'+r['path'],h(b)==r['sha256']);check('BYTES_'+r['path'],len(b)==r['bytes']);check('MODE_'+r['path'],stat.S_IMODE(x.stat().st_mode)==r['mode'])
for line in (S/'SHA256SUMS').read_text().splitlines():
 sha,name=line.split(None,1);name=name.lstrip('*');check('CHECKSUM_'+name,h((S/name).read_bytes())==sha)
for r in json.loads((S/'preparation-input-pins.json').read_text())['files']:
 x=Path(r['path']);b=x.read_bytes();check('PREP_'+r['path'],h(b)==r['sha256'] and len(b)==r['bytes'] and stat.S_IMODE(x.stat().st_mode)==r['mode'])
ex=json.loads((S/'external-inputs.json').read_bytes())
for name,r in ex['files'].items():
 b=Path(r['path']).read_bytes();check('EXTERNAL_'+name,h(b)==r['sha256'] and len(b)==r['bytes'] and stat.S_IMODE(Path(r['path']).stat().st_mode)==r['mode'])
check('EXTERNAL39',len(ex['files'])==39)
author=json.loads((S/'static-verification.json').read_bytes());check('AUTHOR_STRUCTURAL73_ATTRIBUTION',author['checks']==73 and all(r['passed'] for r in author['results']))
mp=json.loads((S/'interpretation-sites.json').read_bytes());trees={name:ast.parse((S/name).read_bytes()) for name in ['runtime.py','entry.py']}
check('NO_RUNTIME_ASSERT',not any(isinstance(n,ast.Assert) for t in trees.values() for n in ast.walk(t)))
for r in mp['functionSpans']:
 check('SPAN_'+r['source']+r['qualifiedName'],any(isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name==r['name'] and n.lineno==r['startLine'] and n.end_lineno==r['endLine'] for n in ast.walk(trees[r['source']])))
for r in [r for r in mp['sites'] if r['source'] in trees]:
 check('SITE_'+r['source']+str(r['line'])+r['call'],any(isinstance(n,ast.Call) and n.lineno==r['line'] and ast.unparse(n.func)==r['call'] for n in ast.walk(trees[r['source']])))
for r in mp['callbackSites']:
 check('CALLBACK_'+r['source']+str(r['line']),any(isinstance(n,ast.Lambda) and n.lineno==r['line'] and ast.unparse(n)==r['expression'] for n in ast.walk(trees[r['source']])))
check('SITE37',mp['siteCount']==len(mp['sites'])==37);check('CALLBACK20',mp['callbackCount']==len(mp['callbackSites'])==20);check('SPANS97',len(mp['functionSpans'])==97)
check('RUNTIME_CLASSES6',sum(isinstance(n,ast.ClassDef) for n in ast.walk(trees['runtime.py']))==6)
# Equality of enumerated physical sites prevents omitting a newly interpreted source.
actual={(src,n.lineno,ast.unparse(n.func)) for src,t in trees.items() for n in ast.walk(t) if isinstance(n,ast.Call) and ast.unparse(n.func) in ('json.loads','ast.parse','compile','exec')}
check('COMPLETE_INTERPRETATION_SET',actual=={(r['source'],r['line'],r['call']) for r in mp['sites'] if r['source'] in trees})
check('COMPLETE_CALLBACK_SET',{(src,n.lineno,ast.unparse(n)) for src,t in trees.items() for n in ast.walk(t) if isinstance(n,ast.Lambda)}=={(r['source'],r['line'],r['expression']) for r in mp['callbackSites']})
entry=(S/'entry.py').read_text()
for name in ['capture-once.bash','guard-exit.bash','author-control.template.bash','postclose.template.bash']:
 s=(S/name).read_text();quoted=shlex.quote(entry)
 check('EXACT_EMBEDDED_'+name,quoted in s)
 check('EMBEDDED_HEADER_'+name,h(entry.encode()) in s)
 check('NO_ASYNC_DELIVERY_'+name,'<(' not in s and '>(' not in s)
check('CAP_CONSUMED_BEFORE_PYTHON',(S/'capture-once.bash').read_text().index('readonly G8_CAPTURE_CONSUMED=1')<(S/'capture-once.bash').read_text().index('  "$G8_CAPTURE_PYTHON"'))
groups=json.loads((S/'integration-map.json').read_bytes())['groups'];check('ALL16_GROUPS',{g['mapping'] for g in groups}==set(range(1,17)))
known={r['qualifiedName'] for r in mp['functionSpans']}|{'entry.launch','unchanged source06 contracts.assess','guard-exit.bash','postclose.template.bash','control-templates.json','claim.schema.json','operation.schema.json','RECIPE.md'}
for g in groups:
 check('GROUP_FUNCTIONS_'+str(g['mapping']),all(n in known for n in g['functions']) and g['implementationPrepared'] is True and g['actualInstalledOrQualified'] is False)
old=json.loads(Path(ex['files']['scope06.json']['path']).read_bytes()) if 'scope06.json' in ex['files'] else None
# Current scope is exact copy of selected immutable native vectors, with local labels only.
scope=json.loads((S/'scope.json').read_bytes())
check('PHASE_ORDER',scope['phaseIds']==['prepare','red','install-fixed','green','archive'])
check('NATIVE_CAPS',scope['maximumSeconds']==300 and scope['parentUmask']=='077' and scope['childUmask']=='022' and scope['noRetry'] is True and scope['noSignals'] is True)
check('TEN_FALSE_MANIFEST',len(m['guarantees'])==10 and all(v is False for v in m['guarantees'].values()))
check('SIX_UNSUPPORTED_MANIFEST',len(m['unsupportedEvidence'])==6 and all(v=={'value':None,'reason':'NOT_PROVED_BY_LOCAL_RUNNER_PROFILE'} for v in m['unsupportedEvidence'].values()))
q=json.loads((P/'controls.stdout').read_text());check('REQUIRED159',q['checks']==len(q['results'])==159 and all(r['passed'] for r in q['results']) and q['boundaryAttempts']==[] and q['original333ControlsReplayed']==0)
check('REPLAY_NO_SOURCE_INSTRUMENTATION',q['subjectAstInstrumentation'] is False and q['runtimeSourceSha256']==m['coreRuntimeSha256'] and q['entrySourceSha256']==m['bootstrapEntrySha256'])
check('NO_REPLAY_STDERR',(P/'controls.stderr').read_bytes()==b'')
print(json.dumps({'kind':'INDEPENDENT_FINITE_SOURCE_PIN_MAP_CHECKS','count':len(results),'results':results,'allExpected':True,'author73StructuralChecksAttributionOnly':True,'required159ReplayedOnce':True,'prior333Replayed':0,'actualRuntimeActions':0},indent=2))

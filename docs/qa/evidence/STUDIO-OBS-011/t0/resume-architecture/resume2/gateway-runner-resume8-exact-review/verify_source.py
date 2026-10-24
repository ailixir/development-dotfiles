"""Finite approved public source/metadata verification, no runtime/protected baseline reads."""
from pathlib import Path
import ast,hashlib,json,shlex,stat
T=Path('docs/qa/evidence/STUDIO-OBS-011/t0');D=T/'early/gateway80-proof-prep/resume8';O=Path(__file__).parent
checks=[];pins={}
def check(name,ok):
    if ok is not True:raise AssertionError(name)
    checks.append(dict(name=name,passed=True))
def sha(raw):return hashlib.sha256(raw).hexdigest()
def pin(path,h=None,size=None,mode=None):
    path=Path(path).absolute()
    if '/runtime/' in str(path) or path.name=='preexisting-baseline.json':raise AssertionError('OUTSIDE_STATIC_SCOPE')
    raw=path.read_bytes();info=path.lstat();check('regular '+str(path),stat.S_ISREG(info.st_mode))
    if h is not None:check('SHA '+str(path),sha(raw)==h)
    if size is not None:check('bytes '+str(path),len(raw)==size)
    if mode is not None:check('mode '+str(path),stat.S_IMODE(info.st_mode)==(int(mode,0) if isinstance(mode,str) else mode))
    pins[str(path)]=dict(path=str(path),sha256=sha(raw),bytes=len(raw),mode=stat.S_IMODE(info.st_mode));return raw
def sealed(directory,h):
    m=json.loads(pin(directory/'manifest.json',h));data={}
    for r in m.get('files',m.get('members')):data[r['path']]=pin(directory/r['path'],r['sha256'],r['bytes'],r['mode'])
    check('exact finite members '+str(directory),{str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()}==set(data)|{'manifest.json'})
    return m,data
m,b=sealed(D,'c0dc0bc2646537b4ae466a7d715ed31103cc27d1d72eaf5683ecf8222279523c')
check('60 source members',len(b)==60)
for line in b['SHA256SUMS'].decode().splitlines():
    digest,name=line.split('  ',1);check('checksum '+name,sha(b[name])==digest)
for r in json.loads(b['preparation-input-pins.json'])['files']:pin(r['path'],r['sha256'],r['bytes'],r['mode'])
sealed(T/'resume-architecture/resume2/gateway-next-execution-evidence-design','3bbc86a625a2e362508ab81c8cf15c8a09ca55a0abd15e1e49e502ea4f91e007')
sealed(T/'qa/gateway-next-execution-evidence-design-review','2f148fc323164547b59e7b945436b3fd221a0d826dbfd192e2f4ca7ccd4eb5b4')
ext=json.loads(b['external-inputs.json']);old=json.loads(pin(ext['staticManifest']['path'],ext['staticManifest']['sha256']));rows={r['path']:r for r in old['files']}
check('39 selected static inputs',len(ext['files'])==39)
for name,r in ext['files'].items():
    pin(r['path'],r['sha256'],r['bytes'],r['mode'])
    if r.get('source06Member') is not None:
        previous=rows[r['source06Member']]
        check('source06 member binding '+name,all(previous[k]==r[k] for k in ('sha256','bytes','mode')))
trees={n:ast.parse(b[n]) for n in ('runtime.py','entry.py')}
for name,tree in trees.items():check('non-removable safety checks '+name,not any(isinstance(n,ast.Assert) for n in ast.walk(tree)))
sites=json.loads(b['interpretation-sites.json'])
check('37 sites20callbacks97spans',len(sites['sites'])==37 and len(sites['callbackSites'])==20 and len(sites['functionSpans'])==97)
for row in sites['sites']:
    if row['source']=='SHELL-BINDING.md':
        check('same buffer shell site '+row['consumer'],row['inputExpression'] in b['SHELL-BINDING.md'].decode() and 'eval immutable readonly buffer'==row['call'])
    else:
        check('interpretation '+str((row['source'],row['line'])),any(isinstance(n,ast.Call) and n.lineno==row['line'] and ast.unparse(n.func)==row['call'] for n in ast.walk(trees[row['source']])))
for row in sites['callbackSites']:
    check('callback '+str((row['source'],row['line'])),any(isinstance(n,ast.Lambda) and n.lineno==row['line'] and ast.unparse(n)==row['expression'] for n in ast.walk(trees[row['source']])))
for row in sites['functionSpans']:
    check('span '+row['qualifiedName'],any(isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name==row['name'] and n.lineno==row['startLine'] and n.end_lineno==row['endLine'] for n in ast.walk(trees[row['source']])))
classes={n.name for n in trees['runtime.py'].body if isinstance(n,ast.ClassDef)}
check('six complete runtime classes',classes=={'Ownership','Files','Budget','Ledger','PendingHolder','Context'})
groups=json.loads(b['integration-map.json'])['groups'];check('16 mapped groups',len(groups)==16 and {g['mapping'] for g in groups}==set(range(1,17)))
available={n.name for tree in trees.values() for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
for group in groups:
    for name in group['functions']:
        if name=='unchanged source06 contracts.assess':
            contract=ast.parse(pin(ext['files']['contracts.py']['path'],ext['files']['contracts.py']['sha256']))
            check('mapped unchanged assessor',any(isinstance(n,ast.FunctionDef) and n.name=='assess' for n in contract.body))
        else:
            check('mapped function or complete artifact '+name,name in b or name.split('.')[-1] in available)
for name,var in [('capture-once.bash','G8_CAPTURE_LOADER'),('guard-exit.bash','G8_LOADER'),('author-control.template.bash','G8_AUTHOR_LOADER'),('postclose.template.bash','G8_POSTCLOSE_LOADER')]:
    text=b[name].decode();lines=[line for line in text.splitlines() if line.startswith('readonly ') and '_LOADER=' in line]
    if lines:
        actualvar=lines[0].split('=',1)[0].split()[1]
        start=text.index('readonly '+actualvar+'=')+len('readonly '+actualvar+'=')
    else:
        start=text.index('-I -B -c ')+len('-I -B -c ')
    end=text.index("sys.exit(result)\n'",start)+len("sys.exit(result)\n'")
    check('same verified embedded entry '+name,shlex.split(text[start:end])==[b['entry.py'].decode()])
check('literal old native phases',json.loads(b['scope.json'])['phases']==json.loads(pin(D.parent/'resume6/scope.json'))['phases'])
check('ten false guarantees',len(m['guarantees'])==10 and all(v is False for v in m['guarantees'].values()))
check('six unsupported nulls',len(m['unsupportedEvidence'])==6 and all(v['value'] is None and v['reason']=='NOT_PROVED_BY_LOCAL_RUNNER_PROFILE' for v in m['unsupportedEvidence'].values()))
check('333 attribution only',m['retainedPrior333ControlsReplayed']==0 and m['priorControlsAttributionOnly']==333)
check('author159 passed attribution',len(json.loads(b['guarded-current-results.json'])['results'])==159 and all(r['passed'] for r in json.loads(b['guarded-current-results.json'])['results']))
(O/'pins.json').write_text(json.dumps(dict(count=len(pins),pins=list(pins.values()),protectedBaselineRuntimeActions=0),indent=2)+'\n')
(O/'source-checks.json').write_text(json.dumps(dict(count=len(checks),checks=checks,actualActions=0),indent=2)+'\n')
print(json.dumps(dict(checks=len(checks),pins=len(pins),members=60,actualActions=0)))

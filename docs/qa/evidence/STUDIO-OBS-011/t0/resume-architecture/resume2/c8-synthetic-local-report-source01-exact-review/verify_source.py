"""Independent exact public source/pin/AST review; no target execution."""
import ast,hashlib,json,stat,shlex
from pathlib import Path
HERE=Path(__file__).absolute().parent;T=HERE.parents[2];ROOT=next(p for p in HERE.parents if p.name=='ui-studio');SUB=T/'early/c8-synthetic-local-report-prep/resume1'
PINS=[];CHECKS=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,ok):
    if ok is not True:raise ValueError(n)
    CHECKS.append(dict(name=n,passed=True))
def read(p,h=None,expected_bytes=None,expected_mode=None):
    b=p.read_bytes();s=p.lstat();check('regular:'+str(p.relative_to(ROOT)),stat.S_ISREG(s.st_mode) and not p.is_symlink())
    if h is not None:check('SHA:'+str(p.relative_to(ROOT)),sha(b)==h)
    if expected_bytes is not None:check('bytes:'+str(p.relative_to(ROOT)),len(b)==expected_bytes)
    if expected_mode is not None:check('mode:'+str(p.relative_to(ROOT)),stat.S_IMODE(s.st_mode)==(int(expected_mode,8) if type(expected_mode)is str else expected_mode))
    PINS.append(dict(path=str(p.relative_to(ROOT)),sha256=sha(b),bytes=len(b),mode=stat.S_IMODE(s.st_mode)));return b
def packet(d,h):
    m=json.loads(read(d/'manifest.json',h));rows=m.get('files',m.get('members',[]))
    for row in rows:read(d/row['path'],row['sha256'],row['bytes'],row['mode'])
    return m
subject=packet(SUB,'bf6ff7d9cd627c40c6df37c9edc841cb7242170a287d3d15c9f1681899d764b7');check('exact48',len(subject['files'])==48)
checksums=read(SUB/'SHA256SUMS','67db009692730ceab5060bd6fdf69f268b9539ee592ae6b1caa6cd657beb1d6f',expected_mode=0o644)
listed={name:h for h,name in (line.split('  ',1) for line in checksums.decode().splitlines())}
check('checksum49',len(listed)==49 and set(listed)=={r['path'] for r in subject['files']}|{'manifest.json'})
for name,h in listed.items():check('checksum:'+name,sha((SUB/name).read_bytes())==h)
check('exact_subject_membership',{p.name for p in SUB.iterdir()}==set(listed)|{'SHA256SUMS'})
for row in json.loads((SUB/'verified-preparation-inputs.json').read_bytes()):
    p=Path(row['path']);check('approved_public_only:'+row['path'],'/runtime/' not in row['path'] and not row['path'].endswith('/preexisting-baseline.json'))
    read(p,row['sha256'],row['bytes'],row['mode'])
packet(T/'resume-architecture/resume2/c8-ordinary-adapter-consumer-integration-design','4de71b8fd5986ea8be023e58fe8dd549960630e1a51b03b35d84089a4adadfc6')
packet(T/'qa/c8-ordinary-adapter-consumer-integration-design-review','fb0b3d401ff0484406698f6c40e39e6f803a27c08d34af5c9c70a359ac86a03d')
read(T/'resume2-c8-consumer-integration-design-qa-root-adoption.json','14d53e384f92b52ede6fc4ed52b423582d6a3441ad07895451f70afe690d1789')
for suffix in ('task.txt','context.json'):read(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011'/('c8-synthetic-local-report-source01-architecture-review-'+suffix))
trees={n:ast.parse((SUB/n).read_bytes()) for n in ('entry.py','profile.py','qualification_custody.py','storage.py','runtime.py','mode_predicates.py','controls.py','public_contract.py')}
for name,tree in trees.items():check('nonremovable:'+name,not any(isinstance(n,ast.Assert) for n in ast.walk(tree)))
mapping=json.loads((SUB/'finite-method-dependency-map.json').read_bytes())
for row in mapping['methods']:
    node=[n for n in ast.walk(trees[row['file']]) if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.lineno==row['line']]
    check('mapped:'+row['file']+':'+row['name'],len(node)==1 and node[0].name==row['name'].split('.')[-1])
caller=(SUB/'root-caller.bash').read_text();start=caller.index("readonly C8_S0_ENTRY=")+len('readonly C8_S0_ENTRY=');end=caller.index('\n# Descriptor',start)
literal=shlex.split(caller[start:end]);check('entry_literal_exact',len(literal)==1 and literal[0].encode()==(SUB/'entry.py').read_bytes())
template=(SUB/'root-caller.template.bash').read_text();assignment=caller[start-len('readonly C8_S0_ENTRY='):end]
check('caller_template_exact_expansion',template.replace('# @LITERAL_VERIFIED_ENTRY_ASSIGNMENT@',assignment)==caller)
first=(SUB/'first-read.template.bash').read_text();check('first_read_cap',str(len(caller.encode())+1) in first and sha(caller.encode()) in first and 'builtin eval "$C8_S0_READ_BUFFER"' in first)
for n,h in [('observer-fragment.java.txt','0153a4d415ebd9e9c98d4230adacc4e807a9ed1dc583d8bf859a2dfaf20ebc66'),('ObserverBoundaryHarness.java','82a90d1a0925e8118cb146d652c73bf2a3a748a1df2de89337e7a9e50d73f25f')]:check('frozen:'+n,sha((SUB/n).read_bytes())==h)
for n in ('qualification_custody.py','public_contract.py','ObserverBoundaryHarness.java','observer-fragment.java.txt','java-harness-body.java.txt','tls-driver.java.txt','public-observation.schema.json'):check('literal_JAVA02_reuse:'+n,(SUB/n).read_bytes()==(T/'early/c8-public-observer-java-qualification-prep/resume2'/n).read_bytes())
runtime=(SUB/'runtime.py').read_text();check('separate_synthetic_predicate','def synthetic_relay_qualified(' in runtime and 'C.relay_qualified(' not in runtime)
ast_self=next(n for n in trees['runtime.py'].body if isinstance(n,ast.FunctionDef) and n.name=='self_text');enc=next(n.lineno for n in ast.walk(ast_self) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='encode');bound=next(n.lineno for n in ast.walk(ast_self) if isinstance(n,ast.Compare) and ast.unparse(n)=='len(raw) > 4096')
check('observed_selftext_encode_precedes_byte_bound',enc<bound)
facts=dict(status='FINITE_REVIEW_COMPLETED',checks=len(CHECKS),pins=len(PINS),subjectPayloads=48,checksumRows=49,mappedMethods=len(mapping['methods']),actualTargetExecution=0,currentRuntimePrivateBaselineReads=0,checksDetail=CHECKS,inputs=PINS)
(HERE/'finite-results.json').write_text(json.dumps(facts,indent=2)+'\n');print(json.dumps({k:v for k,v in facts.items() if k not in ('checksDetail','inputs')}))

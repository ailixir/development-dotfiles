"""Finite source-author copy/extraction only. No target import/helper executes."""
from pathlib import Path
import ast,hashlib,json,stat
HERE=Path(__file__).absolute().parent;T0=HERE.parents[2]
J=T0/'early/c8-public-observer-java-qualification-prep/resume2'
G=T0/'early/gateway80-proof-prep/resume9'
PINS=[]
def read(path,expected=None):
    raw=path.read_bytes();info=path.stat();digest=hashlib.sha256(raw).hexdigest()
    if expected is not None and expected!=digest:raise RuntimeError('SOURCE_PIN')
    PINS.append(dict(path=str(path),sha256=digest,bytes=len(raw),mode=stat.S_IMODE(info.st_mode)))
    return raw
def packet(path,digest):
    raw=read(path/'manifest.json',digest);data=json.loads(raw)
    for row in data.get('files',data.get('members')):
        value=read(path/row['path'],row['sha256']);mode=row['mode']
        if type(mode) is str:mode=int(mode,0) if mode.startswith('0o') else int(mode,8)
        if len(value)!=row['bytes'] or stat.S_IMODE((path/row['path']).stat().st_mode)!=mode:raise RuntimeError('SOURCE_METADATA')
    return data
packet(T0/'resume-architecture/resume2/c8-ordinary-adapter-consumer-integration-design','4de71b8fd5986ea8be023e58fe8dd549960630e1a51b03b35d84089a4adadfc6')
packet(T0/'qa/c8-ordinary-adapter-consumer-integration-design-review','fb0b3d401ff0484406698f6c40e39e6f803a27c08d34af5c9c70a359ac86a03d')
read(T0/'resume2-c8-consumer-integration-design-qa-root-adoption.json','14d53e384f92b52ede6fc4ed52b423582d6a3441ad07895451f70afe690d1789')
packet(J,'5fc40ba271e9fc77d220b6cae6d5324a8110f4de3c67423c0c5908bd8eca619f')
packet(T0/'qa/c8-public-observer-java-qualification-source02-exact-review','4eaeff5ae3ff969dcceecbfa6ad38381fc1b90ed7d1a22a1a69b65591b7a714e')
packet(T0/'resume-architecture/resume2/c8-public-observer-java-qualification-source02-exact-review','3e2218940f7b189f2cb2eee709f332b38125b5bdc2af9fc797022609e5cc9a2c')
read(T0/'resume2-c8-java-qualification-source02-exact-source-root-adoption.json','18f7cc159d785cd46d2f20ec0367e34e5e1a18065363ba71bd41148c583e44e1')
packet(G,'1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7')
read(T0/'resume2-gateway-self-text05-actual-metadata-root-inspection.json','279ba9a0125c87b28f0b98492d7753ca3aa574838283e92f582ddbafafe26496')
for name in ('ObserverBoundaryHarness.java','observer-fragment.java.txt','java-harness-body.java.txt','tls-driver.java.txt','public_contract.py','public-observation.schema.json','qualification_custody.py'):
    (HERE/name).write_bytes(read(J/name))
source=read(J/'qualification_controller.py').decode();tree=ast.parse(source);lines=source.splitlines(keepends=True)
names={'Hold','need','reason','hash_value','native_projection','positive','fields','strict','mode_evidence'}
parts=[]
for node in tree.body:
    if isinstance(node,(ast.ClassDef,ast.FunctionDef)) and node.name in names:
        parts.append(''.join(lines[node.lineno-1:node.end_lineno]))
    elif isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id in ('MODES','NATIVE_FIELDS','REASONS') for t in node.targets):parts.append(''.join(lines[node.lineno-1:node.end_lineno]))
(HERE/'mode_predicates.py').write_text('"""Exact selected SOURCE02 pure mode/projection definitions; no main/effects."""\nimport json,re\n\n'+'\n\n'.join(parts)+'\n')
legacy=T0/'early/gateway80-proof-prep/resume6/run-private.py'
source=read(legacy,'edbec32b84f290855304bec9ba7cf942b0d1cde59f197a62b5d5a6ba4750cce0').decode();tree=ast.parse(source)
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='strict_lock_fields')
(HERE/'strict_lock_fields.py.txt').write_text(ast.get_source_segment(source,node)+'\n')
(HERE/'verified-preparation-inputs.json').write_text(json.dumps(PINS,indent=2)+'\n')
print(json.dumps(dict(approvedPinReads=len(PINS),actualTargetActions=0)))

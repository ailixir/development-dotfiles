"""Actual extracted custody/validation functions with an in-memory filesystem."""
import ast,io,json,stat,types
from pathlib import Path
HERE=Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-failed-resource-prep/resume2')
OUT=HERE.parents[2]/'resume-architecture/resume2/c8-check01-failed-resource-resume2-code-review'
pred={'__name__':'pure_policy'};exec(compile((HERE/'predicates.py').read_bytes(),'<pure-policy>','exec'),pred)
node=next(n for n in ast.parse((HERE/'adapter_checks.py').read_text()).body if isinstance(n,ast.ClassDef) and n.name=='FakeOS')
fakes={'io':io,'stat':stat,'types':types};exec(compile(ast.Module(body=[node],type_ignores=[]),'<in-memory-fs>','exec'),fakes)
names={'Custody','local','validate_negative'}
nodes=[n for n in ast.parse((HERE/'failed_resource.py').read_text()).body if isinstance(n,(ast.ClassDef,ast.FunctionDef)) and n.name in names]
results=[]
for variant in ('single-component validator','post-bootstrap policy validator'):
    fake=fakes['FakeOS']();base='/repo/unit/failed-resource-disposition01'
    denial={'clientJournal':'nested/proof.json'}
    fake.nodes[base+'/negative-readiness-denial.json']=fake.node(100,stat.S_IFREG|0o600,json.dumps(denial).encode())
    fake.nodes[base+'/nested']=fake.node(101,stat.S_IFLNK|0o777)
    fake.nodes[base+'/nested/proof.json']=fake.node(102,stat.S_IFREG|0o600,b'{"syntheticOnly":true}')
    read_bodies=[];fdopen=fake.fdopen
    def tracking(fd,mode,closefd=False):
        read_bodies.append(fake.fds[fd][0]);return fdopen(fd,mode,closefd)
    fake.fdopen=tracking
    localcanonical=lambda s:isinstance(s,str) and bool(s) and '/' not in s and s not in ('.','..')
    ns={k:v for k,v in pred.items() if not k.startswith('__')}
    ns.update(os=fake,Path=Path,stat=stat,json=json,PIN='p'*64,canonical=localcanonical if variant=='single-component validator' else pred['canonical'])
    exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-custody-and-negative-validator>','exec'),ns)
    c=ns['Custody'](base,0o700)
    held=None
    try:ns['validate_negative']({'custody':c,'sha':'r'*64,'pin':{'shellPid':11}})
    except Exception as e:held=str(e)
    finally:c.close()
    if variant=='single-component validator':assert held=='MEMBER_NAME' and read_bodies==[base+'/negative-readiness-denial.json']
    else:assert held=='NEGATIVE_SCHEMA' and read_bodies==[base+'/negative-readiness-denial.json',base+'/nested/proof.json']
    results.append({'variant':variant,'eventualHold':held,'bodyReads':read_bodies,'nestedAncestorWasSymlink':True,'actualFilesystemOrPrivateBodyRead':False})
with (OUT/'supplemental-check-results.json').open('x') as out:json.dump({'scope':'ACTUAL_AST_DEFINITIONS_IN_MEMORY_FILESYSTEM_ONLY','cases':results,'nestedMemberBoundaryDefectReproduced':True,'actualRuntimeImportMainOsProcessNativePrivateActions':0},out,indent=2);out.write('\n')
print(json.dumps({'pairedCases':2,'defect':'POST_BOOTSTRAP_CANONICAL_OVERWRITE_ALLOWS_NESTED_JOURNAL_BODY_BEFORE_SCHEMA_HOLD','actualActions':0}))

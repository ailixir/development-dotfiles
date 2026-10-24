"""Finite exact public source metadata/AST inspection. No subject function executes."""
from pathlib import Path
import ast,hashlib,json,stat,difflib
HERE=Path(__file__).absolute().parent
T0=HERE.parents[2]
S=T0/'early/gst-style-isolated-validation-prep/resume1'
CHECKS=[];PINS=[]
def check(name,ok):
    if ok is not True:raise RuntimeError(name)
    CHECKS.append(dict(name=name,passed=True))
def raw(path,expected=None):
    value=path.read_bytes();info=path.stat();digest=hashlib.sha256(value).hexdigest()
    if expected is not None:check('SHA_'+str(path),digest==expected)
    PINS.append(dict(path=str(path),sha256=digest,bytes=len(value),mode=stat.S_IMODE(info.st_mode)))
    return value
def packet(path,sha):
    value=json.loads(raw(path/'manifest.json',sha))
    for row in value.get('files',value.get('members')):
        name=path/row['path'];value_raw=raw(name,row['sha256'])
        check('BYTES_'+str(name),len(value_raw)==row['bytes'])
        mode=row['mode']
        if type(mode) is str:mode=int(mode,0) if mode.startswith('0o') else int(mode,8)
        check('MODE_'+str(name),stat.S_IMODE(name.stat().st_mode)==mode)
    return value
subject=packet(S,'67ae068fc92006900082af0b1aca4cfc46c90737812d550392d9f5575f3aad26')
packet(T0/'resume-architecture/resume2/gst-style-isolated-validation-design','1080e08125dc5f137ef7336be2eeb7b7aca42279528f624c8194b288dd0c3f8d')
packet(T0/'qa/gst-style-isolated-validation-design-review','9c79d0a5a32d2228ffa2f1235cb087320f91bff2f145d9cb04730239614992c9')
raw(T0/'resume2-gst-style-isolated-design-qa-root-adoption.json','9b45d5d86d2198d2d62d3dcd0133a2ad9e50c0a4aa552613c2883540e42a25f3')
external=json.loads((S/'external-pins.json').read_bytes())
for row in external['publicInputs']:
    value=raw(Path(row['path']),row['sha256'])
    check('PUBLIC_BYTES_'+row['path'],len(value)==row['bytes'])
    check('PUBLIC_MODE_'+row['path'],stat.S_IMODE(Path(row['path']).stat().st_mode)==row['mode'])
candidate=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-checkstyle-remediation-prep/resume1')
packet(candidate,'b6a935f9235b8b80cbaf5ddff4502631290668fe12334dccd1caba1dd612473e')
plan=json.loads((S/'unit-plan.json').read_bytes())
rows=plan['finiteCopy']['members']
check('FINITE2092',len(rows)==2092 and len({x['path'] for x in rows})==2092)
check('NULL284_RETAINED',sum(x['mode'] is None for x in rows)==284)
check('SOURCE1808',sum(x['origin']=='SOURCE1808' for x in rows)==1808)
for row in rows:
    check('FINITE_SAFE_PATH_'+row['path'],type(row['path']) is str and not row['path'].startswith('/') and all(x not in ('','.','..','.git','node_modules') for x in row['path'].split('/')))
    check('FINITE_HASH_'+row['path'],len(row['sha256'])==64 and all(x in '0123456789abcdef' for x in row['sha256']))
check('EXACT3_OVERLAYS',len(plan['overlay'])==3)
phases={x['id']:x for x in plan['phases']}
check('EXACT_ACCEPTANCE_DEADLINES',{p:phases[p]['acceptanceDeadlineSeconds'] for p in ('format','verify','regression')}==dict(format=900,verify=3600,regression=7200))
check('REGRESSION99_FIVE',len(phases['regression']['caseCatalog'])==99 and len(phases['regression']['classCounts'])==5)
check('PLAN_NO_FRESH_FACT',plan['pathExistenceOrCurrentHolderObserved'] is False)
check('NO_CLEANUP',plan['closure']['cleanupAuthorized'] is False)
check('COPY_PROJECT_ROOT',plan['roots']['projectP']==plan['roots']['ownedW']+'/repo')
selection=json.loads((S/'selected-definitions.json').read_bytes())
for i,(path,spec) in enumerate(selection.items()):
    value=(S/('selected-buffer-'+str(i)+'.py.txt')).read_bytes()
    check('SELECTED_BUFFER_PIN_'+str(i),hashlib.sha256(value).hexdigest()==spec['sha256'])
    original=raw(Path(path),spec['sha256'])
    check('SELECTED_BUFFER_LITERAL_'+str(i),value==original)
    tree=ast.parse(value)
    for name in spec['definitions']:
        nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name]
        check('SELECTED_ONE_'+name,len(nodes)==1)
        check('SELECTED_NO_DECORATOR_'+name,nodes[0].decorator_list==[])
check('SAME_COMPILED_SOURCE_BUFFER',b"exec(compile(raw_source," in (S/'selected_adapter.py').read_bytes())
check('SAME_SELECTED_AST_BUFFER',b'ast.parse(raw, filename=path)' in (S/'selected_adapter.py').read_bytes())
old_format=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-restricted-unit-prep/resume6/gst-three-only.init.gradle').read_text()
new_format=(S/'style-format-reports.init.gradle').read_text()
expected=old_format.replace("/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend","/private/tmp/obs011-gst-style-isolated01-20261019/repo/backend")
expected=expected.replace("'spotlessJavaApply', 'spotlessInternalRegisterDependencies'","'spotlessJavaApply', 'spotlessJavaCheck', 'spotlessInternalRegisterDependencies'")
expected=expected.replace('    gradle.taskGraph.whenReady { graph ->',"    // Reporting metadata only: keep full source sets and all Checkstyle rules unchanged.\n    p.tasks.withType(org.gradle.api.plugins.quality.Checkstyle).configureEach { task ->\n        task.reports.xml.required.set(true)\n    }\n    gradle.taskGraph.whenReady { graph ->")
check('ONLY_THREE_FORMAT_HOOK_DELTAS',new_format==expected)
peer=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft/resume5-wording-peer/filtered-output.init.gradle').read_bytes()
check('ONLY_ONE_PEER_ROOT_DELTA',(S/'peer-filter.init.gradle').read_bytes()==peer.replace(b'/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend',b'/private/tmp/obs011-gst-style-isolated01-20261019/repo/backend'))
for name in ('pure_controller.py','selected_adapter.py'):
    tree=ast.parse((S/name).read_bytes())
    check('NO_IMPORT_OR_MAIN_'+name,not any(isinstance(n,(ast.Import,ast.ImportFrom)) for n in ast.walk(tree)) and not any(isinstance(n,ast.If) and '__name__' in ast.dump(n.test) for n in tree.body))
flow=(S/'fake_flow.py').read_bytes()
check('PERMANENT_AUDIT_PRESENT',b'sys.addaudithook(deny_effect)' in flow)
check('NO_AUDIT_DISABLE',b'sys.addaudithook' in flow and b'setaudit' not in flow)
check('FAKE_EFFECT_BOUNDARY_EXPLICIT',b'class FakePort:' in flow and b'FakeET, FakePath' in flow)
check('TWO_FAILED_ATTEMPTS_RETAINED',len((S/'fake-flow-attempt1.stderr').read_bytes())>0 and len((S/'fake-flow-attempt2.stderr').read_bytes())>0)
check('ATTEMPT2_CAUSE_UNKNOWN',b'first inner cause UNKNOWN' in (S/'execution-record.json').read_bytes())
(HERE/'checks.json').write_text(json.dumps(dict(kind='ARIA_FINITE_GST_SOURCE01_STATIC_CHECKS',passed=len(CHECKS),failed=0,checks=CHECKS,actualSubjectFunctions=0),indent=2)+'\n')
(HERE/'pins.json').write_text(json.dumps(PINS,indent=2)+'\n')
(HERE/'plan-summary.json').write_text(json.dumps(dict(roots=plan['roots'],phases=plan['phases'],copyRows=len(rows),unknownModes=284,source39Pins=len(external['publicInputs']),ordinaryRuntimePortImplemented=False),indent=2)+'\n')
print(json.dumps(dict(passed=len(CHECKS),pins=len(PINS),actualTargetActions=0)))

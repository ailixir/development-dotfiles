"""Finite exact SOURCE02 integrity/AST/proof-reuse checks; no subject invocation."""
from pathlib import Path
import ast,hashlib,json,stat
HERE=Path(__file__).absolute().parent
T0=HERE.parents[2]
S=T0/'early/gst-style-isolated-validation-prep/resume2'
OLD=S.parent/'resume1'
CHECKS=[];PINS=[]
def check(name,ok):
    if ok is not True:raise RuntimeError(name)
    CHECKS.append(dict(name=name,passed=True))
def read(path,expected=None):
    raw=path.read_bytes();info=path.stat();digest=hashlib.sha256(raw).hexdigest()
    if expected is not None:check('SHA_'+str(path),digest==expected)
    PINS.append(dict(path=str(path),sha256=digest,bytes=len(raw),mode=stat.S_IMODE(info.st_mode)))
    return raw
def packet(path,expected):
    manifest=json.loads(read(path/'manifest.json',expected))
    for row in manifest.get('files',manifest.get('members')):
        p=path/row['path'];raw=read(p,row['sha256']);mode=row['mode']
        if type(mode) is str:mode=int(mode,0) if mode.startswith('0o') else int(mode,8)
        check('BYTES_'+str(p),len(raw)==row['bytes']);check('MODE_'+str(p),stat.S_IMODE(p.stat().st_mode)==mode)
    return manifest
current=packet(S,'0bac75fdd932a1858aef8dfb9e67d1769025966c707bfe9dd28122545b2534b2')
old=packet(OLD,'67ae068fc92006900082af0b1aca4cfc46c90737812d550392d9f5575f3aad26')
packet(T0/'resume-architecture/resume2/gst-style-isolated-validation-source01-exact-review','1b9a734119c87c43ec8282fa6146428bf94df0c0d9221b2545a9e3d5aa3a25e5')
packet(T0/'qa/gst-style-isolated-validation-source01-exact-review','bf7a2bb47fdce812231321f2bbff2502567f77d3b50a8c52802e4dec7d7bfe12')
read(T0/'resume2-gst-isolated-source01-all-findings-root-adoption.json','02177a09d8684fb7c5a7c2fd3a22e480620989383d7bd894ef72e35c9e59ed49')
packet(T0/'resume-architecture/resume2/gst-style-isolated-validation-design','1080e08125dc5f137ef7336be2eeb7b7aca42279528f624c8194b288dd0c3f8d')
packet(T0/'qa/gst-style-isolated-validation-design-review','9c79d0a5a32d2228ffa2f1235cb087320f91bff2f145d9cb04730239614992c9')
read(T0/'resume2-gst-style-isolated-design-qa-root-adoption.json','9b45d5d86d2198d2d62d3dcd0133a2ad9e50c0a4aa552613c2883540e42a25f3')
for name in ('selected_adapter.py','selected-definitions.json','selected-buffer-0.py.txt','selected-buffer-1.py.txt','unit-plan.json','style-format-reports.init.gradle','peer-filter.init.gradle','hooks.diff','owned-gradle.properties','external-pins.json','virtual-composition.json','retained-source-location-map.json'):
    check('LITERAL_REUSE_'+name,(S/name).read_bytes()==(OLD/name).read_bytes())
history=json.loads((S/'source01-history-index.json').read_bytes())
check('ALL35_HISTORY_ROWS',len(history['rows'])==35)
for row in history['rows']:
    raw=(S/row['retainedPath']).read_bytes()
    check('HISTORY_EXACT_'+row['source01Path'],hashlib.sha256(raw).hexdigest()==row['sha256'] and len(raw)==row['bytes'])
for row in json.loads((S/'current-buffer-pins.json').read_bytes())['rows']:
    raw=(S/row['path']).read_bytes();check('CURRENT_CALLER_INPUT_'+row['path'],hashlib.sha256(raw).hexdigest()==row['sha256'] and len(raw)==row['bytes'])
plan=json.loads((S/'unit-plan.json').read_bytes())
check('2092_ROWS_LITERAL',len(plan['finiteCopy']['members'])==2092)
check('284_NULL_NOT_CURRENT_MODES',sum(x['mode'] is None for x in plan['finiteCopy']['members'])==284)
check('SOURCE1808',sum(x['origin']=='SOURCE1808' for x in plan['finiteCopy']['members'])==1808)
check('OVERLAY3',len(plan['overlay'])==3)
native={x['id']:x for x in plan['phases'] if x['id'] in ('format','verify','regression')}
check('DEADLINES_900_3600_7200',{k:v['acceptanceDeadlineSeconds'] for k,v in native.items()}==dict(format=900,verify=3600,regression=7200))
check('FIVE_CLASS99',len(native['regression']['caseCatalog'])==99 and len(native['regression']['classCounts'])==5)

old_tree=ast.parse((OLD/'pure_controller.py').read_bytes());tree=ast.parse((S/'pure_controller.py').read_bytes())
for node in old_tree.body:
    if isinstance(node,(ast.FunctionDef,ast.ClassDef)) and node.name!='Controller':
        other=next(x for x in tree.body if isinstance(x,type(node)) and x.name==node.name)
        check('UNCHANGED_TOP_DEFINITION_'+node.name,ast.dump(node,include_attributes=False)==ast.dump(other,include_attributes=False))
before=next(x for x in old_tree.body if isinstance(x,ast.ClassDef) and x.name=='Controller')
after=next(x for x in tree.body if isinstance(x,ast.ClassDef) and x.name=='Controller')
for name in ('_validate_plan','status','_native_result'):
    a=next(x for x in before.body if isinstance(x,ast.FunctionDef) and x.name==name);b=next(x for x in after.body if isinstance(x,ast.FunctionDef) and x.name==name)
    check('UNCHANGED_CONTROLLER_METHOD_'+name,ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False))
old_flow=ast.parse((OLD/'fake_flow.py').read_bytes());flow=ast.parse((S/'fake_flow.py').read_bytes())
a=next(x for x in old_flow.body if isinstance(x,ast.FunctionDef) and x.name=='deny_effect');b=next(x for x in flow.body if isinstance(x,ast.FunctionDef) and x.name=='deny_effect')
check('DENY_AUDIT_AST_LITERAL',ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False))
check('PERMANENT_AUDIT_INSTALLED',b'sys.addaudithook(deny_effect)' in (S/'fake_flow.py').read_bytes())
author=json.loads((S/'source02-fake-attempt2.stdout').read_bytes());prior=json.loads((OLD/'fake-flow-attempt3.stdout').read_bytes());static=json.loads((S/'source02-static-attempt2.stdout').read_bytes())
check('AUTHOR_CURRENT74',author['passed']==74 and author['failed']==0 and author['source02Cases']==24)
check('RETAINED43_IDS',[x['id'] for x in author['checks'][:43]]==[x['id'] for x in prior['checks']])
check('AUTHOR_STATIC20',static['passed']==20 and static['original15IdsCurrentVerified']==15)
check('TWO_CANDIDATES147_NOT_UNIQUE147',current['allSource02ExecutedAssertionsAcrossBothCandidates']==147 and current['priorPassedCandidateChecksHistoricalOnly']==73 and current['finalExactFakeChecks']==74)
for name in ('source02-fake-attempt1.stderr','source02-fake-attempt2.stderr','source02-static-attempt1.stderr','source02-static-attempt2.stderr'):
    check('AUTHOR_FINAL_STDERR_'+name,(S/name).read_bytes()==b'')
check('ATTEMPT2_INNER_CAUSE_UNKNOWN',b'firstInnerCauseAttempt2' in (S/'execution-record.json').read_bytes() and b'UNKNOWN' in (S/'execution-record.json').read_bytes())
contract=json.loads((S/'port-contract.json').read_bytes())
check('ORDINARY_PORT_HONESTLY_OWED',contract['actualOrdinaryAdapterStatus']=='OWED' and contract['runtimeEntryPointPresent'] is False)
check('OWNED_FINAL_OBSERVER_CONTRACT','BEFORE return' in contract['methods']['final_source_observation'])
check('PUBLICATION_BOUNDARY_CONTRACT','No later fallible cleanup' in contract['methods']['publish_receipt'])
check('CLOCK_CONTRACT_ALL_ACTIVE_FACTS','Every admitted clock fact' in contract['methods']['monotonic_lease_time'])
check('STAGED_ADOPTION_CONTRACT','acceptedprojectandpendingreview' in (S/'controls.json').read_text())
proof=json.loads((HERE/'critical.stdout').read_bytes())
check('BOUNDED_CURRENT_BATCH25_12',proof['passed']==25 and proof['failed']==0 and len(proof['cases'])==12)
check('CURRENT_BATCH_NO_SAFETY_EDITS',proof['subjectSafetyAstEdited'] is False and proof['persistentAuditUnchanged'] is True)
check('CURRENT_BATCH_NO_OLD_SUITE_REPLAY',proof['old43Or74SuitesReplayed'] is False)
check('CRITICAL_STDERR_EMPTY',(HERE/'critical.stderr').read_bytes()==b'')
(HERE/'checks.json').write_text(json.dumps(dict(kind='ARIA_SOURCE02_FINITE_SOURCE_PIN_AST_REUSE_CHECKS',passed=len(CHECKS),failed=0,checks=CHECKS,subjectFunctionsExecuted=0),indent=2)+'\n')
(HERE/'pins.json').write_text(json.dumps(PINS,indent=2)+'\n')
print(json.dumps(dict(passed=len(CHECKS),pinRecords=len(PINS),subjectFunctionsExecuted=0,actualActions=0)))

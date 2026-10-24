"""Finite exact SOURCE03 pin/AST/history checks. No subject function executes."""
from pathlib import Path
import ast,hashlib,json,stat,re
HERE=Path(__file__).absolute().parent;T0=HERE.parents[2]
S=T0/'early/gst-style-isolated-validation-prep/resume3';OLD=S.parent/'resume2'
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
current=packet(S,'35c8502962094fcf16150328e6f4f533f597bbe4674b17d9dd87acd6ce562ec9')
packet(OLD,'0bac75fdd932a1858aef8dfb9e67d1769025966c707bfe9dd28122545b2534b2')
packet(T0/'resume-architecture/resume2/gst-style-isolated-validation-source02-exact-review','3a46ad305b98b86308ebb3f7384fc6fb6d6ad1c5dfb596fd9af8ca27f0fa2ae1')
packet(T0/'qa/gst-style-isolated-validation-source02-exact-review','ba6d60fcbaf84bc441cfb95508ec09a8fbd11c843fb92efd3a07ebebb88665ec')
read(T0/'resume2-gst-isolated-source02-all-findings-root-adoption.json','57aec72215a3f9b86b34174d5f6684eef1494cbdb77985e3f8d32f6f3801b5fb')
read(T0/'resume2-gst-isolated-source01-all-findings-root-adoption.json','02177a09d8684fb7c5a7c2fd3a22e480620989383d7bd894ef72e35c9e59ed49')
read(T0/'resume2-gst-style-isolated-design-qa-root-adoption.json','9b45d5d86d2198d2d62d3dcd0133a2ad9e50c0a4aa552613c2883540e42a25f3')
for name in ('selected_adapter.py','selected-definitions.json','selected-buffer-0.py.txt','selected-buffer-1.py.txt','unit-plan.json','style-format-reports.init.gradle','peer-filter.init.gradle','hooks.diff','owned-gradle.properties','external-pins.json','virtual-composition.json','retained-source-location-map.json'):
    check('LITERAL_REUSE_'+name,(S/name).read_bytes()==(OLD/name).read_bytes())
history=json.loads((S/'source02-history-index.json').read_bytes());check('HISTORY65',len(history['rows'])==65)
for row in history['rows']:
    raw=(S/row['retainedPath']).read_bytes();check('EXACT_HISTORY_'+row['source02Path'],hashlib.sha256(raw).hexdigest()==row['sha256'] and len(raw)==row['bytes'])
for row in json.loads((S/'current-buffer-pins.json').read_bytes())['rows']:
    raw=(S/row['path']).read_bytes();check('CURRENT_CALLER_PIN_'+row['path'],hashlib.sha256(raw).hexdigest()==row['sha256'] and len(raw)==row['bytes'])
old_tree=ast.parse((OLD/'pure_controller.py').read_bytes());raw=(S/'pure_controller.py').read_bytes();tree=ast.parse(raw)
before=next(n for n in old_tree.body if isinstance(n,ast.ClassDef) and n.name=='Controller');after=next(n for n in tree.body if isinstance(n,ast.ClassDef) and n.name=='Controller')
changed={'__init__','_gates','_permit_tick','_gate_inner'}
for node in before.body:
    if isinstance(node,ast.FunctionDef) and node.name not in changed:
        other=next(n for n in after.body if isinstance(n,ast.FunctionDef) and n.name==node.name)
        check('LITERAL_INHERITED_METHOD_'+node.name,ast.dump(node,include_attributes=False)==ast.dump(other,include_attributes=False))
for node in old_tree.body:
    if isinstance(node,(ast.ClassDef,ast.FunctionDef)) and node.name!='Controller':
        other=next(n for n in tree.body if isinstance(n,type(node)) and n.name==node.name)
        check('LITERAL_TOP_DEFINITION_'+node.name,ast.dump(node,include_attributes=False)==ast.dump(other,include_attributes=False))
methods={n.name:n for n in after.body if isinstance(n,ast.FunctionDef)}
clock_calls=[]
for name,node in methods.items():
    for call in ast.walk(node):
        if isinstance(call,ast.Call) and isinstance(call.func,ast.Attribute) and call.func.attr=='monotonic_lease_time':clock_calls.append((name,call.lineno))
check('ONE_EXISTING_CLOCK_CALLER',len(clock_calls)==1 and clock_calls[0][0]=='_admitted_time')
admitted=methods['_admitted_time'];append=next(n for n in ast.walk(admitted) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='append')
validation=next(n for n in ast.walk(admitted) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='_permit_time')
check('APPEND_FACT_BEFORE_VALIDATION',append.lineno<validation.lineno)
bind=next(n for n in ast.walk(methods['_gate_inner']) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Attribute) and t.attr=='gate_permit' for t in n.targets))
first_gates=next(n for n in ast.walk(methods['_gate_inner']) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='_gates')
check('ORIGINAL_BINDING_BEFORE_FIRST_ADMISSION',bind.lineno<first_gates.lineno)
history_assigns=[n for n in ast.walk(after) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Attribute) and t.attr=='gate_clock_facts' for t in n.targets)]
check('HISTORY_INITIALIZED_ONCE_ONLY',len(history_assigns)==1 and methods['__init__'].lineno<=history_assigns[0].lineno<=methods['__init__'].end_lineno)
check('NO_HISTORY_CLEAR_OR_RESET',not any(isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr in ('clear','pop','remove') and isinstance(n.func.value,ast.Attribute) and n.func.value.attr=='gate_clock_facts' for n in ast.walk(after)))
check('NO_RAW_CLOCK_HISTORY_IN_RECEIPT',not any(isinstance(n,ast.Attribute) and n.attr=='gate_clock_facts' for n in ast.walk(methods['_receipt'])))
spans=json.loads((S/'function-spans.json').read_bytes())
expected={(n.name,type(n).__name__,n.lineno,n.end_lineno) for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.ClassDef))}
actual={(r['name'],r['kind'],r['start'],r['end']) for r in spans['functionsAndClasses']}
check('ALL_FUNCTION_SPANS_EXACT',actual==expected and spans['sourceSha256']==hashlib.sha256(raw).hexdigest())
check('SPAN_CLOCK_LOCATION',spans['onlyDirectAdmittedPortClockCallLines']==[clock_calls[0][1]])
old_flow=ast.parse((OLD/'fake_flow.py').read_bytes());flow=ast.parse((S/'fake_flow.py').read_bytes())
a=next(n for n in old_flow.body if isinstance(n,ast.FunctionDef) and n.name=='deny_effect');b=next(n for n in flow.body if isinstance(n,ast.FunctionDef) and n.name=='deny_effect')
check('PERMANENT_AUDIT_AST_LITERAL',ast.dump(a,include_attributes=False)==ast.dump(b,include_attributes=False))
author=json.loads((S/'source03-fake-attempt1.stdout').read_bytes());prior=json.loads((OLD/'source02-fake-attempt2.stdout').read_bytes());static=json.loads((S/'source03-static-attempt1.stdout').read_bytes());prior_static=json.loads((OLD/'source02-static-attempt2.stdout').read_bytes())
check('EXACT_RETAINED74_IDS',[x['id'] for x in author['checks'][:74]]==[x['id'] for x in prior['checks']])
check('AUTHOR84_10_5',author['passed']==84 and author['source03NewChecks']==10 and author['source03NewCases']==5 and author['failed']==0)
check('STATIC27_INCLUDES20',static['passed']==27 and [x['id'] for x in static['checks'][:20]]==[x['id'] for x in prior_static['checks']])
for name in ('source03-fake-attempt1.stderr','source03-static-attempt1.stderr'):check('AUTHOR_EMPTY_STDERR_'+name,(S/name).read_bytes()==b'')
plan=json.loads((S/'unit-plan.json').read_bytes());check('FINITE2092_NULL284_OVERLAY3',len(plan['finiteCopy']['members'])==2092 and sum(r['mode'] is None for r in plan['finiteCopy']['members'])==284 and len(plan['overlay'])==3)
recipe=(S/'RECIPE.md').read_text();current_names=re.search(r'Read (.*?) completely\.',recipe,re.S).group(1)
members={r['path'] for r in current['files']}
for name in re.findall(r'`([^`]+)`',current_names):check('CURRENT_REQUIRED_FILE_'+name,name in members)
check('CURRENT_DESIGN_RECIPE_NAME','SOURCE03-DESIGN.json' in current_names)
contract=json.loads((S/'port-contract.json').read_bytes());check('ORDINARY_PORT_OWED',contract['actualOrdinaryAdapterStatus']=='OWED' and contract['runtimeEntryPointPresent'] is False)
check('NO_INTERVAL_HISTORY_CLAIM',spans['unobservedIntervalClaim'] is False)
critical=json.loads((HERE/'critical.stdout').read_bytes());check('INDEPENDENT59_12',critical['passed']==59 and critical['failed']==0 and len(critical['cases'])==12)
check('CRITICAL_NO_SAFETY_EDITS',critical['subjectSafetyAstEdited'] is False and critical['persistentAuditUnchanged'] is True)
check('CRITICAL_NO_WHOLE84_REPLAY',critical['old84Or74SuitesReplayed'] is False)
check('CRITICAL_STDERR_EMPTY',(HERE/'critical.stderr').read_bytes()==b'')
(HERE/'checks.json').write_text(json.dumps(dict(kind='ARIA_SOURCE03_FINITE_EXACT_SOURCE_PIN_AST_REUSE_CHECKS',passed=len(CHECKS),failed=0,checks=CHECKS,subjectFunctionsExecuted=0),indent=2)+'\n')
(HERE/'pins.json').write_text(json.dumps(PINS,indent=2)+'\n')
print(json.dumps(dict(passed=len(CHECKS),pinRecords=len(PINS),subjectFunctionsExecuted=0,actualActions=0)))

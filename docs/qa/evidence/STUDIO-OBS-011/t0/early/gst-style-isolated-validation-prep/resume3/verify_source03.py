"""Finite own-packet source/metadata inspection; no target functions or runtime facts."""
from pathlib import Path
import ast
import hashlib
import json
p=Path(__file__).parent
s=p.parent/'resume1'
b=Path('docs/qa/evidence/STUDIO-OBS-011/t0')
d=json.loads((p/'unit-plan.json').read_bytes())
checks=[]
def need(name,value):
    if value is not True:raise RuntimeError(name)
    checks.append({'id':name,'passed':True})
oldroot='/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend'
newroot=d['roots']['projectP']+'/backend'
peer=(b/'early/gs-t-draft/resume5-wording-peer/filtered-output.init.gradle').read_text()
need('PEER-EXACT-ONE-ROOT-DELTA',peer.count(oldroot)==1 and (p/'peer-filter.init.gradle').read_text()==peer.replace(oldroot,newroot))
old=(b/'early/gst-restricted-unit-prep/resume6/gst-three-only.init.gradle').read_text()
anchor='    gradle.taskGraph.whenReady { graph ->'
insert="    // Reporting metadata only: keep full source sets and all Checkstyle rules unchanged.\n    p.tasks.withType(org.gradle.api.plugins.quality.Checkstyle).configureEach { task ->\n        task.reports.xml.required.set(true)\n    }\n"
expected=old.replace(oldroot,newroot).replace("['spotlessJava', 'spotlessJavaApply', 'spotlessInternalRegisterDependencies']","['spotlessJava', 'spotlessJavaApply', 'spotlessJavaCheck', 'spotlessInternalRegisterDependencies']").replace(anchor,insert+anchor)
need('FORMAT-EXACT-THREE-DESIGN-CHANGES',(p/'style-format-reports.init.gradle').read_text()==expected)
need('UNKNOWN284-REMAIN-NULL',sum(x['mode'] is None for x in d['finiteCopy']['members'])==284)
need('SOURCE1808-LITERAL-METADATA',sum(x['origin']=='SOURCE1808' for x in d['finiteCopy']['members'])==1808)
need('FINITE2092-UNIQUE',len(d['finiteCopy']['members'])==len({x['path'] for x in d['finiteCopy']['members']})==2092)
need('CATALOG-99-FIVE-CLASSES',len(d['phases'][3]['caseCatalog'])==99 and len(d['phases'][3]['classCounts'])==5)
for name in ['pure_controller.py','selected_adapter.py','fake_flow.py']:
    tree=ast.parse((p/name).read_bytes());compile(tree,name,'exec')
    need('SYNTAX-'+name,True)
    if name!='fake_flow.py':need('NO-IMPORT-'+name,not any(isinstance(n,(ast.Import,ast.ImportFrom)) for n in ast.walk(tree)))
r=json.loads((p/'source03-fake-attempt1.stdout').read_bytes())
old43=json.loads((s/'fake-flow-attempt3.stdout').read_bytes())['checks']
need('ACTUAL-FAKE43-SUCCESS',r['retainedSource02SemanticIds']==74 and r['checks'][:43]==old43)
need('FINAL-EMPTY-STDERR',(p/'source03-fake-attempt1.stderr').read_bytes()==b'')
need('NO-CURRENT-NATIVE',r['actualNativeInvocations']==r['actualRuntimeBoundaryInvocations']==0 and r['ordinaryAdapterImplemented'] is False)
need('PRESERVE-TWO-PRIOR-FAILURES',all(bool((p/('fake-flow-attempt'+str(i)+'.stderr')).read_bytes()) for i in (1,2)))
prior=json.loads((p/'source01-static-verification.json').read_bytes())
need('SOURCE02-EXACT15-IDS', [x['id'] for x in checks[:15]]==[x['id'] for x in prior['checks']])
need('SOURCE02-74-CHECKS-31NEW-24CASES',r['retainedSource02SemanticIds']==74 and r['checks'][:74]==json.loads((p/'source02-fake-attempt2.stdout').read_bytes())['checks'])
literal=['unit-plan.json','selected_adapter.py','selected-definitions.json','selected-buffer-0.py.txt','selected-buffer-1.py.txt','style-format-reports.init.gradle','peer-filter.init.gradle','hooks.diff','owned-gradle.properties','virtual-composition.json','retained-source-location-map.json','adopted-conditions.json']
need('SOURCE02-LITERAL12-INPUTS',all((p/n).read_bytes()==(s/n).read_bytes() for n in literal))
history=json.loads((p/'source01-history-index.json').read_bytes())['rows']
need('SOURCE02-EXACT35-HISTORY',len(history)==35 and all(hashlib.sha256((p/x['retainedPath']).read_bytes()).hexdigest()==x['sha256'] for x in history))
oldtree=ast.parse((s/'fake_flow.py').read_bytes());newtree=ast.parse((p/'fake_flow.py').read_bytes())
get=lambda t:next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='deny_effect')
need('SOURCE02-PERMANENT-AUDIT-UNCHANGED',ast.dump(get(oldtree))==ast.dump(get(newtree)))

# Retain all20 prior static identities above; new finite filename/clock/history bindings only.
old20=json.loads((p/'source02-static-attempt2.stdout').read_bytes())['checks']
need('SOURCE03-EXACT20-STATIC-IDENTITIES',[x['id'] for x in checks[:20]]==[x['id'] for x in old20])
need('SOURCE03-84-CONTROLS-FIVE-INITIAL-CASES',r['passed']==84 and r['failed']==0 and r['source03NewChecks']==10 and r['source03NewCases']==5 and len(r['checks'])==84)
need('SOURCE03-EXACT65-SOURCE02-HISTORY',all(hashlib.sha256((p/x['retainedPath']).read_bytes()).hexdigest()==x['sha256'] for x in json.loads((p/'source02-history-index.json').read_bytes())['rows']))
req=json.loads((p/'required-current-reads.json').read_bytes())
recipe=(p/'RECIPE.md').read_text()
need('SOURCE03-RECIPE-CURRENT-FILENAMES',all((p/n).is_file() and ('`'+n+'`') in recipe for n in req['current']) and all((p/n).is_file() for n in req['historical']+req['historyMaps']) and 'Read `SOURCE03-DESIGN.json`' in recipe)
code=ast.parse((p/'pure_controller.py').read_bytes())
clock_calls=[n for n in ast.walk(code) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='monotonic_lease_time']
cls=next(n for n in code.body if isinstance(n,ast.ClassDef) and n.name=='Controller')
central=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='_admitted_time')
need('SOURCE03-ONE-EXISTING-CLOCK-CONSUMER',len(clock_calls)==1 and clock_calls[0] in list(ast.walk(central)))
oldcode=ast.parse((p/'source02-pure_controller.py.txt').read_bytes());oldcls=next(n for n in oldcode.body if isinstance(n,ast.ClassDef) and n.name=='Controller')
oldmethods={n.name:n for n in oldcls.body if isinstance(n,ast.FunctionDef)};newmethods={n.name:n for n in cls.body if isinstance(n,ast.FunctionDef)}
changed={'__init__','_gates','_permit_tick','_gate_inner'}
need('SOURCE03-ALL-OTHER-CONTROLLER-METHODS-LITERAL-AST',all(ast.dump(n)==ast.dump(newmethods[name]) for name,n in oldmethods.items() if name not in changed))
spans=json.loads((p/'function-spans.json').read_bytes())
need('SOURCE03-FUNCTION-SPANS-CURRENT-SOURCE',spans['sourceSha256']==hashlib.sha256((p/'pure_controller.py').read_bytes()).hexdigest() and spans['onlyDirectAdmittedPortClockCallLines']==[clock_calls[0].lineno])
print(json.dumps({'kind':'SOURCE03_FINITE_SOURCE_METADATA_AND_RECIPE_BINDING_CHECKS','passed':len(checks),'retained20StaticIdentities':20,'newStaticChecks':len(checks)-20,'checks':checks,'actualTargetFunctionsExecuted':False,'actualRuntimeFacts':0},indent=2))

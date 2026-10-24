"""Finite public-packet metadata/AST verification only. No subject execution."""
import ast
import hashlib
import json
from pathlib import Path
import stat

S = Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gst-style-isolated-validation-prep/resume3')
O = Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/gst-style-isolated-validation-source03-exact-review')
checks = []
def check(name, condition):
    checks.append({'id': name, 'passed': bool(condition)})
    if not condition:
        raise AssertionError(name)
def sha(raw):
    return hashlib.sha256(raw).hexdigest()
def load(path):
    return json.loads(path.read_bytes())
def seal(directory, expected, count, prefix):
    raw = (directory/'manifest.json').read_bytes()
    check(prefix+'-manifest', sha(raw) == expected)
    m = json.loads(raw)
    rows = m['files']
    check(prefix+'-count', len(rows) == count and len({x['path'] for x in rows}) == count)
    for row in rows:
        p = directory/row['path']
        b = p.read_bytes()
        check(prefix+'-payload-'+row['path'], len(b) == row['bytes'] and sha(b) == row['sha256'] and stat.S_IMODE(p.stat().st_mode) == row['mode'])
    check(prefix+'-membership', {str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()} == {x['path'] for x in rows}|{'manifest.json'})
    return m

m = seal(S, '35c8502962094fcf16150328e6f4f533f597bbe4674b17d9dd87acd6ce562ec9', 88, 'SOURCE03')
provenance = load(S/'source03-input-provenance.json')
old = Path(provenance['subject']['path']).parent
oldm = seal(old, provenance['subject']['sha256'], 65, 'SOURCE02')
for i, ref in enumerate(provenance['reviews']):
    prior = seal(Path(ref['path']).parent, ref['sha256'], 13, 'PRIOR-REVIEW-'+str(i))
    check('PRIOR-REVIEW-ROWS-'+str(i), prior['files'] == ref['completeOriginalRows'])
root = provenance['rootAllFindings']
check('ROOT-ALL-FINDINGS', sha(Path(root['path']).read_bytes()) == root['sha256'] == sha((S/'source02-all-findings-root-adoption.json').read_bytes()))
history = load(S/'source02-history-index.json')
oldrows = {r['path']:r for r in oldm['files']}
check('HISTORY-COMPLETE65', len(history['rows']) == 65 and {r['source02Path'] for r in history['rows']} == set(oldrows))
for r in history['rows']:
    raw=(S/r['retainedPath']).read_bytes()
    check('HISTORY-'+r['source02Path'], sha(raw)==r['sha256']==oldrows[r['source02Path']]['sha256'] and len(raw)==r['bytes']==oldrows[r['source02Path']]['bytes'])
for r in load(S/'current-buffer-pins.json')['rows']:
    raw=(S/r['path']).read_bytes()
    check('CURRENT-PIN-'+r['path'], sha(raw)==r['sha256'] and len(raw)==r['bytes'])
for name in ['unit-plan.json','selected_adapter.py','selected-definitions.json','selected-buffer-0.py.txt','selected-buffer-1.py.txt','hooks.diff','style-format-reports.init.gradle','peer-filter.init.gradle','owned-gradle.properties','virtual-composition.json','retained-source-location-map.json','external-pins.json','adopted-conditions.json','source01-all-findings-root-adoption.json']:
    check('UNCHANGED-LITERAL-'+name, (S/name).read_bytes()==(old/name).read_bytes())
tree = ast.parse((S/'pure_controller.py').read_bytes())
prior = ast.parse((S/'source02-pure_controller.py.txt').read_bytes())
def methods(tree):
    return {n.name:n for c in tree.body if isinstance(c,ast.ClassDef) and c.name=='Controller' for n in c.body if isinstance(n,ast.FunctionDef)}
newmethods, oldmethods = methods(tree), methods(prior)
changed={'__init__','_gates','_permit_tick','_gate_inner'}
for name, node in oldmethods.items():
    if name not in changed:
        check('PRESERVED-METHOD-'+name, ast.dump(node,include_attributes=False)==ast.dump(newmethods[name],include_attributes=False))
check('ONLY-NEW-METHOD', set(newmethods)-set(oldmethods)=={'_admitted_time'})
clockcalls=[n.lineno for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='monotonic_lease_time']
check('SOLE-CLOCK',clockcalls==[342])
spans=load(S/'function-spans.json')
check('ALL-FUNCTION-SPANS', spans['functionsAndClasses']==[{'name':n.name,'kind':type(n).__name__,'start':n.lineno,'end':n.end_lineno} for n in ast.walk(tree) if isinstance(n,(ast.FunctionDef,ast.ClassDef))])
check('SPANS-SOURCE-PIN', spans['sourceSha256']==sha((S/'pure_controller.py').read_bytes()))
admit=newmethods['_admitted_time']; lines=(S/'pure_controller.py').read_text().splitlines()
check('RETAIN-BEFORE-VALIDATE', '\n'.join(lines[admit.lineno-1:admit.end_lineno]).index('self.gate_clock_facts.append(now)') < '\n'.join(lines[admit.lineno-1:admit.end_lineno]).index('self._permit_time(now)'))
check('HISTORY-NEVER-RESET', sum('self.gate_clock_facts =' in line for line in lines)==1 and sum('self.gate_clock_facts.append' in line for line in lines)==1)
gate='\n'.join(lines[newmethods['_gate_inner'].lineno-1:newmethods['_gate_inner'].end_lineno])
check('BIND-BEFORE-FIRST-GATE', gate.index('self.gate_permit =')<gate.index('self._gates()'))
plan=load(S/'unit-plan.json'); members=plan['finiteCopy']['members']
check('FINITE-2092-UNIQUE',len(members)==2092 and len({r['path'] for r in members})==2092)
check('MODE284-NULL',sum(r['mode'] is None for r in members)==284)
check('SOURCE1808',sum(r['origin']=='SOURCE1808' for r in members)==1808)
check('OVERLAY3',len(plan['overlay'])==3 and all(r['mode']==420 for r in plan['overlay']))
phases={r['id']:r for r in plan['phases']}
check('ONCE-DEADLINES',all(phases[k]['nativeInvocationsMaximum']==1 and phases[k]['acceptanceDeadlineSeconds']==v for k,v in [('format',900),('verify',3600),('regression',7200)]))
check('CATALOG99-FIVE',len(phases['regression']['caseCatalog'])==99 and len(phases['regression']['classCounts'])==5)
check('PROPERTY4',len((S/'owned-gradle.properties').read_text().strip().splitlines())==4)
required=load(S/'required-current-reads.json')
for group in ['current','historical','historyMaps']:
    for name in required[group]:check('REQUIRED-'+name,name in {r['path'] for r in m['files']})
author=load(S/'source03-fake-attempt1.stdout'); prev=load(S/'source02-fake-attempt2.stdout')
check('REUSE-AUTHOR84',author['passed']==84 and author['failed']==0 and len(author['checks'])==84 and all(r['passed'] and r['targetEffects']=='FAKE' and not r['native'] for r in author['checks']))
check('REUSE-RETAINED74', [r['id'] for r in author['checks'][:74]]==[r['id'] for r in prev['checks']] and len(prev['checks'])==74)
static=load(S/'source03-static-attempt1.stdout'); previous=load(S/'source02-static-attempt2.stdout')
check('REUSE-STATIC27',static['passed']==27 and len(static['checks'])==27 and all(r['passed'] for r in static['checks']))
check('REUSE-STATIC20', [r['id'] for r in static['checks'][:20]]==[r['id'] for r in previous['checks']])
check('AUTHOR-EMPTY-STDERR',all((S/n).read_bytes()==b'' for n in ['source03-fake-attempt1.stderr','source03-static-attempt1.stderr']))
critical=load(O/'critical-attempt01.stdout')
check('INDEPENDENT49',critical['passed']==49 and len(critical['checks'])==49 and all(r['passed'] for r in critical['checks']))
check('INDEPENDENT-EMPTY-STDERR',(O/'critical-attempt01.stderr').read_bytes()==b'')
print(json.dumps({'kind':'GST_SOURCE03_QUINN_FINITE_PUBLIC_METADATA_AST_REUSE_VERIFICATION','passed':len(checks),'failed':0,'checks':checks,'subjectExecuted':False,'underlyingExternal39Reacquired':False,'actualRuntimeActions':0},indent=2))

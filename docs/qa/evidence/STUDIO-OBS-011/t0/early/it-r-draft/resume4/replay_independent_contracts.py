"""Resume4 replay of immutable Quinn100-call selection through actual corrected checker core; never its CLI or live receipts.
The author's Fake fixture *class only* is AST-extracted as an input builder; its witness loop,
assertions/results and output writes are never executed. Independent mutations/expectations
and archived wire-shape checks below supply this review's verdict evidence.
"""
from pathlib import Path
from collections import Counter
from types import SimpleNamespace
import ast,copy,datetime,hashlib,json,xml.etree.ElementTree as ET
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r-draft/resume4';O=D
sha=lambda b:hashlib.sha256(b).hexdigest()
# Actual core source, main guard omitted: no author CLI or actual root receipt is called.
tree=ast.parse((D/'verify_mutation_run.py').read_text());nodes=[n for n in tree.body if not isinstance(n,ast.If)]
ns={'__file__':str(D/'verify_mutation_run.py'),'__name__':'qa_inmemory_core'};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<reviewed-checker-core>','exec'),ns)
checker=SimpleNamespace(**ns)
fixtures=ast.parse((D/'checker_contract_witnesses.py').read_text());fake=next(n for n in fixtures.body if isinstance(n,ast.ClassDef) and n.name=='Fake')
WANTED=json.loads((D/'expected-cases.json').read_text());MUTANTS={r['id']:r for r in json.loads((D/'mutation-plan.json').read_text())['mutants']}
env={'checker':checker,'OUT':D,'Counter':Counter,'copy':copy,'datetime':datetime,'ET':ET,'Path':Path,'json':json,'sha':sha,'WANTED':WANTED,'MUTANTS':MUTANTS};exec(compile(ast.Module(body=[fake],type_ignores=[]),'<input-fixture-builder-class-only>','exec'),env);Fake=env['Fake']
results=[]
def run(name,mutate=None,mutation='M-empty-canaries',expect=True,issue=None):
 f=Fake(mutation)
 if mutate:mutate(f)
 statuses=tuple(f.data[k] for k in ['exit','gradleExit','taskCollectionComplete','validationSucceeded'])
 try:result=f.check();accepted=True;reason='ACCEPTED'
 except Exception as err:
  accepted=False;reason=str(err) if isinstance(err,ValueError) else type(err).__name__
 require=accepted is expect
 assert require,(name,accepted,reason)
 assert statuses==tuple(f.data[k] for k in ['exit','gradleExit','taskCollectionComplete','validationSucceeded'])
 results.append({'name':name,'accepted':accepted,'expectedActual':expect,'reason':reason,'rawStatusUnchanged':True,**({'issue':issue} if issue else {})})
for m in MUTANTS:run('baseline-raw-compatible-'+m,mutation=m)
for task in ['test','guidedIncrementalTest']:
 for flag in checker.UNAFFECTED:
  for kind in ['false','missing']:
   def mutate(f,t=task,k=flag,kind=kind):f.change(t,'cohort.json',lambda x:x.update({k:False}) if kind=='false' else x.pop(k))
   run(task+'-'+flag+'-'+kind,mutate,expect=False)
 for val in [1,False,0.0]:run(task+'-retention-'+repr(val),lambda f,t=task,val=val:f.change(t,'cohort.json',lambda x:x.update(retentionFailures=val)),expect=False)
 for key in ['passed','afterEachComplete']:
  run(task+'-'+key+'-false',lambda f,t=task,k=key:f.change(t,'cohort.json',lambda x:x['invocations'][0].update({k:False})),expect=False)
 for change in ['missing','duplicate','wrongvariant','wrongordinal']:
  def mutate(f,t=task,c=change):
   def edit(x):
    if c=='missing':x['invocations'].pop()
    elif c=='duplicate':x['invocations'].append(copy.deepcopy(x['invocations'][0]))
    elif c=='wrongvariant':x['invocations'][-1].update(variant='UNKNOWN_ENUM')
    else:x['invocations'][-1].update(invocationOrdinal=1)
   f.change(t,'cohort.json',edit)
  run(task+'-cohort-'+change,mutate,expect=False)
 for name in ['cohort.json','privacy-itr-final-fault-OWNED_SINKS.json']:
  run(task+'-missing-'+name,lambda f,t=task,n=name:f.data['guidedCohortFiles'].remove(f.artifact(t,n)),expect=False)
  run(task+'-duplicate-'+name,lambda f,t=task,n=name:f.data['guidedCohortFiles'].append(copy.deepcopy(f.artifact(t,n))),expect=False)
 run(task+'-old-profile-body-predicate',lambda f,t=task:f.change(t,'privacy-itr-final-fault-OWNED_SINKS.json',lambda x:x.update(bodyCorpusChecksBeforeActivation=0 if t=='test' else 1)),expect=False)
 run(task+'-wrong-run',lambda f,t=task:f.change(t,'cohort.json',lambda x:x.update(runId='00000000-0000-4000-8000-999999999999')),expect=False)
 run(task+'-wrong-root',lambda f,t=task:f.artifact(t,'privacy-itr-final-fault-OWNED_SINKS.json').update(path='docs/qa/evidence/STUDIO-OBS-011/execution/wrong-task-outputs/activation.json'),expect=False)
 run(task+'-wrong-task',lambda f,t=task:f.artifact(t,'privacy-itr-final-fault-OWNED_SINKS.json').update(task='guidedIncrementalTest' if t=='test' else 'test'),expect=False)
 for bad in ['unrelated-primary','unrelated-suppressed','unrelated-cause','extra-assertion','missing-second','wrong-frame','wrong-message','wrong-synthetic-name']:
  def mutate(f,t=task,bad=bad):
   def change(x):
    c=x.find("testcase[@name='executionError']");e=c.find('failure')
    if bad=='unrelated-primary':e.set('type','java.lang.IllegalStateException')
    elif bad=='unrelated-suppressed':e.text+='\tSuppressed: java.lang.IllegalStateException: private unrelated\n'
    elif bad=='unrelated-cause':e.text+='Caused by: java.lang.IllegalStateException: private unrelated\n'
    elif bad=='extra-assertion':e.text+='\tSuppressed: java.lang.AssertionError: [the OBS-007 case registered its canaries]\n'
    elif bad=='missing-second':e.text=e.text[:e.text.index('\tSuppressed:')]
    elif bad=='wrong-frame':e.text=e.text.replace('.itrAssertAuditCorpus(','.wrongFunction(')
    elif bad=='wrong-message':e.text=e.text.replace('[the OBS-007 case registered its canaries]','[private wrong description]')
    else:c.set('name','unexpectedExecutionError')
   f.xml_change(t,change)
  run(task+'-'+bad,mutate,expect=False)
for task in ['test','guidedIncrementalTest']:
 for prefix,phase,key,value in [('privacy-',None,'privacyComplete',False),('model-budget-evidence-','final','complete',False),('model-budget-evidence-','after-each','complete',False),('responses-','final','diagnosticFailures',1),('responses-','after-each','diagnosticFailures',1)]:
  def mutate(f,t=task,prefix=prefix,phase=phase,key=key,value=value):
   row=next(r for r in f.data['guidedCohortFiles'] if r['task']==t and Path(r['path']).name.startswith(prefix) and 'itr-final-fault' not in r['path'] and (phase is None or r['path'].endswith('-'+phase+'.json')))
   f.change(t,Path(row['path']).name,lambda x:x.update({key:value}))
  run(task+'-scoped-'+prefix+str(phase)+'-failure',mutate,expect=False)
run('source-hash-mismatch',lambda f:f.before['files'][0].update(sha256='0'*64),expect=False)
run('unreviewed-helper',lambda f:f.data['taskedWrapper'].update(sha256='0'*64),expect=False)
run('negative-status-silently-green',lambda f:f.data.update(exit=0,gradleExit=0,validationSucceeded=True),expect=False)
run('negative-collector-completeness-silently-green',lambda f:f.data.update(taskCollectionComplete=True),expect=False)
run('extra-collection-gap',lambda f:f.data['taskCollectionErrors'].append({'task':'test','reason':'MISSING_FRESH_HTML_INDEX'}),expect=False)
for mutation in ['M-empty-canaries','M-missing-admitted','M-missing-dispatch','M-gate-true-subset']:
 def actual_wire(f):
  for t in f.tasks:
   def edit(x):
    e=x.find("testcase[@name='executionError']/failure");e.set('message',(e.text or '').split('\n\tat ',1)[0])
   f.xml_change(t,edit)
 run('actual-Gradle-type-prefixed-message-'+mutation,actual_wire,mutation=mutation,expect=True,issue='ITR-D5-R3-WIRE-01_CORRECTED_RAW_COMPATIBLE_POSITIVE')
# Resolve the exact archived wire attribute shape privately; export closed facts/hashes only.
baseline=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-results.json').read_text());wire=[]
for row in baseline['xmlFiles']:
 if row['path'].endswith('TEST-'+checker.FQCN+'.xml'):
  raw=(R/row['path']).read_bytes();assert sha(raw)==row['sha256'];tree=ET.fromstring(raw)
  for case in tree.iter('testcase'):
   f=case.find('failure');f=f if f is not None else case.find('error')
   if f is None:continue
   message=f.attrib.get('message','');typ=f.attrib.get('type','')
   wire.append({'task':row['task'],'xmlSha256':row['sha256'],'synthetic':case.attrib.get('name')=='executionError','plainAssertionError':typ=='java.lang.AssertionError','messageStartsExactThrowableType':message.startswith(typ+':'),'messageStartsBracket':message.lstrip().startswith('['),'rawPrivateTextExported':False})
assert any(r['plainAssertionError'] and r['messageStartsExactThrowableType'] and not r['messageStartsBracket'] for r in wire)
out={'scope':'ACTUAL_CHECKER_CORE_WITH_IN_MEMORY_FIXTURES_ONLY','inputFixtureReuse':'AST-extracted author Fake class only; author witness loop/results never executed; independent mutations/expectations + actual archived wire inspection','checkerSha256':sha((D/'verify_mutation_run.py').read_bytes()),'results':results,'checks':len(results),'accepted':sum(r['accepted'] for r in results),'rejected':sum(not r['accepted'] for r in results),'archivedWireClosedFacts':wire,'actualNativeRuntimeCalled':False,'rawFailureTextExported':False}
(O/'wire-independent-contracts.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:out[k] for k in ['checks','accepted','rejected','actualNativeRuntimeCalled','rawFailureTextExported']}))

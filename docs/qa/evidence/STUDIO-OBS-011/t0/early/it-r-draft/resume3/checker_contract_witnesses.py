"""Isolated light-Python actual-checker contracts. In-memory fake collector bytes only.
No Java/compiler/probe, native process, actual collector invocation, or execution output write.
"""
from pathlib import Path
from collections import Counter
import importlib.util,json,hashlib,copy,datetime,xml.etree.ElementTree as ET
OUT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('itr_resume3_actual_checker',OUT/'verify_mutation_run.py')
checker=importlib.util.module_from_spec(spec);spec.loader.exec_module(checker)
sha=lambda b:hashlib.sha256(b).hexdigest()
WANTED=json.loads((OUT/'expected-cases.json').read_text())
MUTANTS={r['id']:r for r in json.loads((OUT/'mutation-plan.json').read_text())['mutants']}
class Fake:
 def __init__(self,mutation):
  self.mutation=mutation;self.rows={};self.documents={};subset=mutation=='M-gate-true-subset';fault=mutation not in checker.CONTROLS
  self.tasks=['test'] if subset else ['test','guidedIncrementalTest'];self.profiles=checker.profile_contract(WANTED,subset)
  self.label='obs011-itr-r3-contract-fake';self.path=checker.EXEC/(self.label+'-results.json');self.archive=checker.EXEC/(self.label+'-task-outputs')
  self.data={'explicitTestTasks':self.tasks,'requiredFreshExecTasks':sorted(self.tasks),'sourceStable':True,'distStable':True,'testInputStable':True,
   'expectedHistoricalSkips':[],'historicalSkipSource':None,'cwd':'backend','started':'2026-10-19T00:00:00+00:00','taskResults':{},'testcases':[],
   'xmlFiles':[],'guidedCohortFiles':[],'taskCollectionComplete':not fault,'taskCollectionErrors':[],
   'exit':1 if fault else 0,'gradleExit':1 if fault else 0,'validationSucceeded':not fault}
  select=checker.FQCN+'.'+checker.SUBSET if subset else checker.FQCN
  self.data['command']=['caffeinate','-i','./gradlew']+sum(([t,'--tests',select] for t in self.tasks),[])+['--continue','--rerun-tasks','--no-daemon']
  self.before={'files':[{'path':WANTED['sourcePath'],'sha256':MUTANTS[mutation]['mutantSha256']}],'digest':'fake-source-digest','dist':{'digest':'fake-dist-digest'}}
  self.after=copy.deepcopy(self.before);compact=sha(json.dumps(self.before['files'],separators=(',',':')).encode())
  self.data['testInputDigestBefore']=self.data['testInputDigestAfter']=compact
  source=(OUT/'mutations'/mutation/'repo'/WANTED['sourcePath']).read_text();contract=checker.failure_contract(source,mutation) if fault else None
  total=Counter(total=0,passed=0,failed=0,errors=0,skipped=0)
  for ti,task in enumerate(self.tasks):
   p=self.profiles[task];run=f'00000000-0000-4000-8000-{ti+1:012d}';cohort_id=f'10000000-0000-4000-8000-{ti+1:012d}'
   self.folder=self.archive/task/'cohorts'/run/cohort_id
   invocations=[];suite=ET.Element('testsuite',tests=str(p['caseCount']+int(fault)),failures=str(int(fault)),errors='0',skipped='0')
   for ordinal,r in enumerate(p['selected'],1):
    i={'method':r['method'],'variant':r['variant'],'variantOrdinal':r['variantOrdinal'],'invocationOrdinal':ordinal,'passed':True,'afterEachComplete':True};invocations.append(i)
    self.data['testcases'].append({'task':task,'class':checker.FQCN,'name':r['name'],'status':'PASS'});ET.SubElement(suite,'testcase',classname=checker.FQCN,name=r['name'])
    key=f"{task}-{ordinal}-{r['method']}-{r['variant']}";identity={'lane':task,'class':checker.FQCN,'method':r['method'],'variant':r['variant'],'variantOrdinal':r['variantOrdinal'],'invocationOrdinal':ordinal}
    self.add(task,'privacy-'+key+'.json',dict(identity,privacyComplete=True,auditComplete=not fault,producersDrained=True))
    for phase in ['final','after-each']:
     self.add(task,'model-budget-evidence-'+key+'-'+phase+'.json',dict(invocationOrdinal=ordinal,variantOrdinal=r['variantOrdinal'],declaredFixtureCeiling=4000 if task=='test' else 2048,transportOutputCeiling=4000,complete=True))
     self.add(task,'responses-'+key+'-'+phase+'.json',dict(identity,phase=phase,diagnosticFailures=0))
   cohort=dict(lane=task,profile=p['profile'],declaredOutputCeiling=4000 if task=='test' else 2048,runId=run,cohortId=cohort_id,invocations=invocations,auditComplete=not fault,retentionFailures=0)
   cohort.update({key:True for key in checker.UNAFFECTED});self.add(task,'cohort.json',cohort);self.add(task,'guard-tally.json',{'fakeOnly':True})
   if fault:
    for n,boundary in enumerate(['OWNED_SINKS','CONTEXT_CLOSED']):
     activation=dict(schemaVersion=1,fault=mutation,boundary=boundary,lane=task,producersDrained=True,contextClosed=bool(n),actualMultiplicityComplete=not subset,
      observedInvocations=p['caseCount'],expectedInvocations=WANTED['counts'][task],bodyCorpusChecksBeforeActivation=p['bodyChecks'],finalCorpusChecksBeforeActivation=0,contentScansBeforeActivation=10+n,
      realCanaryCount=0 if subset else 2,realAdmittedCount=0 if subset else 2,realDispatchedCount=0 if subset else 2)
     self.add(task,'privacy-itr-final-fault-'+boundary+'.json',activation)
    c=ET.SubElement(suite,'testcase',classname=checker.FQCN,name='executionError');desc='['+contract['description']+']'
    e=ET.SubElement(c,'failure',type='java.lang.AssertionError',message=desc+' fake controlled assertion')
    e.text=(f'java.lang.AssertionError: {desc}\nfake controlled assertion\n'
      f'\tat {checker.FQCN}.itrAssertAuditCorpus(GuidedPublicationReplayIT.java:{contract["assertionLine"]})\n'
      f'\tat {checker.FQCN}.scanCompleteAuditStream(GuidedPublicationReplayIT.java:{contract["scanLine"]})\n'
      f'\tat {checker.FQCN}.lambda$scanFinalOwnedSinks$7(GuidedPublicationReplayIT.java:{contract["ownedLine"]})\n'
      f'\tSuppressed: java.lang.AssertionError: {desc}\nfake controlled assertion\n'
      f'\t\tat {checker.FQCN}.itrAssertAuditCorpus(GuidedPublicationReplayIT.java:{contract["assertionLine"]})\n'
      f'\t\tat {checker.FQCN}.scanCompleteAuditStream(GuidedPublicationReplayIT.java:{contract["scanLine"]})\n'
      f'\t\tat {checker.FQCN}.scanFinalAuditBoundary(GuidedPublicationReplayIT.java:{contract["closedLine"]})\n')
    self.data['testcases'].append({'task':task,'class':checker.FQCN,'name':'executionError','status':'FAIL'})
    self.data['taskCollectionErrors'].append({'task':task,'reason':'MISSING_FRESH_COHORT_FILE','file':'audit-final.json'})
   else:
    gate=not (mutation=='M-gate-false' or task=='guidedIncrementalTest');final=2 if gate else 0
    self.add(task,'audit-final.json',dict(lane=task,runId=run,cohortId=cohort_id,auditComplete=True,producersDrained=True,contextClosed=True,exactLaneObserved=gate,
     finalCorpusControlChecks=final,corpusControlChecks=p['bodyChecks']+final,observedInvocations=p['caseCount'],expectedInvocations=p['caseCount']-(mutation=='M-omit-variant' and task=='guidedIncrementalTest'),contentScans=12))
   self.add_xml(task,suite)
   counts=dict(total=p['caseCount']+int(fault),passed=p['caseCount'],failed=int(fault),errors=0,skipped=0);total.update(counts)
   self.data['taskResults'][task]=dict(counts=counts,freshExec=True,execRequired=True,freshHtmlIndex=True,joinCasesPresent=True,freshJoinCohorts=1,freshXmlFiles=1)
  self.data['counts']=dict(total)
  self.data['jacocoExecFiles']=[]
  for task in self.tasks:
   path=str(self.archive/task/'jacoco'/(task+'.exec'));raw=b'FAKE_EXEC_BYTES_NOT_NATIVE';self.rows[path]=raw
   self.data['jacocoExecFiles'].append(dict(task=task,path=path,sha256=sha(raw),bytes=len(raw),mtimeNs=1792368001000000000,nonempty=True))
  provenance=json.loads((OUT/'checker-input-provenance.json').read_text())
  for field,suffix in [('legacyWrapper','run-backend.py'),('taskedWrapper','run-backend-tasked.py')]:
   path=next(k for k in provenance['helpers'] if k.endswith('/'+suffix));raw=(checker.ROOT/path).read_bytes();self.rows[path]=raw
   self.data[field]=dict(path=path,sha256=sha(raw),bytes=len(raw),mtimeNs=1)
  base={k:self.data[k] for k in ['command','cwd','started','sourceStable','distStable','testInputStable','testInputDigestBefore','testInputDigestAfter']};base['exit']=self.data['gradleExit']
  raw=json.dumps(base,separators=(',',':')).encode();path=str(checker.EXEC/(self.label+'-default-task-base-results.json'));self.rows[path]=raw
  self.data['defaultTaskBaseReceipt']=dict(path=path,sha256=sha(raw),bytes=len(raw),mtimeNs=1792368001000000000)
 def add(self,task,name,obj):
  path=str(self.folder/name);raw=json.dumps(obj,separators=(',',':')).encode();self.documents[path]=obj;self.rows[path]=raw
  self.data['guidedCohortFiles'].append(dict(task=task,path=path,sha256=sha(raw),bytes=len(raw),mtimeNs=1792368001000000000))
 def add_xml(self,task,suite):
  path=str(self.archive/task/'xml'/('TEST-'+checker.FQCN+'.xml'));raw=ET.tostring(suite);self.rows[path]=raw
  self.data['xmlFiles'].append(dict(task=task,path=path,sha256=sha(raw),bytes=len(raw),mtimeNs=1792368001000000000))
 def artifact(self,task,name):return next(r for r in self.data['guidedCohortFiles'] if r['task']==task and Path(r['path']).name==name)
 def change(self,task,name,fn):
  row=self.artifact(task,name);obj=json.loads(self.rows[row['path']]);fn(obj);raw=json.dumps(obj,separators=(',',':')).encode();self.rows[row['path']]=raw;row.update(sha256=sha(raw),bytes=len(raw))
 def xml_change(self,task,fn):
  row=next(r for r in self.data['xmlFiles'] if r['task']==task);tree=ET.fromstring(self.rows[row['path']]);fn(tree);raw=ET.tostring(tree);self.rows[row['path']]=raw;row.update(sha256=sha(raw),bytes=len(raw))
 def check(self):return checker.reconcile(self.data,self.before,self.after,self.path,self.mutation,lambda r:self.rows[r['path']])

results=[]
def witness(name,change=None,mutation='M-empty-canaries',accept=False):
 f=Fake(mutation)
 if change:change(f)
 raw=(f.data['exit'],f.data['gradleExit'],f.data['taskCollectionComplete'],f.data['validationSucceeded'])
 try:
  outcome=f.check();actual=True;reason='ACCEPTED_EXACT_FAKE_CONTRACT'
 except (ValueError,KeyError,AssertionError,TypeError,IndexError) as error:
  actual=False;reason=str(error.args[0]) if isinstance(error,ValueError) else 'MALFORMED_FAKE_CONTRACT_REJECTED'
 assert actual is accept,(name,actual,reason)
 assert raw==(f.data['exit'],f.data['gradleExit'],f.data['taskCollectionComplete'],f.data['validationSucceeded'])
 results.append(dict(name=name,expected='ACCEPT' if accept else 'REJECT',actual='ACCEPT' if actual else 'REJECT',reason=reason,rawStatusUnchanged=True,fakeOnly=True))
for mutant in MUTANTS:witness('valid-source-bound-'+mutant,mutation=mutant,accept=True)
for task in ['test','guidedIncrementalTest']:
 for key in checker.UNAFFECTED:
  witness(task+'-'+key+'-false',lambda f,t=task,k=key:f.change(t,'cohort.json',lambda o:o.update({k:False})))
  witness(task+'-'+key+'-missing',lambda f,t=task,k=key:f.change(t,'cohort.json',lambda o:o.pop(k)))
 for key in ['retentionFailures']:
  witness(task+'-'+key+'-nonzero',lambda f,t=task:f.change(t,'cohort.json',lambda o:o.update(retentionFailures=1)))
  witness(task+'-'+key+'-missing',lambda f,t=task:f.change(t,'cohort.json',lambda o:o.pop('retentionFailures')))
 witness(task+'-invocation-missing',lambda f,t=task:f.change(t,'cohort.json',lambda o:o['invocations'].pop()))
 witness(task+'-invocation-duplicate',lambda f,t=task:f.change(t,'cohort.json',lambda o:o['invocations'].append(copy.deepcopy(o['invocations'][0]))))
 witness(task+'-invocation-wrong-profile',lambda f,t=task:f.change(t,'cohort.json',lambda o:o['invocations'][0].update(method=checker.ORDER39 if t=='guidedIncrementalTest' else 'wrong-profile')))
 for key in ['passed','afterEachComplete']:
  witness(task+'-'+key+'-false',lambda f,t=task,k=key:f.change(t,'cohort.json',lambda o:o['invocations'][0].update({k:False})))
 witness(task+'-body-counter-wrong-profile',lambda f,t=task:f.change(t,'privacy-itr-final-fault-OWNED_SINKS.json',lambda o:o.update(bodyCorpusChecksBeforeActivation=0 if t=='test' else 1)))
 witness(task+'-final-counter-incremented',lambda f,t=task:f.change(t,'privacy-itr-final-fault-CONTEXT_CLOSED.json',lambda o:o.update(finalCorpusChecksBeforeActivation=1)))
 witness(task+'-cohort-profile-wrong',lambda f,t=task:f.change(t,'cohort.json',lambda o:o.update(profile='incremental2048' if t=='test' else 'original4000')))
 witness(task+'-cohort-run-wrong',lambda f,t=task:f.change(t,'cohort.json',lambda o:o.update(runId='00000000-0000-4000-8000-999999999999')))
 for suffix in ['cohort.json','privacy-itr-final-fault-OWNED_SINKS.json']:
  witness(task+'-'+suffix+'-duplicate-record',lambda f,t=task,n=suffix:f.data['guidedCohortFiles'].append(copy.deepcopy(f.artifact(t,n))))
  witness(task+'-'+suffix+'-missing-record',lambda f,t=task,n=suffix:f.data['guidedCohortFiles'].remove(f.artifact(t,n)))
  witness(task+'-'+suffix+'-wrong-task',lambda f,t=task,n=suffix:f.artifact(t,n).update(task='test' if t!='test' else 'guidedIncrementalTest'))
 witness(task+'-real-corpus-missing',lambda f,t=task:f.change(t,'privacy-itr-final-fault-OWNED_SINKS.json',lambda o:o.update(realAdmittedCount=0)))
 witness(task+'-unrelated-extra-collection-error',lambda f,t=task:f.data['taskCollectionErrors'].append(dict(task=t,reason='MISSING_FRESH_HTML_INDEX')))
 witness(task+'-wrong-primary-error',lambda f,t=task:f.xml_change(t,lambda tree:tree.find("testcase[@name='executionError']/failure").set('type','java.lang.IllegalStateException')))
 def append_error(f,t=task):
  def change(tree):tree.find("testcase[@name='executionError']/failure").text+='\tSuppressed: java.lang.IllegalStateException: fake unrelated cleanup\n'
  f.xml_change(t,change)
 witness(task+'-unrelated-suppressed-cleanup',append_error)
 def append_same_assertion(f,t=task):
  def change(tree):
   e=tree.find("testcase[@name='executionError']/failure");e.text+='\tSuppressed: java.lang.AssertionError: [the OBS-007 case registered its canaries]\n'
  f.xml_change(t,change)
 witness(task+'-extra-matching-assertion',append_same_assertion)
 witness(task+'-wrong-final-assertion-line',lambda f,t=task:f.xml_change(t,lambda tree:setattr(tree.find("testcase[@name='executionError']/failure"),'text',tree.find("testcase[@name='executionError']/failure").text.replace('itrAssertAuditCorpus(GuidedPublicationReplayIT.java:', 'assertJoinedSinkAbsent(GuidedPublicationReplayIT.java:'))))
 witness(task+'-wrong-final-assertion-message',lambda f,t=task:f.xml_change(t,lambda tree:setattr(tree.find("testcase[@name='executionError']/failure"),'text',tree.find("testcase[@name='executionError']/failure").text.replace('[the OBS-007 case registered its canaries]','[fake unrelated privacy failure]'))))
witness('root-case-extra',lambda f:f.data['testcases'].append(copy.deepcopy(f.data['testcases'][0])))
witness('root-case-missing',lambda f:f.data['testcases'].pop(0))
witness('root-case-skipped',lambda f:f.data['testcases'][0].update(status='SKIP'))
witness('root-case-wrong-task',lambda f:f.data['testcases'][0].update(task='guidedIncrementalTest'))
witness('wrong-mutant-staged-source',lambda f:f.before['files'][0].update(sha256='0'*64))
witness('raw-negative-exit-silently-green',lambda f:f.data.update(exit=0,gradleExit=0,validationSucceeded=True))
witness('raw-incomplete-flag-silently-green',lambda f:f.data.update(taskCollectionComplete=True))
witness('stale-activation',lambda f:f.artifact('test','privacy-itr-final-fault-OWNED_SINKS.json').update(mtimeNs=1))
witness('wrong-collector-archive',lambda f:f.artifact('test','privacy-itr-final-fault-OWNED_SINKS.json').update(path='docs/qa/evidence/STUDIO-OBS-011/execution/wrong-task-outputs/test/cohorts/fake/fake/privacy-itr-final-fault-OWNED_SINKS.json'))
# Each final/after-each semantic artifact remains enforced, not just cohort flags.
for family,field,value in [('privacy-','privacyComplete',False),('model-budget-evidence-','complete',False),('responses-','diagnosticFailures',1)]:
 def change(f,prefix=family,key=field,val=value):
  row=next(r for r in f.data['guidedCohortFiles'] if r['task']=='test' and Path(r['path']).name.startswith(prefix) and 'itr-final-fault' not in r['path'])
  f.change('test',Path(row['path']).name,lambda o:o.update({key:val}))
 witness('unaffected-scoped-'+family+'-failure',change)
for task in ['test','guidedIncrementalTest']:
 for key in ['passed','afterEachComplete']:
  witness(task+'-'+key+'-missing',lambda f,t=task,k=key:f.change(t,'cohort.json',lambda o:o['invocations'][0].pop(k)))
 def cause(f,t=task):
  def change(tree):tree.find("testcase[@name='executionError']/failure").text+='Caused by: java.lang.IllegalStateException: fake unrelated retention\n'
  f.xml_change(t,change)
 witness(task+'-unrelated-caused-by-retention',cause)
 witness(task+'-missing-fresh-exec-record',lambda f,t=task:f.data['jacocoExecFiles'].remove(next(r for r in f.data['jacocoExecFiles'] if r['task']==t)))
 witness(task+'-nonempty-exec-fact-false',lambda f,t=task:next(r for r in f.data['jacocoExecFiles'] if r['task']==t).update(nonempty=False))
witness('default-Order39-explicitly-omitted',lambda f:f.change('test','cohort.json',lambda o:o.update(invocations=[i for i in o['invocations'] if i['method']!=checker.ORDER39])))
witness('default-Order39-explicitly-duplicated',lambda f:f.change('test','cohort.json',lambda o:o['invocations'].append(copy.deepcopy(next(i for i in o['invocations'] if i['method']==checker.ORDER39)))))
witness('unreviewed-tasked-wrapper-hash',lambda f:f.data['taskedWrapper'].update(sha256='0'*64))
witness('wrong-root-default-base-archive',lambda f:f.data['defaultTaskBaseReceipt'].update(path='docs/qa/evidence/STUDIO-OBS-011/execution/wrong-default-task-base-results.json'))
witness('extra-native-command-flag',lambda f:f.data['command'].append('--fail-fast'))
report={'scope':'ACTUAL_CORRECTED_CHECKER_CORE_WITH_ISOLATED_IN_MEMORY_PYTHON_FAKES_ONLY',
 'checkerSha256':sha((OUT/'verify_mutation_run.py').read_bytes()),'validDefaultBodyChecks':1,'validIncrementalBodyChecks':0,
 'sourceBoundProfiles':checker.profile_contract(WANTED),'results':results,'accepted':sum(r['actual']=='ACCEPT' for r in results),
 'rejected':sum(r['actual']=='REJECT' for r in results),'nativeCompilerProbeExecution':'NOT_RUN','notQaVerdict':True}
(OUT/'checker-contract-witnesses.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['scope','checkerSha256','accepted','rejected','nativeCompilerProbeExecution']}))

"""Focused actual-core Python fake controls + private historical B1 wire facts.
No CLI/native/compiler/probe. No raw private Throwable text or actual IDs are exported.
"""
from pathlib import Path
from collections import Counter
from types import SimpleNamespace
import ast,copy,datetime,hashlib,json,re,zipfile,xml.etree.ElementTree as ET
OUT=Path(__file__).resolve().parent;ROOT=next(p for p in OUT.parents if (p/'AGENTS.md').is_file())
sha=lambda b:hashlib.sha256(b).hexdigest()
module=ast.parse((OUT/'verify_mutation_run.py').read_text());nodes=[n for n in module.body if not isinstance(n,ast.If)]
ns={'__file__':str(OUT/'verify_mutation_run.py'),'__name__':'wire_actual_core'};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<actual-checker-core-only>','exec'),ns);checker=SimpleNamespace(**ns)
fixture_tree=ast.parse((OUT/'checker_contract_witnesses.py').read_text());fake=next(n for n in fixture_tree.body if isinstance(n,ast.ClassDef) and n.name=='Fake')
WANTED=json.loads((OUT/'expected-cases.json').read_text());MUTANTS={r['id']:r for r in json.loads((OUT/'mutation-plan.json').read_text())['mutants']}
env=dict(checker=checker,OUT=OUT,Counter=Counter,copy=copy,datetime=datetime,ET=ET,Path=Path,json=json,sha=sha,WANTED=WANTED,MUTANTS=MUTANTS)
exec(compile(ast.Module(body=[fake],type_ignores=[]),'<fixture-class-only>','exec'),env);Fake=env['Fake'];results=[]
def run(name,mutation,task=None,edit=None,accept=False):
 f=Fake(mutation)
 if edit:f.xml_change(task,lambda tree:edit(tree.find("testcase[@name='executionError']/failure")))
 statuses=tuple(f.data[k] for k in ['exit','gradleExit','taskCollectionComplete','validationSucceeded'])
 try:f.check();accepted=True;reason='ACCEPTED_EXACT_RAW_COMPATIBLE_FAKE'
 except Exception as error:accepted=False;reason=str(error) if isinstance(error,ValueError) else 'MALFORMED_FAKE_REJECTED'
 assert accepted is accept,(name,accepted,reason)
 assert statuses==tuple(f.data[k] for k in ['exit','gradleExit','taskCollectionComplete','validationSucceeded'])
 results.append(dict(name=name,mutation=mutation,task=task,accepted=accepted,expected=accept,reason=reason,rawStatusUnchanged=True,fakeOnly=True))
def payload(e):return checker.normalize_gradle_throwable_message(e.attrib['message'],e.attrib['type'])
def synchronize(e):e.set('message',(e.text or '').split('\n\tat ',1)[0])
def prefixed_body(e,new_payload):
 old_prefix=checker.ALLOWED_FAILURE_TYPE+': ';old_header=e.text.split('\n\tat ',1)[0]
 e.text=old_prefix+new_payload+e.text[len(old_header):];synchronize(e)
for mutation in ['M-empty-canaries','M-missing-admitted','M-missing-dispatch','M-gate-true-subset']:
 run('raw-compatible-controlled-positive',mutation,accept=True)
 for task in (['test'] if mutation=='M-gate-true-subset' else ['test','guidedIncrementalTest']):
  cases={
   'wrong-prefix-type':lambda e:e.set('message','java.lang.IllegalStateException: '+payload(e)),
   'missing-type-prefix':lambda e:e.set('message',payload(e)),
   'legacy-artificial-bare-message':lambda e:e.set('message',payload(e).replace('\n',' ',1)),
   'duplicated-type-prefix':lambda e:e.set('message',e.attrib['type']+': '+e.attrib['message']),
   'missing-colon-space':lambda e:e.set('message',e.attrib['type']+':'+payload(e)),
   'extra-before-prefix':lambda e:e.set('message','unrelated preamble '+e.attrib['message']),
   'wrong-xml-type':lambda e:e.set('type','java.lang.IllegalStateException'),
   'wrong-xml-assertion-subtype':lambda e:e.set('type','org.opentest4j.AssertionFailedError'),
   'attribute-body-disagreement':lambda e:e.set('message',e.attrib['message']+' unrelated attribute tail'),
   'stack-body-disagreement':lambda e:setattr(e,'text',e.text.replace('fake controlled assertion','fake changed body',1)),
   'synchronized-extra-primary-preamble':lambda e:prefixed_body(e,'unrelated preamble\n'+payload(e)),
   'synchronized-duplicate-type-prefix':lambda e:prefixed_body(e,e.attrib['type']+': '+payload(e)),
   'synchronized-wrong-description':lambda e:prefixed_body(e,payload(e).replace(payload(e).split('\n',1)[0],'[wrong original description] ',1)),
   'synchronized-missing-description-format-space':lambda e:prefixed_body(e,payload(e).replace('] \n',']\n',1)),
   'synchronized-leading-description-space':lambda e:prefixed_body(e,' '+payload(e)),
   'unrelated-cause':lambda e:setattr(e,'text',e.text+'Caused by: java.lang.IllegalStateException: fake unrelated\n'),
   'extra-unrelated-suppressed':lambda e:setattr(e,'text',e.text+'\tSuppressed: java.lang.IllegalStateException: fake unrelated\n'),
   'extra-matching-assertion':lambda e:setattr(e,'text',e.text+'\tSuppressed: java.lang.AssertionError: '+payload(e)+'\n'),
   'extra-primary':lambda e:setattr(e,'text',e.text+'java.lang.AssertionError: '+payload(e)+'\n'),
   'missing-second-boundary':lambda e:setattr(e,'text',e.text[:e.text.index('\tSuppressed:')]),
   'wrong-source-frame':lambda e:setattr(e,'text',e.text.replace('.itrAssertAuditCorpus(','.unrelatedSourceFunction(')),
  }
  for name,edit in cases.items():run(name,mutation,task,edit)
# Inspect immutable historical B1 privately, against its recorded XML hashes; never call its CLI.
baseline_path=ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-results.json'
baseline=json.loads(baseline_path.read_text());wire=[];transplants=[]
for row in baseline['xmlFiles']:
 if not row['path'].endswith('TEST-'+checker.FQCN+'.xml'):continue
 raw=(ROOT/row['path']).read_bytes();assert sha(raw)==row['sha256']
 for case in ET.fromstring(raw).iter('testcase'):
  old=case.find('failure');old=old if old is not None else case.find('error')
  if old is None:continue
  typ=old.attrib.get('type','');message=old.attrib.get('message','');text=old.text or '';prefix=typ+': '
  first_frame=re.search(r'(?m)^\tat ',text);header=text[:first_frame.start()] if first_frame else ''
  exact_header=header.endswith('\n') and header[:-1]==message
  allowed=typ==checker.ALLOWED_FAILURE_TYPE;recognized=False
  if allowed:
   normalized=checker.normalize_gradle_throwable_message(message,typ);recognized=True
  wire.append(dict(task=row['task'],xmlSha256=row['sha256'],synthetic=case.attrib.get('name')=='executionError',allowedType=allowed,
   messageStartsExactOwnTypeColonSpace=message.startswith(prefix),textStartsExactOwnTypeColonSpace=text.startswith(prefix),
   printHeaderOneTerminatorRemovedEqualsAttribute=exact_header,allowedPrefixPrimitiveRecognized=recognized,rawExported=False))
  if allowed or case.attrib.get('name')=='executionError':
   def edit(e,historical=old):
    e.attrib.clear();e.attrib.update(historical.attrib);e.text=historical.text
   before=len(results);run('historical-B1-failure-not-controlled-mutant','M-empty-canaries','test',edit)
   transplants.append(dict(xmlSha256=row['sha256'],allowedType=allowed,synthetic=case.attrib.get('name')=='executionError',fullCorrectedCoreRejected=not results[-1]['accepted'],rawExported=False))
assert any(r['allowedPrefixPrimitiveRecognized'] for r in wire)
assert all(r['fullCorrectedCoreRejected'] for r in transplants)
# Installed primary formatter evidence; Python ZIP read only, no JVM.
jar=next(r for r in json.loads((OUT/'scratch/classpath-manifest.json').read_text()) if r['coordinate'].startswith('org.assertj:assertj-core:'))
assert sha(Path(jar['path']).read_bytes())==jar['sha256']
with zipfile.ZipFile(jar['path']) as archive:bytecode=archive.read('org/assertj/core/error/DescriptionFormatter.class')
assert b'[%s] ' in bytecode
report=dict(scope='ACTUAL_CORRECTED_CHECKER_CORE_IN_MEMORY_WIRE_CONTRACTS_ONLY',checkerSha256=sha((OUT/'verify_mutation_run.py').read_bytes()),
 results=results,accepted=sum(r['accepted'] for r in results),rejected=sum(not r['accepted'] for r in results),
 historicalReceiptSha256=sha(baseline_path.read_bytes()),historicalWireClosedFacts=wire,historicalFailureTransplants=transplants,
 formatter=dict(jarSha256=jar['sha256'],classSha256=sha(bytecode),exactDescriptionFormatConstant='[%s] ',inspection='Python ZIP/classfile bytes only; no Java',typeExpansionAuthorized=False),
 actualHistoricalB1ValidMutant=False,rawPrivateTextExported=False,nativeCompilerProbeExecution='NOT_RUN',notQaVerdict=True)
(OUT/'wire-contract-witnesses.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['scope','checkerSha256','accepted','rejected','actualHistoricalB1ValidMutant','rawPrivateTextExported','nativeCompilerProbeExecution']}))

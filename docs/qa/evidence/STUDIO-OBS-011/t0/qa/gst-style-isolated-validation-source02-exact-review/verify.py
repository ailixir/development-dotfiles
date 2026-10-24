"""Exact public graph/unchanged evidence binding only; no old suite replay."""
import ast,hashlib,json,stat
from pathlib import Path
B=Path('docs/qa/evidence/STUDIO-OBS-011/t0');S=B/'early/gst-style-isolated-validation-prep/resume2';P=S.parent/'resume1';O=B/'qa/gst-style-isolated-validation-source02-exact-review';A=B/'resume-architecture/resume2/gst-style-isolated-validation-source01-exact-review';Q=B/'qa/gst-style-isolated-validation-source01-exact-review';D=B/'resume-architecture/resume2/gst-style-isolated-validation-design';DQ=B/'qa/gst-style-isolated-validation-design-review'
checks=[];pins={}
def sha(b):return hashlib.sha256(b).hexdigest()
def check(n,v):
 if v is not True:raise AssertionError(n)
 checks.append({'id':n,'passed':True})
def raw(p,digest,size=None,mode=None):
 b=p.read_bytes();s=p.lstat();check('HASH_'+str(p),sha(b)==digest);check('REGULAR_'+str(p),stat.S_ISREG(s.st_mode))
 if size is not None:check('BYTES_'+str(p),len(b)==size)
 if mode is not None:check('MODE_'+str(p),stat.S_IMODE(s.st_mode)==mode)
 pins[str(p)]={'path':str(p),'sha256':sha(b),'bytes':len(b),'mode':stat.S_IMODE(s.st_mode)};return b
def packet(p,digest):
 m=json.loads(raw(p/'manifest.json',digest))
 for r in m['files']:raw(p/r['path'],r['sha256'],r['bytes'],r['mode'])
 return m
m=packet(S,'0bac75fdd932a1858aef8dfb9e67d1769025966c707bfe9dd28122545b2534b2');p=packet(P,'67ae068fc92006900082af0b1aca4cfc46c90737812d550392d9f5575f3aad26');packet(A,'1b9a734119c87c43ec8282fa6146428bf94df0c0d9221b2545a9e3d5aa3a25e5');packet(Q,'bf7a2bb47fdce812231321f2bbff2502567f77d3b50a8c52802e4dec7d7bfe12');packet(D,'1080e08125dc5f137ef7336be2eeb7b7aca42279528f624c8194b288dd0c3f8d');packet(DQ,'9c79d0a5a32d2228ffa2f1235cb087320f91bff2f145d9cb04730239614992c9')
raw(B/'resume2-gst-isolated-source01-all-findings-root-adoption.json','02177a09d8684fb7c5a7c2fd3a22e480620989383d7bd894ef72e35c9e59ed49');raw(B/'resume2-gst-style-isolated-design-qa-root-adoption.json','9b45d5d86d2198d2d62d3dcd0133a2ad9e50c0a4aa552613c2883540e42a25f3')
check('EXACT65_35',m['payloadCount']==65 and p['payloadCount']==35)
unchanged=['unit-plan.json','selected_adapter.py','selected-definitions.json','selected-buffer-0.py.txt','selected-buffer-1.py.txt','style-format-reports.init.gradle','peer-filter.init.gradle','hooks.diff','owned-gradle.properties','virtual-composition.json','retained-source-location-map.json','adopted-conditions.json']
for n in unchanged:check('UNCHANGED_'+n,(S/n).read_bytes()==(P/n).read_bytes())
history=json.loads((S/'source01-history-index.json').read_bytes())['rows'];check('EXACT35_HISTORY',len(history)==35)
for r in history:check('HISTORY_'+r['source01Path'],(S/r['retainedPath']).read_bytes()==(P/r['source01Path']).read_bytes())
cb=json.loads((S/'current-buffer-pins.json').read_bytes())
for r in cb['rows']:check('CALLER_EXPECTATION_'+r['path'],sha((S/r['path']).read_bytes())==r['sha256'] and len((S/r['path']).read_bytes())==r['bytes'])
plan=json.loads((S/'unit-plan.json').read_bytes());rows=plan['finiteCopy']['members'];check('2092_EXACT_METADATA',len(rows)==2092 and rows==json.loads((D/'design.json').read_bytes())['finiteCopy']['members']);check('284_NULL_1808_KNOWN',sum(r['mode'] is None for r in rows)==284 and sum(r['mode'] is not None for r in rows)==1808)
f1=json.loads((S/'source02-fake-attempt1.stdout').read_bytes());f2=json.loads((S/'source02-fake-attempt2.stdout').read_bytes());st=json.loads((S/'source02-static-attempt2.stdout').read_bytes());old43=json.loads((P/'fake-flow-attempt3.stdout').read_bytes())['checks']
check('CURRENT74_43_31_24',f2['passed']==74 and f2['failed']==0 and f2['original43SemanticIds']==43 and f2['source02NewChecks']==31 and f2['source02Cases']==24 and f2['checks'][:43]==old43 and all(r['passed'] for r in f2['checks']))
check('TWO_CANDIDATES_147_NOT_UNIQUE',f1['passed']==73 and m['allSource02ExecutedAssertionsAcrossBothCandidates']==147 and m['finalExactFakeChecks']==74)
check('AUTHOR20_15_IDS',st['passed']==20 and st['original15IdsCurrentVerified']==15 and all(r['passed'] for r in st['checks']))
check('AUTHOR_EMPTY_STDERR',all((S/n).read_bytes()==b'' for n in ['source02-fake-attempt1.stderr','source02-fake-attempt2.stderr','source02-static-attempt1.stderr','source02-static-attempt2.stderr']))
c=json.loads((O/'critical.stdout').read_bytes());check('INDEPENDENT22_11',c['checks']==22 and c['cases']==11 and all(r['passed'] for r in c['results']) and c['actualTargetActions']==0)
check('OWN_EMPTY_STDERR',(O/'critical.stderr').read_bytes()==b'')
oldtree=ast.parse((P/'fake_flow.py').read_bytes());newtree=ast.parse((S/'fake_flow.py').read_bytes());get=lambda t:next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name=='deny_effect');check('DENY_AUDIT_UNCHANGED',ast.dump(get(oldtree))==ast.dump(get(newtree)))
source=(S/'pure_controller.py').read_text();tree=ast.parse(source);fn=lambda n:next(x for x in ast.walk(tree) if isinstance(x,ast.FunctionDef) and x.name==n)
check('NO_TARGET_IMPORT_OR_CLI',not any(isinstance(n,(ast.Import,ast.ImportFrom)) for n in ast.walk(tree)) and 'raise Hold(\'ORDINARY_ADAPTER_OWED\')' in source)
check('INITIAL_GATES_BEFORE_PERMIT_BIND',ast.get_source_segment(source,fn('_gate_inner')).index('self._gates()')<ast.get_source_segment(source,fn('_gate_inner')).index('self.gate_permit ='))
check('CLOCK_VALIDATION_CONDITIONAL_ON_BOUND_PERMIT','if self.gate_in_progress and self.gate_permit is not None:' in source)
check('FINAL_SOURCE_ORDER',ast.get_source_segment(source,fn('_finish_with_final_source')).index('self.port.finish_phase')<ast.get_source_segment(source,fn('_finish_with_final_source')).index('self.port.final_source_observation'))
check('ADOPTION_STAGE_BEFORE_COMMIT','self._gates(staged_project=staged)' in source and source.index("receipt = self._receipt('formatted-source-review'")<source.index('self.project = staged'))
check('PUBLICATION_GUARD_CHECKED','guard_called[0] is True' in source and 'self.port.publish_receipt(receipt, completion_guard=completion_guard)' in source)
check('NO_OPERATIONAL_CLAIM',m['ordinaryRuntimePortImplemented'] is False and m['operationalSourceWindowLeaseApplyClosingCleanupCreditAuthority'] is False)
check('OLD_REVIEW_RESULTS_REUSED_NOT_REPLAYED',json.loads((Q/'checks.json').read_bytes())['checks']==624 and json.loads((A/'checks.json').read_bytes())['passed']==4552)
# A documentation-only observation, established from the closed current manifest.
check('RECIPE_OLD_FILENAME_ABSENT_CURRENT_MANIFEST','IMPLEMENTATION-DESIGN.json' not in {r['path'] for r in m['files']} and 'Read `IMPLEMENTATION-DESIGN.json`' in (S/'RECIPE.md').read_text())
report={'kind':'QUINN_SOURCE02_EXACT_SOURCE_GRAPH_CHECKS','checks':len(checks),'results':checks,'publicPins':len(pins),'subject65':65,'priorSource35':35,'priorReviews32':32,'attributedCurrentAuthor74':74,'attributedCurrentAuthor20':20,'independentCriticalChecks':22,'independentCriticalCases':11,'prior4552And624Replayed':False,'old43ReviewReplayed':False,'actualTargetActions':0,'remainingMandatoryCategories':1}
(O/'checks.json').write_text(json.dumps(report,indent=2)+'\n');(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':'0bac75fdd932a1858aef8dfb9e67d1769025966c707bfe9dd28122545b2534b2','pins':list(pins.values()),'pinCount':len(pins),'exactPublicOnly':True,'underlying39PublicInputsReacquired':False,'original2092BodiesRead':False,'actualRuntimeResourceReads':0},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'pins':len(pins),'independentCriticalChecks':22,'independentCriticalCases':11,'mandatoryCategories':1,'actualTargetActions':0}))

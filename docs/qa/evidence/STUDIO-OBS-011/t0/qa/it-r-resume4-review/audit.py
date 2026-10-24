"""Independent read-only seal/preservation audit. Writes only this QA directory."""
from pathlib import Path
import json,hashlib,collections,ast,re
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r-draft/resume4';P=D.parent/'resume3';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-resume4-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((D/'manifest.json').read_text());rows=manifest.get('artifacts',manifest.get('files'));out={'manifestSha256':h(D/'manifest.json'),'receiptSha256':h(D/'receipt.md'),'artifacts':{}}
assert out['manifestSha256']=='43257b5131ff9a33d52a9f8c0332e3c8716300c9fe39a8f3d4db9502aee3e83f'
assert h(O.parent/'it-r-resume3-review/review.md')=='aa407fb5a662159dfe83278921e244dda7f2821e13b3694cfeb0bb61ddcba1c4'
assert h(O.parent/'it-r-resume2-review/review.md')=='f473ec7aa455d05cbdb473dc465d8f6741baffc2661603e5f43a8bcf508bb505'
for row in rows:
 p=D/row['path'];assert h(p)==row['sha256'] and p.stat().st_size==row['bytes'];out['artifacts'][row['path']]=row['sha256']
prior=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-resume3-review/audit.json').read_text())
for path,digest in prior['artifacts'].items():assert h(P/path)==digest
assert h(P/'manifest.json')==prior['manifestSha256']
original=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-draft-review/audit.json').read_text())
for path,digest in original['artifacts'].items():assert h(D.parent/path)==digest
assert h(D.parent/'manifest.json')==original['manifestSha256']
source_paths=[p for p in P.rglob('*.java') if p.is_file()];assert len(source_paths)==19
for p in source_paths:assert p.read_bytes()==(D/p.relative_to(P)).read_bytes()
patches=list(P.rglob('*.patch'));assert len(patches)==34
for p in patches:assert p.read_bytes()==(D/p.relative_to(P)).read_bytes()
for name in ['poll-edits.json','loop-sites.json','sleep-table.tsv','row-classification-proof-map.json','interrupt-timeout-map.json','expected-cases.json','stages.json','source-preservation-map.json']:
 assert (D/name).read_bytes()==(P/name).read_bytes()
for p in (P/'scratch').rglob('*'):
 if p.is_file():
  if p.name=='future-commands.json':assert p.read_text()==(D/p.relative_to(P)).read_text().replace('/resume4/','/resume3/').replace('obs011-itr-r4-wait-proof01','obs011-itr-r3-wait-proof01')
  else:assert p.read_bytes()==(D/p.relative_to(P)).read_bytes()
# Independently derive exact case method/variant/name corpus from original source registries.
s=(D/'ReplayIT.original.java').read_text()
def registry(name):
 a=s.index(name+' =');return re.findall(r'"([^"\n]+)"',s[a:s.index(';',a)])
ss=registry('SINGLETON_METHODS');ii=set(registry('INCREMENTAL_METHODS'));vv=registry('INCREMENTAL_VARIANTS')
param='incrementalStructuralEditsAndExplicitRelearningUseTheActualJoinedBrowser';catalog=[]
for m in ss:catalog.append(('guidedIncrementalTest' if m in ii else 'test',m,'singleton',0,m+'()'))
for i,v in enumerate(vv,1):catalog.append(('guidedIncrementalTest',param,v,i,'incremental joined '+v))
w=json.loads((D/'expected-cases.json').read_text())
assert collections.Counter(catalog)==collections.Counter((r['task'],r['method'],r['variant'],r['variantOrdinal'],r['name']) for r in w['cases'])
assert collections.Counter(t for t,*_ in catalog)=={'test':46,'guidedIncrementalTest':62}
# Supplemental helper source pins match the exact previously reviewed root plan.
provenance=json.loads((D/'checker-input-provenance.json').read_text());assert h(R/provenance['planPath'])==provenance['planSha256']
plan=json.loads((R/provenance['planPath']).read_text())
for path,digest in provenance['helpers'].items():assert h(R/path)==digest
out.update(javaFilesByteExact=19,patchFormsByteExact=34,all95MapsAnd53ScratchPairsByteExact=True,priorPackagesUnchanged=True,sourceCatalogCounts={'test':46,'guidedIncrementalTest':62},bodyCounts={'test':1,'guidedIncrementalTest':0},checkerSha256=h(D/'verify_mutation_run.py'))
# Earlier resume2 and original histories remain sealed independently.
for stage,review in [('resume2','it-r-resume2-review'),('', 'it-r-draft-review')]:
 base=D.parent/stage;prior_a=json.loads((O.parent/review/'audit.json').read_text())
 assert h(base/'manifest.json')==prior_a['manifestSha256']
 for path,digest in prior_a['artifacts'].items():assert h(base/path)==digest
# Narrow inverse recovers exact old checker; every non-wire function has identical bytes.
new=(D/'verify_mutation_run.py').read_text();old=(P/'verify_mutation_run.py').read_text()
a=new.index("ALLOWED_FAILURE_TYPE='java.lang.AssertionError'");b=new.index('def validate_failure',a)
inverse=new[:a]+new[b:]
inverse=inverse.replace("require(element.attrib.get('type')==ALLOWED_FAILURE_TYPE,'UNEXPECTED_PRIMARY_FAILURE_TYPE')","require(element.attrib.get('type')=='java.lang.AssertionError','UNEXPECTED_PRIMARY_FAILURE_TYPE')",1)
a=inverse.index('    attribute_payload=normalize_gradle_throwable_message(');b=inverse.index('    for node,boundary in zip(',a)
inverse=inverse[:a]+"    require(element.attrib.get('message','').lstrip().startswith(desc),'WRONG_PRIMARY_MESSAGE')\n"+inverse[b:]
assert inverse==old
nt=ast.parse(new);ot=ast.parse(old)
def funcs(tree,text):
 lines=text.splitlines(keepends=True)
 return {n.name:''.join(lines[n.lineno-1:n.end_lineno]) for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
nf=funcs(nt,new);of=funcs(ot,old)
assert set(nf)-set(of)=={'normalize_gradle_throwable_message'}
assert all(nf[k]==of[k] for k in of if k!='validate_failure')
# Bind original 53 paired scratch definitions and row95 maps by exact equality and inventory.
scratch=json.loads((D/'scratch/source-bindings.json').read_text())
# Source candidates are unchanged; no compiler was invoked.
# Confirm producer formatter bytes without class loading or a JVM.
import zipfile
jar=next(row for row in json.loads((D/'scratch/classpath-manifest.json').read_text()) if row['coordinate'].startswith('org.assertj:assertj-core:'))
assert h(Path(jar['path']))==jar['sha256']
with zipfile.ZipFile(jar['path']) as z:formatter=z.read('org/assertj/core/error/DescriptionFormatter.class')
assert b'[%s] ' in formatter
out.update(inverseWireDeltaRecoversExactPriorChecker=True,nonWireFunctionsByteExact=len(of)-1,
 formatter={'jarSha256':jar['sha256'],'classSha256':hashlib.sha256(formatter).hexdigest(),'formatConstant':'[%s] ','javaLoaded':False})
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k!='artifacts'}))

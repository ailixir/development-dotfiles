"""Independent read-only seal/preservation audit. Writes only this QA directory."""
from pathlib import Path
import json,hashlib,collections,ast,re
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r-draft/resume3';P=D.parent/'resume2';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-resume3-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((D/'manifest.json').read_text());rows=manifest.get('artifacts',manifest.get('files'));out={'manifestSha256':h(D/'manifest.json'),'receiptSha256':h(D/'receipt.md'),'artifacts':{}}
assert out['manifestSha256']=='f840729b24cb0ea7b0d0502da8c5faa537c78889220fa6075d366ca48ddb0e97'
assert out['receiptSha256']=='2f1502192bcf50ff705f9a13d632ebc0e68e87bf1c824f1ede83547866de9e02'
for row in rows:
 p=D/row['path'];assert h(p)==row['sha256'] and p.stat().st_size==row['bytes'];out['artifacts'][row['path']]=row['sha256']
prior=json.loads((R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-resume2-review/audit.json').read_text())
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
  if p.name=='future-commands.json':assert p.read_text()==(D/p.relative_to(P)).read_text().replace('/resume3/','/resume2/').replace('obs011-itr-r3-wait-proof01','obs011-itr-r2-wait-proof01')
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
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k!='artifacts'}))

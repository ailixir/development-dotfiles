"""Source-only documentary checks. Never applies patches or executes packet code."""
from pathlib import Path
import json, hashlib, re, difflib
ROOT=Path.cwd()
P=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft-resume20261020'
OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft-resume20261020-qa-review'
def sha(b): return hashlib.sha256(b).hexdigest()
def read(p): return (ROOT/p).read_bytes()
def snapshot(p): return {str(f.relative_to(ROOT)):sha(f.read_bytes()) for f in sorted(p.rglob('*')) if f.is_file()}
before=snapshot(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft')
packet_before=snapshot(P)
m=json.loads((P/'manifest.json').read_text()); t=json.loads((P/'traceability.json').read_text())
r={'scope':'in-memory documentary verification only; no patch application, runtime, network or project tests','errors':[]}
def check(ok, message):
 if not ok:r['errors'].append(message)
check(sha((P/'manifest.json').read_bytes())=='a8c83522c8f22c4e5d5cde27278d0084459d22030075f1270b25bad4f224a3b1','supplied manifest hash')
check(sha((P/'SHA256SUMS').read_bytes())=='9c3f1a6609e1edb6afabe1839352b055258ae73cbfaaedcf831e37ac2b9e4ae3','supplied checksum hash')
checks=[]
for line in (P/'SHA256SUMS').read_text().splitlines():
 h,name=line.split('  ',1); checks.append(name); check((P/name).is_file() and sha((P/name).read_bytes())==h,'checksum '+name)
check(len(checks)==len(set(checks)),'checksum duplicates')
actual={str(f.relative_to(P)) for f in P.rglob('*') if f.is_file()}
check(set(checks)==actual-{'SHA256SUMS'},'checksum exact inventory')
output_paths={x['path'] for x in m['outputs']}
check(output_paths=={str(f.relative_to(ROOT)) for f in P.rglob('*') if f.is_file()}-{str((P/'manifest.json').relative_to(ROOT)),str((P/'SHA256SUMS').relative_to(ROOT))},'manifest exact output inventory')
for kind in ['inputs','outputs']:
 for x in m[kind]:
  b=read(x['path']); check(sha(b)==x['sha256'] and len(b)==x['bytes'],kind+' hash/bytes '+x['path'])
r['inventory']={'checksum_rows':len(checks),'manifest_inputs':len(m['inputs']),'manifest_outputs':len(m['outputs']),'supplied_manifest_sha256':sha((P/'manifest.json').read_bytes()),'supplied_checksum_sha256':sha((P/'SHA256SUMS').read_bytes())}
# Independent exact hunk reconstruction, with original line coordinates and all context checked.
def reconstruct(base,patch):
 lines=patch.decode().splitlines(keepends=True); src=base.decode().splitlines(keepends=True); out=[]; cursor=0; i=2
 while i<len(lines):
  match=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n?',lines[i]); assert match,lines[i]
  start,count,newstart,newcount=map(lambda x:int(x) if x is not None else 1,match.groups()); pos=start-1 if count else start
  assert pos>=cursor;out.extend(src[cursor:pos]);cursor=pos;i+=1;old_n=new_n=0
  while i<len(lines) and not lines[i].startswith('@@ '):
   line=lines[i];i+=1
   assert line[0] in ' +-'
   if line[0] in ' -': assert src[cursor]==line[1:];cursor+=1;old_n+=1
   if line[0] in ' +':out.append(line[1:]);new_n+=1
  assert old_n==count and new_n==newcount
 out.extend(src[cursor:]);return ''.join(out).encode()
r['targets']=[]
for x in m['targets']:
 target=ROOT/x['target']; exists=target.exists();check(exists==x['baseExists'],'base existence '+x['target']); base=target.read_bytes() if exists else b''
 check((sha(base) if exists else None)==x['baseSha256'] and len(base)==x['baseBytes'],'base hash '+x['target'])
 check(x['missingBaseRecorded']==(not exists),'explicit absent base '+x['target'])
 patch=read(x['patch']);preview=read(x['preview']);header=patch.decode().splitlines()[:2]
 check(header==['--- '+x['diffFrom'],'+++ b/'+x['target']],'exact target header '+x['target'])
 check(reconstruct(base,patch)==preview,'independent reconstruction '+x['target'])
 expected=''.join(difflib.unified_diff(base.decode().splitlines(keepends=True),preview.decode().splitlines(keepends=True),fromfile=x['diffFrom'],tofile='b/'+x['target'])).encode()
 check(expected==patch,'deterministic unified diff '+x['target'])
 check(sha(preview)==x['outputSha256'] and len(preview)==x['outputBytes'] and sha(patch)==x['patchSha256'],'target output/patch hash '+x['target'])
 if x['target']=='docs/stories/10.34.story.md':check(preview.startswith(base),'entire 10.34 base prefix');check(preview[len(base):]==b'\n'+(P/'10.34-appendix.md').read_bytes(),'exact appendix-only addition')
 r['targets'].append({'target':x['target'],'baseExists':exists,'baseSha256':x['baseSha256'],'previewReconstructedExactly':reconstruct(base,patch)==preview,'header':header})
check(read(str((P/'patches/all-documentation.patch').relative_to(ROOT)))==b''.join(read(x['patch']) for x in m['targets']),'combined patch exact five-target concatenation')
a=json.loads((P/'architecture-obligations.json').read_text());s=json.loads(read(a['source']));source=[o for o in s['obligations'] if o['story']=='010']
check(len(source)==21 and source==a['obligations'],'all 21 architecture objects verbatim')
check(sha(read(a['source']))==a['sourceSha256'],'architecture source digest')
check([o['id'] for o in t['story010Obligations']]==[o['id'] for o in source],'all 21 exact ordered traceability ids')
for o,z in zip(source,t['story010Obligations']):
 check(all(z[k]==o[k] for k in ['id','classification','owner','missingInput']),'obligation field preservation '+o['id'])
 check(z['originalRemainingWork']==o['remainingWork'] and z['implementingEvidence']==o['evidence'],'obligation exact work/evidence '+o['id'])
 check(z['remainingOwner']==o['owner'] and z['remainingInput']==o['missingInput'],'obligation owner/input '+o['id'])
 for artifact in z['artifacts']:check((P/artifact).is_file(),'mapped artifact '+artifact)
check([x['id'] for x in t['RBR']]==['RBR-%02d'%i for i in range(1,20)],'all 19 ordered RBR ids')
for row in t['RBR']:
 b=read(row['preview']).decode();check('### '+row['id']+' — '+row['section'] in b,'RBR exact section '+row['id'])
 check(bool(row['remainingOwner'] and row['remainingInput'] and row['sourcePaths']),'RBR evidence/owner/input '+row['id'])
 for path in row['sourcePaths']:check((ROOT/path).is_file(),'RBR source '+path)
r['coverage']={'architecture_objects_exact':source==a['obligations'],'architecture_count':len(source),'traceability_obligation_count':len(t['story010Obligations']),'RBR_count':len(t['RBR'])}
# Check all repo paths declared as plain JSON strings; explicit future/owed strings are reported, not read.
path_states={}
def walk(v):
 if isinstance(v,dict):
  for x in v.values():walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
 elif isinstance(v,str) and re.match(r'^(docs/|backend/|frontend/|studio-runner/|helm-chart/|\.aiox/|\.ai/)',v) and '\n' not in v:
  path=re.sub(r':\d+(?:-\d+)?$','',v.split('#')[0]);path_states[v]=(ROOT/path).exists()
for name in ['architecture-obligations.json','traceability.json','release-evidence-map.json','10.34-dispositions.json','pm-ac24-carrier-decision.json']:walk(json.loads((P/name).read_text()))
r['json_path_inventory']=path_states
# Markdown hyperlink paths resolve from eventual target, not off-tree preview prefix.
links=[]
for x in m['targets']:
 text=read(x['preview']).decode()
 # Historical 10.34 is preserved, so only inspect newly proposed appendix.
 if x['target']=='docs/stories/10.34.story.md':text=(P/'10.34-appendix.md').read_text()
 for label,url in re.findall(r'\[([^\]]+)\]\(([^)]+)\)',text):
  if '://' in url or url.startswith('#'):continue
  path=url.split('#')[0];dest=(ROOT/x['target']).parent/path;ok=dest.is_file();links.append({'target':x['target'],'label':label,'url':url,'exists':ok});check(ok,'new markdown link '+url)
r['markdown_links']=links
# Concrete requirements encoded in the documentary packet, without running the product.
runbook=(P/'preview/docs/runbooks/studio-guided-authoring.md').read_text()
pilot=(P/'preview/docs/qa/evidence/studio-observed-authoring/usability-pilot.md').read_text()
ledger=(P/'preview/docs/qa/evidence/studio-observed-authoring/release-readiness.md').read_text()
evidence_map=json.loads((P/'release-evidence-map.json').read_text())
ledger_rows=[line for line in ledger.splitlines() if line.startswith('|')][2:]
ledger_gates=[line.split('|')[1].strip() for line in ledger_rows]
check(len(ledger_gates)==70 and set(ledger_gates)=={x['gate'] for x in evidence_map},'all 70 ledger/evidence-map gates')
check(all(len(line.split('|'))==7 for line in ledger_rows),'fixed five-column release row shape')
source34=read('docs/stories/10.34.story.md').decode()
dispositions=json.loads((P/'10.34-dispositions.json').read_text())
check(len(dispositions['groups'])==14 and len(dispositions['originalACs'])==33,'14 groups / all 33 ACs')
criteria=[]
for ac in dispositions['originalACs']:
 match=re.search(r'\*\*'+ac['id']+r'\*\*.*?\[Gate: ([^\]]+)\]',source34)
 if ac['id']!='AC-24':check(match is not None and match.group(1)==ac['inheritedGate'],'exact original inherited gate '+ac['id'])
 criteria.append({'id':ac['id'],'originalGateExact':match.group(1)==ac['inheritedGate'] if match else None,'state':ac['state']})
r['staging']={'group_count':14,'criteria_count':33,'criteria':criteria,'AC24':'preserved prior bounded PM decision; PO application remains pending; no old checkbox tick'}
source_copy=read('frontend/src/components/studio/guided/guidedNarratives.ts').decode()
copy_keys=['clarificationQuestion','noneOfThese','continue','repeatingPrefix','learningFromStep','saving','needsRelearn','learnAgainFromStep','loginNoLoginSteps','loginStepsFailed']
# Match exact literals irrespective of the implementation's key name for the two progress rows.
expected_copy=["Step {N} says: '{<step text>}'. Which one did you mean?", "None of these — I'll edit step {N}",'Continue','Repeating saved steps 1–{(k-1)}…','Learning from step {k}','Saving what this run learned…','Steps changed — next Run learns from step {k}','Learn again from step {N}','This page asks you to sign in. Add login steps before step {N} using your secrets (`<secret NAME>`), then Run again','Your login steps did not sign you in; check the secret and the steps before step {N}']
for literal in expected_copy:check(literal in pilot and literal in source_copy,'exact shipped copy '+literal)
r['pilot']={'exact_shipped_templates':len(expected_copy),'unassigned_slots':5,'attempt_form_header_only':len((P/'sheets/pilot-attempts.csv').read_text().splitlines())==1,'focus_form_header_only':len((P/'sheets/pilot-focus-targets.csv').read_text().splitlines())==1}
import csv
slots=list(csv.DictReader((P/'sheets/participant-slots.csv').read_text().splitlines()))
check([x['slot_id'] for x in slots]==['P%02d'%i for i in range(1,6)] and all(x['assignment_state']=='UNASSIGNED' and all(not v for k,v in x.items() if k not in ['slot_id','assignment_state']) for x in slots),'five empty unassigned slots')
den=list(csv.DictReader((P/'sheets/pilot-denominators.csv').read_text().splitlines()))
check(all(x['state']=='NOT_RUN' and all(not v for k,v in x.items() if k not in ['measure','state']) for x in den),'undefined unrun denominators, no invented values')
for name in ['attempt_form_header_only','focus_form_header_only']:check(r['pilot'][name],name)
disclosure=re.search(r'> A test.s first learn.*steps at p95\.',runbook).group(0)
check(disclosure in ledger,'same exact e1/RBR19 disclosure')
check(disclosure[2:] in read('docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md').decode(),'story e1 disclosure verbatim')
r['ledger']={'fixed_shape_rows':len(ledger_gates),'evidence_map_rows':len(evidence_map),'T4_disclosure_verbatim_same':True,'p95_blank':True}
r['original_draft_files_before']=len(before);r['original_draft_tree_unchanged_during_review']=before==snapshot(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/obs010-draft');r['reviewed_packet_unchanged_during_review']=packet_before==snapshot(P)
check(r['original_draft_tree_unchanged_during_review'],'original draft tree changed');check(r['reviewed_packet_unchanged_during_review'],'reviewed packet changed')
(OUT/'integrity.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({k:v for k,v in r.items() if k not in ['json_path_inventory','markdown_links','targets']},indent=2));print('Nonexisting JSON path references:',json.dumps({k:v for k,v in path_states.items() if not v},indent=2))

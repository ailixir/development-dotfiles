from pathlib import Path
import json,hashlib
ROOT=Path.cwd();OUT=Path(__file__).parent;EARLY=OUT.parent;PRE=OUT/'virtual-pre-final';FINAL=OUT/'final-candidates'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
start=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json';capture=json.loads(start.read_text());entries={}
for row in capture['files']:
 p=ROOT/row['path'];current=h(p);assert current==row['sha256'],('frozen root drift',row['path'])
 entries[row['path']]={'source':row['path'],'sha256':current,'mode':oct(p.stat().st_mode&0o777),'provenance':'CURRENT_LITERAL_S011_ROOT'}
# Include every prepared incoming Java/source record, even outside final ownership, in the virtual map.
for folder,owner in [('left-main-draft/repo','11-LEFT nondata'),('left-data-draft/resume2/repo','11-LEFT data'),('gsm-b-draft/resume3/repo','11-GS-Mb'),('gs-t2-draft/resume2/candidates','11-GS-T2'),('it-s-draft/resume2/repo','11-IT-S'),('fold-prep-draft/resume2/tree','11-FOLD-prep')]:
 for p in (EARLY/folder).rglob('*'):
  if p.is_file():
   rel=str(p.relative_to(EARLY/folder));entries[rel]={'source':str(p.relative_to(ROOT)),'sha256':h(p),'mode':oct(p.stat().st_mode&0o777),'provenance':owner,'runtimeRelease':'PREPARED_NOT_RUNTIME_RELEASED'}
replay='backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java';p=EARLY/'it-r-draft/resume2/stages/04-b4/repo'/replay;assert h(p)=='98aec4f908d92c89a5d50155e35702eb8b8e3c98270d82655f212b328ca0e42c';entries[replay]={'source':str(p.relative_to(ROOT)),'sha256':h(p),'mode':oct(p.stat().st_mode&0o777),'provenance':'11-IT-R fullB4 prospective only, no carry chosen','runtimeRelease':'PREPARED_NOT_RUNTIME_RELEASED'}
leftdeleted=[]
for manifest in ['left-main-draft/manifest.json','left-data-draft/resume2/manifest.json']:
 for row in json.loads((EARLY/manifest).read_text())['files']:
  if row['operation']=='delete':
   entries.pop(row['path'],None);leftdeleted.append({'path':row['path'],'owner':'11-LEFT','sourceManifest':manifest,'operation':'delete','FOLDOwnership':False,'status':'PREPARED_NOT_RUNTIME_RELEASED'})
# Scoped physical preimage tree and full map must agree wherever a physical record exists.
for p in PRE.rglob('*'):
 if p.is_file():
  rel=str(p.relative_to(PRE));assert rel in entries and entries[rel]['sha256']==h(p),(rel,entries.get(rel))
finalentries=dict(entries)
for p in PRE.rglob('*'):
 if p.is_file() and not (FINAL/p.relative_to(PRE)).exists():finalentries.pop(str(p.relative_to(PRE)),None)
for p in FINAL.rglob('*'):
 if p.is_file():
  rel=str(p.relative_to(FINAL));finalentries[rel]={'source':str(p.relative_to(ROOT)),'sha256':h(p),'mode':oct(p.stat().st_mode&0o777),'provenance':'prospective final candidate or byte-exact forwarded input','runtimeRelease':'UNRELEASED'}
(OUT/'full-virtual-tree-map.json').write_text(json.dumps({'kind':'FULL_SOURCE_HASH_MAP_PLUS_SCOPED_PHYSICAL_INPUT_TREE_NOT_AN_APPLICATION_WORKTREE','S011CaptureSha256':h(start),'literalSourceCount':len(capture['files']),'literalSourceAllHashesVerified':True,'distCaptureIdentity':capture['dist']['digest'],'preparedLEFTDeletionsOutsideFold':leftdeleted,'virtualPreFinal':entries,'virtualFinal':finalentries,'allRuntimeBatonsReleased':False,'RTSource':'RTOwned current literal source retained beforeMERGE; separate approved candidate hashed in grep-and-RT-ownership.json; not owned/copied by FOLD','scope':'Full1808 captured source records with exact prepared incoming overlays/additions/deletions; physical virtual-pre-final contains all atomic inputs and selected forward-only dependencies. All other entries resolve read-only by their bound source path.'},indent=2)+'\n')
print('Verified all1808 literal source hashes; full virtual pre/final maps include every prepared predecessor and LEFT-owned deletion without FOLD ownership')

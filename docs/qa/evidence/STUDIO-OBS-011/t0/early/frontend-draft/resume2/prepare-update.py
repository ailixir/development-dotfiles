"""Create resume2 drafts by reading immutable parent artifacts and original source only."""
from pathlib import Path
import difflib,hashlib,json,shutil,subprocess
root=Path.cwd();base=root/'docs/qa/evidence/STUDIO-OBS-011/t0/early/frontend-draft';out=base/'resume2'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
old=json.loads((base/'copy-back-manifest.json').read_text())
entries=[]
for item in old['entries']:
 for relative in ['repo/'+item['path'],item['patch']]:
  dest=out/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(base/relative,dest)
 entries.append(item)
proofs=['templates-before.json','templates-after.json','copy-table-rows.json','test-drop-addition-map.json','ast-static-evidence.json','required-barrel-companion.patch']
for p in proofs:shutil.copyfile(base/p,out/p)
path='frontend/src/pages/ReportsPage/ReportsPage.tsx'
source=root/path;before=source.read_text();old_line='  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {';new_line='  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {'
assert before.count(old_line)==1
expected='cc4a8e6b084fac0fe09ce69e4167cce2321d37b0ed972ebb5c787f1128184668';assert sha(source)==expected
text=before.replace(old_line,new_line,1)
dest=out/'repo'/path;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(text)
patch=''.join(difflib.unified_diff(before.splitlines(True),text.splitlines(True),fromfile='a/'+path,tofile='b/'+path))
patch_path='patches/'+path+'.patch';dest_patch=out/patch_path;dest_patch.parent.mkdir(parents=True,exist_ok=True);dest_patch.write_text(patch)
entries.append(dict(path=path,scope='11-FE v6 rootUnusedParameterAmendment; event to _event only',operation='edit',sourceSha256=sha(source),draftSha256=sha(dest),patch=patch_path,patchSha256=sha(dest_patch)))
manifest=dict(status='UNAPPLIED_DRAFT_RUNTIME_UNVERIFIED',actualSourceWrites=False,version=2,supersedes=dict(path='docs/qa/evidence/STUDIO-OBS-011/t0/early/frontend-draft/copy-back-manifest.json',sha256=sha(base/'copy-back-manifest.json'),preservedByteExact=True),plan=dict(path='docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v6.json',sha256=sha(root/'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v6.json')),entries=entries,approvedBarrelCompanion=old['approvedBarrelCompanion'],approvedUnusedParameter=dict(path=path,allowed='event to _event only',arity=2,handlerBodyUnchanged=True,actualCopyBack='11-MERGE only'))
(out/'copy-back-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'frontend-draft.patch').write_text(''.join((out/e['patch']).read_text() for e in entries))
checks=[]
for e in entries:
 r=subprocess.run(['patch','--dry-run','-p1','--batch','--forward','-i',str(out/e['patch'])],cwd=root,text=True,capture_output=True);assert r.returncode==0,e['path'];checks.append(dict(path=e['path'],returncode=r.returncode,stdout=r.stdout,stderr=r.stderr))
r=subprocess.run(['patch','--dry-run','-p1','--batch','--forward','-i',str(out/'frontend-draft.patch')],cwd=root,text=True,capture_output=True);assert r.returncode==0
(out/'patch-applicability.json').write_text(json.dumps(dict(status='READ_ONLY_DRY_RUN',individual=checks,combined=dict(returncode=r.returncode,stdout=r.stdout,stderr=r.stderr),actualSourceWrites=False),indent=2)+'\n')
plan=json.loads((base/'validation-plan.json').read_text())
plan['prerequisites'][0]='Root rules B1 cause/coverage obligations and opens the source tree; B1 and B7 already terminal, not permission to apply'
plan['prerequisites'][1]='Use existing B7 receipts:1386 passed; unused-tsc exit2 red preserved until candidate validated'
plan['commands'].append(dict(label='obs011-fe-unused01',argv=['pnpm','exec','tsc','--noEmit','--noUnusedLocals','--noUnusedParameters']))
plan['evidence'].append('B7 baseline has1386 unit cases; unchanged two drops/three additions predicts1387 after this lane alone. The ReportsPage parameter rename adds/drops no test. Strict unused-tsc must pass with both original flags retained; no prior red result is overwritten.')
plan['unresolved']=['Root cause/coverage/tree-open and independent review remain held','No sandbox seeded; no semantic type-check/lint/unused-tsc/Vitest/build/bundle evidence on these candidates','C-OBS008-5 optional authoring refusal remains carried; AE-01/U13 separate','Actual source copy-back only11MERGE; real axe regeneration/final gates remain owed']
(out/'validation-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
# Historical proofs stay unmodified. New parsing utility points only at resume2 outputs.
parser=(base/'parse-drafts.cjs').read_text().replace("'docs/qa/evidence/STUDIO-OBS-011/t0/early/frontend-draft'", "'docs/qa/evidence/STUDIO-OBS-011/t0/early/frontend-draft/resume2'")
(out/'parse-drafts.cjs').write_text(parser)
inputs=['AGENTS.md','docs/qa/evidence/STUDIO-OBS-011/t0/resume2-root-state.json','docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v6.json','docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v6.md','docs/qa/evidence/STUDIO-OBS-011/t0/b7-results.json','docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend-unused01-results.json','docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend-unused01.log','docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend01-results.json','docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-frontend01-vitest.json']
(out/'input-hashes.json').write_text(json.dumps(dict(status='READ_AT_PREPARATION',inputs=[dict(path=p,sha256=sha(root/p)) for p in inputs]),indent=2)+'\n')
print(json.dumps(dict(draftFiles=len(entries),originalElevenCopiedByteExact=all(sha(base/'repo'/e['path'])==sha(out/'repo'/e['path']) for e in old['entries']),combinedPatchSha256=sha(out/'frontend-draft.patch'),manifestSha256=sha(out/'copy-back-manifest.json'),reportsOriginalSha256=expected,reportsDraftSha256=entries[-1]['draftSha256']),indent=2))

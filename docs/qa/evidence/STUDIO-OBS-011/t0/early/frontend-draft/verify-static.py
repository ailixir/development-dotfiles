"""Read source and draft bytes only; never executes product code or a build/test tool."""
import hashlib,json,pathlib,subprocess
root=pathlib.Path.cwd(); out=root/'docs/qa/evidence/STUDIO-OBS-011/t0/early/frontend-draft'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=json.loads((out/'copy-back-manifest.json').read_text())
start=json.loads((root/'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json').read_text())
base={x['path']:x['sha256'] for x in start['files']}
frontend=[{'path':p,'expectedSha256':h,'currentSha256':sha(root/p),'equal':sha(root/p)==h} for p,h in base.items() if p.startswith('frontend/')]
assert all(x['equal'] for x in frontend)
for item in manifest['entries']:
    assert sha(out/'repo'/item['path'])==item['draftSha256']
    assert sha(out/item['patch'])==item['patchSha256']
    if item['sourceSha256']:
        assert base[item['path']]==item['sourceSha256']==sha(root/item['path'])
    else: assert not (root/item['path']).exists()
combined=subprocess.run(['patch','--dry-run','-p1','--batch','--forward','-i',str(out/'frontend-draft.patch')],cwd=root,text=True,capture_output=True)
assert combined.returncode==0
assert (out/'templates-before.json').read_bytes()==(out/'templates-after.json').read_bytes()
actual=json.loads((out/'ast-static-evidence.json').read_text())
assert not actual['syntaxDiagnostics'] and actual['keysExact']
assert all(r['templateExact'] and r['runtimeOnlyTemplate'] and r['metadataExact'] and r['metadataFieldSetExact'] for r in actual['copyRows'])
old=(root/'frontend/src/components/studio/guided/index.ts').read_text()
new=(out/'repo/frontend/src/components/studio/guided/index.ts').read_text()
for name in ['COPY_SOURCE_FILES','CopyBasis','CopySource','CopySourceFile']:old=old.replace('  '+name+',\n','')
assert new==old
# Search direct registry imports in overlay: no production file imports test-only metadata.
registry='guidedCopySources.test-support'
imports=[]
for p in (root/'frontend/src').rglob('*'):
    if not p.is_file() or p.suffix not in ['.ts','.tsx']:continue
    rel=p.relative_to(root); overlay=out/'repo'/rel; text=(overlay if overlay.exists() else p).read_text()
    if registry in text: imports.append(str(rel))
assert imports==['frontend/src/components/studio/guided/guided.test.tsx']
inputs=['docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v4.json','docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v5.json','docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v4.md','docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v5.md','docs/qa/evidence/STUDIO-OBS-011/t0/early/R-CO/cosign.md','docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV/sandbox-frontend-copy-list.txt','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011-cleanup-inventory.md']
result=dict(status='STATIC_ONLY_NOT_QA_OR_EXIT_VERDICT',draftFiles=len(manifest['entries']),existingEdits=sum(e['operation']=='edit' for e in manifest['entries']),newFiles=sum(e['operation']=='add' for e in manifest['entries']),frontendBaselineFileCount=len(frontend),allBaselineFrontendHashesStillS011=True,frontendBaselineHashes=frontend,actualNewRegistryAbsent=True,allDraftAndPatchHashesMatch=True,combinedPatchReadOnlyApplicability=dict(returncode=combined.returncode,stdout=combined.stdout,stderr=combined.stderr),templateDumpSha256=sha(out/'templates-before.json'),templateBytesEqual=True,barrelExactlyFourApprovedLinesRemoved=True,registryImporters=imports,inputs=[dict(path=p,sha256=sha(root/p)) for p in inputs],unverified=['TypeScript semantic type-check','ESLint','targeted and full Vitest','rendered behavior','production build and bundle absence','sandbox and actual merge gates','real axe regeneration','independent QA'])
(out/'final-static-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['frontendBaselineHashes','inputs','combinedPatchReadOnlyApplicability']},indent=2))

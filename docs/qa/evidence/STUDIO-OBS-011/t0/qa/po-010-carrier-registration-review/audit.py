"""Independent in-memory patch/input/composition audit; all writes confined to this QA directory."""
from pathlib import Path
import json,hashlib,re,stat
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/po-010-carrier-registration';P=D.parent/'obs010-draft/resume4';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/po-010-carrier-registration-review'
sha=lambda b:hashlib.sha256(b).hexdigest();h=lambda p:sha(p.read_bytes())
assert h(D/'disposition.md')=='4c038d237961dacfb87527bed659bb8d817e3002d2437cb3cf51fed14c16d805'
assert h(D/'manifest.json')=='8cc23c49f3cf116d080c2d3f83aa0e48dd5345273eca03917e27e6f76d78d8f0'
# Complete exact unified diff parser; verifies all context, hunk counts, absolute positions and final bytes.
def apply(base,patch,target,inverse=False):
 original=base.decode().splitlines(keepends=True);lines=patch.decode().splitlines(keepends=True);result=[];cursor=0;index=2
 if lines[0].startswith('diff --git '):
  assert lines.pop(0).strip()=='diff --git a/'+target+' b/'+target
 if lines[0].startswith('new file mode '):
  assert not base and lines.pop(0).strip()=='new file mode 100644'
 assert lines[0].strip() in ('--- a/'+target,'--- /dev/null')
 assert lines[1].strip() in ('+++ b/'+target,'+++ /dev/null')
 while index<len(lines):
  header=re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@[^\n]*\n?',lines[index]);assert header
  oldstart,oldcount,newstart,newcount=[int(header[k]) if header[k] is not None else 1 for k in range(1,5)]
  pos=oldstart-1 if oldcount else oldstart;assert cursor<=pos<=len(original)
  result.extend(original[cursor:pos]);cursor=pos;assert len(result)==(newstart-1 if newcount else newstart)
  consumed=produced=0;index+=1
  while index<len(lines) and not lines[index].startswith('@@ '):
   row=lines[index];prefix=row[:1];assert prefix in (' ','+','-')
   body=row[1:]
   if prefix in (' ','-'):assert cursor<len(original) and original[cursor]==body;cursor+=1;consumed+=1
   if prefix in (' ','+'):result.append(body);produced+=1
   index+=1
  assert (consumed,produced)==(oldcount,newcount)
 result.extend(original[cursor:]);return ''.join(result).encode()
m=json.loads((D/'manifest.json').read_text());assert len(m['targets'])==3
expected={'docs/stories/10.34.story.md':9,'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md':7,'docs/qa/staging-acceptance-register.md':11};facts=[];proposed={};combined=b''
for row in m['targets']:
 path=row['target'];assert path in expected
 base=(R/path).read_bytes();preview=(R/row['preview']).read_bytes();suffix=(R/row['suffix']).read_bytes();forward=(R/row['patch']).read_bytes();inverse=(R/row['inversePatch']).read_bytes();combined+=forward
 for raw,field in [(base,'baseSha256'),(preview,'previewSha256'),(suffix,'suffixSha256'),(forward,'patchSha256'),(inverse,'inversePatchSha256')]:assert sha(raw)==row[field]
 assert len(base)==row['baseBytes'] and len(preview)==row['previewBytes']
 assert preview==base+suffix and len(suffix.splitlines())==row['addedLines']==expected[path]
 assert apply(base,forward,path)==preview and apply(preview,inverse,path)==base
 assert re.findall(rb'^.*\[[ xX]\].*$',base,re.M)==re.findall(rb'^.*\[[ xX]\].*$',preview,re.M)
 modes={name:oct(stat.S_IMODE((R/file).stat().st_mode)) for name,file in [('actual',path),('preview',row['preview'])]};assert set(modes.values())=={'0o644'}
 proposed[path]=preview;facts.append(dict(path=path,baseSha256=sha(base),previewSha256=sha(preview),originalPrefixExact=True,forwardInverseExact=True,checkboxLinesExact=True,addedLines=row['addedLines'],modes=modes))
assert combined==(R/m['combinedPatch']).read_bytes() and sha(combined)==m['combinedPatchSha256']
# Package seals, all original PM files and all saved references remain unchanged.
seals=[]
for line in (D/'SHA256SUMS').read_text().splitlines():
 digest,path=line.split(None,1);path=path.strip();file=D/path
 assert h(file)==digest;seals.append(path)
sources=json.loads((D/'source-hashes.json').read_text())
for group in ['references','immutablePmResume4Files','budgetRulingPreserved']:
 for row in sources[group]:assert h(R/row['path'])==row['sha256']
assert len(sources['immutablePmResume4Files'])==41
assert set(str(x.relative_to(P)) for x in P.rglob('*') if x.is_file())=={str(Path(row['path']).relative_to(P.relative_to(R))) for row in sources['immutablePmResume4Files']}
# Prior PM package remains a separate untouched five-target unit.
pm=json.loads((P/'manifest.json').read_text());pmchecks=[]
for row in pm['targets']:
 target=R/row['target'];base=target.read_bytes() if target.is_file() else b''
 assert target.exists()==row['baseExists'] and (sha(base) if row['baseExists'] else None)==row['baseSha256']
 patch=(R/row['patch']).read_bytes();preview=(R/row['preview']).read_bytes()
 assert sha(patch)==row['patchSha256'] and sha(preview)==row['proposedSha256']
 assert apply(base,patch,row['target'])==preview;pmchecks.append(row['target'])
assert len(pmchecks)==5
# Current165+2 vs prospective162+5 remain explicitly distinct.
current_drift=[]
for row in pm['inputs']:
 current=h(R/row['path']) if (R/row['path']).is_file() else None
 if current!=row['sha256']:current_drift.append(dict(path=row['path'],historical=row['sha256'],current=current))
assert len(pm['inputs'])==167 and len(current_drift)==2
impact=json.loads((D/'input-impact.json').read_text());assert {r['path'] for r in current_drift}=={r['path'] for r in impact['currentDifferencesAdopted']}
for row in impact['currentDifferencesAdopted']:
 actual=next(x for x in current_drift if x['path']==row['path']);assert actual['historical']==row['historicalSha256'] and actual['current']==row['currentSha256']
prospective=sum((sha(proposed[row['path']]) if row['path'] in proposed else h(R/row['path']))!=row['sha256'] for row in pm['inputs']);assert prospective==5
adopt=R/'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-010-context-input-root-adoption.json';assert h(adopt)=='e593eb313dbc62f6f1c8c0206e569caa7fd7680f5031540d9fdb514ef1b9409b'
# One actual overlap; both suffix orders are independently reconstructed and distinct.
future=json.loads((D/'future-010-deltas.json').read_text());target='docs/stories/10.34.story.md';base=(R/target).read_bytes();reg=proposed[target][len(base):]
oldpm=next(r for r in pm['targets'] if r['target']==target);staging=(R/oldpm['preview']).read_bytes();assert staging.startswith(base);stage_suffix=staging[len(base):]
assert sha(base)==future['originalBaseSha256'] and sha(staging)==future['immutableResume4PreviewSha256'] and sha(stage_suffix)==future['immutableStagingSuffixSha256'] and sha(reg)==future['registrationSuffixSha256']
assert sha(base+reg)==future['afterCarrierBeforeStagingSha256'] and sha(base+reg+stage_suffix)==future['afterCarrierAndUnchangedStagingSuffixSha256']
assert base+reg+stage_suffix!=base+stage_suffix+reg
assert len(future['laterStateOverlays'])==14
for row in future['laterStateOverlays']:
 file=R/row['source'];assert h(file)==row['sourceSha256'] and file.read_text().splitlines()[row['line']-1]==row['exactBefore']
 assert 'After ACTUAL verified three-target application only' in row['controlledFutureDelta']
# Exact protected register front matter/seven original IDs stay untouched, distinct from new prose row.
register=(R/'docs/qa/staging-acceptance-register.md').read_text();preview=proposed['docs/qa/staging-acceptance-register.md'].decode();front=register.split('---',2)[1]
assert front==preview.split('---',2)[1]
blocked=front.split('blocked_criteria:\n',1)[1].split('story:',1)[0];ids=re.findall(r'^  (AC-\d+):',blocked,re.M);assert ids==['AC-'+str(n) for n in range(1,8)]
# Bind original quoted008 and preserved actual administrative-close refusal.
quoted=R/'docs/qa/evidence/STUDIO-OBS-011/t0/quoted-docs-s011.sha256';quotes=quoted.read_text().splitlines();assert len(quotes)==20
line=next(x for x in quotes if x.endswith('docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md'));assert line.split()[0]==h(R/'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md')
root=R/'docs/qa/evidence/STUDIO-OBS-011/t0';drift=json.loads((root/'po-historical-prep/008-source-drift.json').read_text());counts={k:len(v) for k,v in drift.items()};assert counts==dict(changed=119,missing=9,added=112,distChanged=57,distAdded=0)
historical=json.loads((root/'runtime-historical-import/receipt.json').read_text());assert historical['008CloseStillHardFail'] is True
original008=(R/'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md').read_text();assert '| Status | **Done** |' in original008 and original008 in proposed['docs/stories/STUDIO-OBSERVED/STUDIO-OBS-008.story.md'].decode()
assert not (R/'.ai/STUDIO-OBS-008-close.json').exists()
result=dict(scope='INDEPENDENT_STATIC_CARRIER_REGISTRATION_ONLY',dispositionSha256=h(D/'disposition.md'),manifestSha256=h(D/'manifest.json'),targetChecks=facts,combinedPatchSha256=sha(combined),packageSealEntries=len(seals),pmOriginalFilesPreserved=41,sourceReferenceHashesPreserved=len(sources['references']),irBudgetFilesUnchanged=len(sources['budgetRulingPreserved']),pmFiveActualTargetBasesPreviewsPatchesUnchanged=pmchecks,currentHistoricalInputs=dict(total=167,matches=165,changed=current_drift),prospectiveAfterThreeAppends=dict(matches=162,changed=5,actualApplied=False),futureStateReferencesExact=14,overlapTarget=target,carrierThenStageSha256=sha(base+reg+stage_suffix),stageThenCarrierSha256=sha(base+stage_suffix+reg),differentOrdersNotEquivalent=True,registerFrontMatterByteExact=True,sevenOriginalRegisteredCriteria=ids,quoted008BindingPreserved=True,admin008Close='HARD_FAIL_PRESERVED',historical008SourceDrift=counts,actualTargetsWritten=False,nativeOrCompilerOrEntrypointExecuted=False,rootAdoptionRequired=True)
(O/'audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['targetChecks','currentHistoricalInputs','pmFiveActualTargetBasesPreviewsPatchesUnchanged']}))

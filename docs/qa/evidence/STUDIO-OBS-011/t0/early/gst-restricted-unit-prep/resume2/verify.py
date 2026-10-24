"""Pure source/metadata/preservation checks. Never executes init, phase main, probes or native tools."""
from pathlib import Path
import ast,difflib,hashlib,json
O=Path(__file__).resolve().parent;B=O.parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(B/'manifest.json')=='962c02684ff9f9aa26a912bda15aa6684cb6be844af771aee23137f224be0250'
for n,h in json.loads((B/'manifest.json').read_text())['files'].items():assert sha(B/n)==h,n
for n,h in json.loads((O/'bindings.json').read_text()).items():assert sha(Path(n) if n.startswith('/') else R/n)==h,n
for n in ['phase.py','inspect_cache.py','verify.py']:ast.parse((O/n).read_text())
old=(B/'gst-three-only.init.gradle').read_text();new=(O/'gst-three-only.init.gradle').read_text()
block="""    // Only the observed exact buildSrc child may bypass this main-build formatter hook.
    def expectedAuxiliary = new File(expectedProject, 'buildSrc')
    if (p.projectDir.canonicalFile == expectedAuxiliary && gradle.parent != null) return
"""
assert new.count(block)==1 and new.replace(block,'')==old
assert new.index(block)<new.index("throw new GradleException('GST_HOLD_PROJECT')")<new.index("def relative")
phase=(O/'phase.py').read_text();assert phase.replace('runtime/gst-restricted-unit02','runtime/gst-restricted-unit01').replace('runtime/gst-limited-start-proposal02/proposal.json','runtime/gst-limited-start-proposal01/proposal.json')==(B/'phase.py').read_text()
for n in ['cache-metadata.json','inspect_cache.py','case-catalog.json','source-crosscheck.json']:assert (O/n).read_bytes()==(B/n).read_bytes(),n
P1=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal01/proposal.json';P2=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/gst-limited-start-proposal02/proposal.json';a=json.loads(P1.read_text());b=json.loads(P2.read_text());assert sha(P2)=='08a8c37e1c8f3265efb1b9b94cc01fe25cc4aba1141b0bc37547e475aa4f24b1'
for k,v in a.items():
 if k not in {'atUtc','status','proposedNativeCommandUnderImmutableLock'}:assert b[k]==v,k
assert b['proposedNativeCommandUnderImmutableLock']==[('obs011-gst-provisional-02' if x=='obs011-gst-provisional-01' else x) for x in a['proposedNativeCommandUnderImmutableLock']]
assert b['expectedCases']==json.loads((O/'case-catalog.json').read_text()) and len(b['expectedCases'])==99
context_path=R/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs011-gst-context-probe01/root-terminal.json';context=json.loads(context_path.read_text());expected='/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend';aux=expected+'/buildSrc'
assert context['contexts']==['GST_BUILD_CONTEXT|checks-buildsrc|'+aux+'|true','GST_BUILD_CONTEXT|checks-backend|'+expected+'|false'] and context['wrapperExit']==0 and context['sourceWrites']==0
# Source-decision model receives already-canonical directory identities, matching actual guard operands.
def decision(canonical,parent):
 if canonical==aux and parent:return 'SKIP_AUXILIARY_BEFORE_SPOTLESS'
 if canonical!=expected:return 'HOLD_PROJECT'
 return 'CONFIGURE_EXACT_THREE'
vectors=[(expected,False,'CONFIGURE_EXACT_THREE'),(expected,True,'CONFIGURE_EXACT_THREE'),(aux,True,'SKIP_AUXILIARY_BEFORE_SPOTLESS'),(aux,False,'HOLD_PROJECT'),(aux+'-other',True,'HOLD_PROJECT'),('/other/buildSrc',True,'HOLD_PROJECT'),('/other/backend',False,'HOLD_PROJECT'),('/other/backend',True,'HOLD_PROJECT')]
for path,parent,result in vectors:assert decision(path,parent)==result
recipe=(O/'RECIPE.md').read_text();assert 'ONE command line' in recipe and 'ENTIRE keeper invocation' in recipe and 'wait for its actual prompt' in recipe and 'early/gst-restricted-unit-prep/resume2' in recipe
for fence in __import__('re').findall(r'```bash\n(.*?)\n```',recipe,__import__('re').S):
 assert len(fence.splitlines())==1
 if fence.startswith(('./gradlew ','python3 "$GST_RECIPE/phase.py"','python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py ')):assert fence.endswith('< /dev/null')
# Original patch/ten pure format controls are sealed; candidate/cache bindings and all phase
# algorithms remain exact above. This correction does not execute original witness loops.
patch=''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='original/gst-three-only.init.gradle',tofile='resume2/gst-three-only.init.gradle'));(O/'auxiliary-only.patch').write_text(patch)
proof={'old13ArtifactsUnchanged':True,'initChange':'Exact canonical buildSrc+nonnull-parent early return only; all original bytes retained','phaseChange':'two fresh02 pointers only; all algorithms unchanged','caseCatalog99Unchanged':True,'sourceMethods80Mode9Preserved':True,'cachedPrimaryMetadataByteIdentical':True,'proposal01Sha256':sha(P1),'proposal02Sha256':sha(P2),'contextEvidenceSha256':sha(context_path),'sourceDecisionVectors':[{'canonical':x,'parentNonNull':p,'result':r} for x,p,r in vectors],'stdinProcedure':'devnull on full keeper/foreground children; one command and prompt at a time; interactive shell remains TTY','formatterGradleJavaNativeProbePhaseMainExecuted':False}
(O/'preservation.json').write_text(json.dumps(proof,indent=2)+'\n')
manifest=O/'manifest.json'
if manifest.is_file():
 for n,h in json.loads(manifest.read_text())['files'].items():assert sha(O/n)==h,n
 for line in (O/'SHA256SUMS').read_text().splitlines():h,n=line.split('  ',1);assert sha(O/n)==h,n
print(json.dumps({'status':'PURE_CORRECTION_PRESERVATION_ONLY','old13Unchanged':True,'decisionVectors':len(vectors),'cases':99,'phaseAlgorithmsUnchanged':True,'initOtherGuardsExact':True,'actualCommandsOrSourceWrites':0,'manifestChecked':manifest.is_file()}))

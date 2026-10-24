"""Independent Quinn review: source metadata and inspected injected pure checks only.
Never invokes a helper/main/phase/assessor/gate/producer/postclose entry point.
The two `main` functions called below belong solely to inspected pure test suites.
"""
import ast
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
import types

sys.dont_write_bytecode = True
ROOT = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
T = ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
OUT = T/'qa/c8-composed-unit01-review'
P = T/'early/c8-fullcheck-prep'
E = P/'resume4/execution'
C = P/'resume3/control'
COMP = P/'composed-resume1'
pins = {}
audit = {'protectedRuntimeReads': 0, 'externalActions': 0, 'outsideOutputWrites': 0}

def audit_guard(event, args):
    if event in ('subprocess.Popen', 'os.system', 'os.kill', 'os.killpg', 'socket.connect', 'os.fork', 'os.exec'):
        audit['externalActions'] += 1
        raise AssertionError('forbidden external action: '+event)
    if event != 'open' or not isinstance(args[0], (str, bytes)):
        return
    path = Path(args[0].decode() if isinstance(args[0], bytes) else args[0])
    if not path.is_absolute(): path = ROOT/path
    if not path.is_relative_to(ROOT): return
    mode = args[1]
    writing = isinstance(mode, str) and any(c in mode for c in 'wax+')
    if writing and not path.is_relative_to(OUT):
        audit['outsideOutputWrites'] += 1
        raise AssertionError('forbidden write: '+str(path))
    if path.is_relative_to(T/'runtime'):
        audit['protectedRuntimeReads'] += 1
        raise AssertionError('forbidden runtime access: '+str(path))
    if any(term in path.parts for term in ('execution',)) and not path.is_relative_to(P):
        raise AssertionError('forbidden actual execution artifact: '+str(path))

sys.addaudithook(audit_guard)

def H(data): return hashlib.sha256(data).hexdigest()
def raw(path):
    value = path.read_bytes()
    pins[str(path.relative_to(ROOT))] = {'sha256':H(value), 'bytes':len(value)}
    return value
def read(path): return json.loads(raw(path))
def write(name, value):
    with (OUT/name).open('x') as f: json.dump(value, f, indent=2); f.write('\n')

def check_manifest(directory, expected):
    data = raw(directory/'manifest.json'); assert H(data) == expected
    manifest = json.loads(data)
    for row in manifest['files']:
        value = raw(directory/row['path'])
        assert H(value) == row['sha256'] and len(value) == row['bytes']
        if 'mode' in row:
            assert oct((directory/row['path']).stat().st_mode & 0o7777) == row['mode']
    return manifest

def apply_exact(original, patch):
    src = original.splitlines(True); lines = patch.splitlines(True)
    i = 2; cursor = 0; dst = []
    while i < len(lines):
        match = re.fullmatch(r'@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\n', lines[i]); assert match
        start,n,end,k = (int(match[1]),int(match[2] or 1),int(match[3]),int(match[4] or 1))
        start = start-1 if n else start; end = end-1 if k else end
        assert start >= cursor; dst += src[cursor:start]; old=[]; new=[]; i+=1
        while i < len(lines) and not lines[i].startswith('@@ '):
            op,value = lines[i][0],lines[i][1:]; assert op in ' +-'
            if op in ' -':old.append(value)
            if op in ' +':new.append(value)
            i+=1
        assert len(old)==n and len(new)==k and src[start:start+n]==old and len(dst)==end
        dst+=new; cursor=start+n
    return ''.join(dst+src[cursor:])

def strict_pair(new, old, forward, reverse):
    results=[]
    for name,back in ((forward,False),(reverse,True)):
        chunks = re.split(r'(?=^--- )', raw(new/name).decode(), flags=re.M)
        changed=[]
        for chunk in filter(None,chunks):
            before_header,after_header=chunk.splitlines()[:2]
            before_name=before_header[4:]; after_name=after_header[4:]
            filename=Path(after_name if before_name=='/dev/null' else before_name).name
            before='' if before_name=='/dev/null' else raw((new if back else old)/filename).decode()
            after='' if after_name=='/dev/null' else raw((old if back else new)/filename).decode()
            assert apply_exact(before,chunk)==after; changed.append(filename)
        results.append({'diff':name,'files':changed,'strictNoOffsetNoFuzz':True})
    assert set(results[0]['files'])==set(results[1]['files'])
    return results

context=read(ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/c8-composed-unit01-qa-review-context.json')
cm=check_manifest(COMP,context['compositionManifestSha256'])
em=check_manifest(E,context['executionManifestSha256'])
ct=check_manifest(C,context['controlManifestSha256'])
composition=read(COMP/'composition.json'); linkage=read(COMP/'api-linkage.json')
assert H(raw(COMP/'api-linkage.json'))==context['apiLinkageSha256']
note=read(T/'resume2-c8-actual-release-required-bindings.json')
assert H(raw(T/'resume2-c8-actual-release-required-bindings.json'))==context['actualReleaseRequiredBindingsSha256']
assert note['lockWrapperSha256']=='2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
for path,want in composition['inputPins'].items(): assert H(raw(ROOT/path))==want
for row in composition['installMap']:
    assert H(raw(ROOT/row['source']))==row['sha256'] and row['mode']==0o600
    assert composition[row['runtimeRelativePath'].split('/')[0]+'PackagePins'][row['runtimeRelativePath']]==row['sha256']
assert len(composition['installMap'])==29
for row in read(E/'input-pins.json')['inputs']:
    if row['path'].startswith('docs/qa/evidence/STUDIO-OBS-011/t0/runtime/'):
        assert row['sha256']=='86584b3f710109522709cf0195fdc8f20d30f10988e3ba71f80922e00de96036'
        continue
    assert H(raw(ROOT/row['path']))==row['sha256']
diffs={'execution':strict_pair(E,P/'resume3/execution','implementation.diff','implementation.reverse.diff'),
       'control':strict_pair(C,P/'resume2/control','compatibility.forward.diff','compatibility.reverse.diff')}
assert len(diffs['execution'][0]['files'])==9
assert raw(C/'unlock_gate.py').replace(b"REDUCER_ASSESSOR_SHA='db0d5458d60093aa452106d020f3eff45089ae978ba0c8cd0080bc3dd3b9dbef'",b"REDUCER_ASSESSOR_SHA='c58c1fad815686fcc8598840c6152da15987d0cc43f80e852105c384dc52a43c'")==raw(P/'resume2/control/unlock_gate.py')
for name in ('final_verifier.py','postclose.py','guard-exit.bash','policy.json'):
    assert raw(C/name)==raw(P/'resume2/control'/name)

plan=read(E/'successor-plan.json'); catalog=read(E/'successor-catalog.json')
base=read(ROOT/plan['ancestry']['basePlanPath']); oldcat=read(ROOT/catalog['ancestry']['basePath'])
overlay={x['file']:x for x in plan['ancestry']['overlay']}; assert len(overlay)==3
derived=[]
for old in base['source']['files']:
    row=dict(old)
    if row['path'] in overlay:
        assert row['sha256']==overlay[row['path']]['originalSha256']; row['sha256']=overlay[row['path']]['formattedSuccessorSha256']
    derived.append(row)
assert derived==plan['source']['files']
assert H(json.dumps(derived,separators=(',',':')).encode())==composition['sourceDigest']
assert len(derived)==1808 and sum(x['path'].startswith('backend/src/main/') for x in derived)==506
assert catalog['expectedCaseIdentities']==oldcat['expectedCaseIdentities'] and len(catalog['expectedCaseIdentities'])==2774
assert sum(x['expectedStatus']=='SKIP' for x in catalog['expectedCaseIdentities'])==9
assert plan['source']['dist']==base['source']['dist'] and len(plan['source']['dist']['files'])==238
for key in ('helm','quotedCurrent','immutableHelpers','originalReplaySha256'):
    assert plan[key]==base[key]
assert set(plan['sourceModes'])=={x['path'] for x in derived}
core=read(E/'core-reuse.json');core_path=ROOT/core['immutableCorePath'];core_bytes=raw(core_path)
assert H(core_bytes)==core['immutableCoreSha256']
core_tree=ast.parse(core_bytes)
for name,pin in core['functions'].items():
    node=next(x for x in core_tree.body if isinstance(x,ast.FunctionDef) and x.name==name)
    assert H(ast.dump(node,include_attributes=False).encode())==pin

# Replay the inspected execution suite after deleting only the one sealed-output write.
source=raw(E/'pure_checks.py').decode(); tree=ast.parse(source)
removed=[]; retained=[]
for node in tree.body:
    if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='write_text':
        removed.append(ast.get_source_segment(source,node)); continue
    retained.append(node)
assert len(removed)==1 and "pure-check-results.json" in removed[0]
sys.path.insert(0,str(E))
execution={'__file__':str(E/'pure_checks.py'),'__name__':'independent_execution_pure_replay'}
exec(compile(ast.Module(body=retained,type_ignores=[]),'<inspected-execution-pure-no-output-write>','exec'),execution)
assert execution['result']['count']==477
write('execution-pure-reproduction.json',execution['result'])

# Approved single-boundary injected mode projection, avoiding all runtime reads.
control_source=raw(C/'pure_controls.py').decode()
old="modes=read(T/'runtime/gst-restricted-unit06/original-modes.json');policy=read(O/'policy.json')"
new="modes=read(E/'successor-plan.json')['sourceModes'];policy=read(O/'policy.json')"
assert control_source.count(old)==1
control_source=control_source.replace(old,new)
control={'__file__':str(C/'pure_controls.py'),'__name__':'independent_control_pure_definitions'}
exec(compile(control_source,'<inspected-control-pure-with-exact-mode-projection>','exec'),control)
control_result=control['main'](); assert control_result['count']==61
write('control-pure-reproduction.json',control_result)
integration={'__file__':str(C/'integration_controls.py'),'__name__':'independent_integration_pure_definitions'}
exec(compile(raw(C/'integration_controls.py'),'<inspected-integration-pure-definitions>','exec'),integration)
def exact_control_definitions(path,run_name):
    assert path==str(C/'pure_controls.py') and run_name=='pure_fixture_definitions'
    return control
integration['runpy']=types.SimpleNamespace(run_path=exact_control_definitions)
integration_result=integration['main']();assert integration_result['count']==46
write('integration-pure-reproduction.json',integration_result)
write('strict-diff-reproduction.json',diffs)
write('input-pins.json',{'pins':pins,'protectedRuntimeModePinNotRead':plan['acceptedModes'],
  'injectedModesProjection':{'source':str((E/'successor-plan.json').relative_to(ROOT)),
  'sourceSha256':H(raw(E/'successor-plan.json')),'field':'sourceModes',
  'canonicalProjectionSha256':H(json.dumps(plan['sourceModes'],sort_keys=True,separators=(',',':')).encode()),
  'targetBoundary':old,'replacement':new,'logicOtherwiseUnchanged':True},
  'removedOnlySealedOutputWrite':removed})
write('replay-results.json',{'status':'INDEPENDENT_PURE_REPLAY_PASS','executionChecks':477,
  'controlChecks':61,'integrationChecks':46,'totalChecks':584,'installMembers':29,
  'executionManifestMembers':len(em['files']),'controlManifestMembers':len(ct['files']),
  'componentAndRootHashesVerified':True,'strictDiffsReplayed':True,'sourceAncestryDerivedFromSealedMetadata':True,
  'modeEqualityPredicatesUnchanged':True,'actualSourceModesObserved':False,'audit':audit,
  'actualNativeHelperMainObserverGateProducerPostcloseInvocations':0,'release':False,'readiness':False,'permit':False,'C8Credit':False})
print(json.dumps({'status':'INDEPENDENT_PURE_REPLAY_PASS','checks':584,'audit':audit}))

"""Exact child-mask correction review. Source/hash/AST only; no launch or cleanup."""
from pathlib import Path
import ast,hashlib,json,inspect,subprocess,stat,re
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs009-gateway-independent-20261019-0622-corrected';Q=T/'qa/gateway-runtime-mask-review';O=T/'qa/gateway-runtime-mask-corrected-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
context=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway-runtime-mask-corrected-review-context.txt';pins=re.findall(r'^(docs/[^\n]+) SHA256 ([a-f0-9]{64})$',context.read_text(),re.M);assert len(pins)==10
for path,digest in pins:assert h(R/path)==digest,path
for row in (Q/'SHA256SUMS').read_text().splitlines():digest,name=row.split(None,1);assert h(Q/name.strip())==digest
old=(D/'history/run_private.parent-mask-candidate.py').read_text();new=(D/'run_private.py').read_text()
expected=old.replace('# Root-owned directories remain0700; actual chart copies must retain their bound0644 modes.\nos.umask(0o022)\n','').replace("text=True, timeout=A['maximumSeconds'])","text=True, timeout=A['maximumSeconds'], umask=0o022)",1)
assert new==expected
assert h(D/'run_private.py')=='ff8b82850bdda7bc066c5f7d8ab202d3c1cfcb155d31711168cfb0ec6feff054'
tree=ast.parse(new);masks=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='os' and n.func.attr=='umask'];assert len(masks)==1 and masks[0].args[0].value==0o077
runs=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='subprocess' and n.func.attr=='run'];assert len(runs)==2
for n in runs:
 kwargs={k.arg:k.value for k in n.keywords}
 if isinstance(n.args[0],ast.Name) and n.args[0].id=='argv':assert isinstance(kwargs['umask'],ast.Constant) and kwargs['umask'].value==0o022
 else:assert 'umask' not in kwargs
assert inspect.signature(subprocess.Popen).parameters['umask'].default==-1
implementation=inspect.getsource(subprocess.Popen._execute_child);assert 'umask,' in implementation[implementation.index('_fork_exec('):] and 'os.umask(' not in implementation
assert 'with Popen(*popenargs, **kwargs) as process:' in inspect.getsource(subprocess.run)
auth=json.loads((D/'root-authorization.json').read_text());package=Path(auth['package']);manifest=json.loads((package/'manifest.json').read_text())
assert h(package/'manifest.json')==auth['manifestSha256']=='06107221f5863414867f79831e69758253252ff1d991663db460200882a80d54'
for row in manifest['artifacts']:
 p=package/row['path'];assert h(p)==row['sha256'] and p.stat().st_size==row['bytes'] and f'{stat.S_IMODE(p.stat().st_mode):04o}'==row['mode']
chart=json.loads((package/'chart-bindings.json').read_text())
for row in chart['files']:assert h(R/chart['sourceChart']/row['path'])==row['sourceSha256'] and f'{stat.S_IMODE((R/chart["sourceChart"]/row["path"]).stat().st_mode):04o}'==row['mode']
prior=json.loads((Q/'audit.json').read_text());assert prior['oldRawSuiteExit']==1 and prior['actualFailedCases']==2 and prior['actualTemplateRenders']==0
oldD=T/'runtime/obs009-gateway-independent-20261019-0620-once';assert h(oldD/'root-failure-classification.json')==prior['oldFailureClassificationSha256']
oldterminal=json.loads((oldD/'root-terminal-archive.json').read_text())
for path,digest in oldterminal['archiveFiles'].items():assert h(oldD/'complete-workspace-archive'/path)==digest
for cleanup in prior['cleanupCandidates']:
 archive=R/cleanup['archive']
 for path,fact in cleanup['files'].items():assert h(archive/path)==fact['sha256'] and f'{stat.S_IMODE((archive/path).stat().st_mode):04o}'==fact['mode']
wrapper=(D/'execute_once.py').read_text();assert wrapper.count('subprocess.Popen(')==1 and ".open('x')" in wrapper and 'code = p.wait()' in wrapper
assert auth['automaticRetry'] is False and auth['productSourceWrites'] is False and auth['independentReviewRequiredBeforeLaunch'] is True
assert not (D/'launch-consumed.json').exists() and not Path(auth['scratch']).exists()
assert stat.S_IMODE(D.stat().st_mode)==448
out=dict(scope='EXACT_GWM_MASK_01_CHILD_ONLY_CORRECTION',dispatchPinsVerified=len(pins),priorReviewSha256=h(Q/'review.md'),sourceBeforeSha256=h(D/'history/run_private.parent-mask-candidate.py'),sourceAfterSha256=h(D/'run_private.py'),authorizationSha256=h(D/'root-authorization.json'),outerWrapperSha256=h(D/'execute_once.py'),onlyRequiredSourceDelta=True,parentMask077Retained=True,vitestOnlyChildMask022=True,versionChildrenUnchanged=True,standardInstalledPopenChildUmaskSupport=True,all63PackageArtifactsUnchanged=len(manifest['artifacts'])==63,repository22ChartsUnchanged=len(chart['files'])==22,priorActualExit1TwoFailZeroTemplatePreserved=True,priorOwnershipArchiveReviewPreserved=True,freshMarkerAndScratchAbsent=True,rootDirectoryMode='0700',oneShotUnderSameLock=True,automaticRetry=False,actualLaunchExecuted=False,cleanupExecuted=False,productOrOracleChanges=False,nativeLaneC8FullTierLifecycleCredit=False)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

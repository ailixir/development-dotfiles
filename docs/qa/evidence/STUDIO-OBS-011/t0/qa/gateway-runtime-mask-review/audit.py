"""Read-only gateway failure/correction/owned archive audit; no Node/Helm/native/cleanup."""
from pathlib import Path
from collections import Counter
import ast,hashlib,json,os,re,stat,inspect,subprocess
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';D=T/'runtime/obs009-gateway-independent-20261019-0620-once';N=T/'runtime/obs009-gateway-independent-20261019-0622-corrected';P=T/'early/gateway-independent-mutants/resume2';O=T/'qa/gateway-runtime-mask-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
context=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway-runtime-mask-review-context.txt';pins=re.findall(r'^(docs/[^\n]+) SHA256 ([a-f0-9]{64})$',context.read_text(),re.M)
for path,digest in pins:assert h(R/path)==digest,path
oldauth=json.loads((D/'root-authorization.json').read_text());newauth=json.loads((N/'root-authorization.json').read_text());terminal=json.loads((D/'root-terminal-archive.json').read_text());classification=json.loads((D/'root-failure-classification.json').read_text());chart=json.loads((P/'chart-bindings.json').read_text());manifest=json.loads((P/'manifest.json').read_text())
assert h(P/'manifest.json')==oldauth['manifestSha256']==newauth['manifestSha256']=='06107221f5863414867f79831e69758253252ff1d991663db460200882a80d54'
assert h(T/'qa/gateway-independent-mutants-resume2-review/review.md')==newauth['reviewSha256']=='97aeb6a9a8769faedbb6446ee8d992f7b9e59b546a03dcb52eeff93f0fb14047'
for row in manifest['artifacts']:
 p=P/row['path'];assert h(p)==row['sha256'] and p.stat().st_size==row['bytes'] and oct(stat.S_IMODE(p.stat().st_mode))[2:].zfill(4)==row['mode']
assert len(chart['files'])==22
for row in chart['files']:
 assert h(R/chart['sourceChart']/row['path'])==row['sourceSha256']
 assert stat.S_IMODE((R/chart['sourceChart']/row['path']).stat().st_mode)==int(row['mode'],8)
assert terminal['wrapperExit']==1 and terminal['wrapperPid']==48339 and terminal['endPsExit']==1 and terminal['endPsOutput']==''
actual=json.loads((D/'actual-command.json').read_text());assert actual['exit']==1 and actual['automaticRetry'] is False
assert (D/'wrapper.stdout').read_text().splitlines()==['[gradle-lock] acquired after 0.0s','[gradle-lock] released, exit 1'] and (D/'wrapper.stderr').stat().st_size==0
vitest=json.loads((D/'complete-workspace-archive/vitest.json').read_text());assert (vitest['numTotalTests'],vitest['numFailedTests'],vitest['numPassedTests'],vitest['success'])==(2,2,0,False)
cases=[c for suite in vitest['testResults'] for c in suite['assertionResults']];assert len(cases)==2 and all(c['status']=='failed' for c in cases)
assert all('AggregateError' in c['failureMessages'][0] and 'preserve all original assertion/restoration failures' in c['failureMessages'][0] for c in cases)
receipts={}
for unit in ['M-RECURSION','M-NORMALIZED-COMPARISON']:
 receipt=json.loads((D/'complete-workspace-archive/render-evidence-exit2'/f'{unit}-receipt.json').read_text());receipts[unit]=receipt
 assert receipt['status']=='FAILED_OR_INCOMPLETE' and receipt['errorCount']==2 and receipt['renders']==[]
 assert receipt['restored'] is False and receipt['parentUnchanged'] is False and receipt['cleaned'] is False
 assert receipt['nativeGateCredit'] is False and receipt['original80CaseInventoryChange']==0
assert classification['rawNativeSuiteExit']==1 and classification['actualTemplateRenders']==0 and len(classification['archive'])==2
# Snapshot only the exact source-produced owned scratch directories, never a parent/tmp search.
def inventory(directory):
 files={};links={};directories={}
 def walk(path):
  for name in sorted(os.listdir(path)):
   p=path/name;st=p.lstat();relative=str(p.relative_to(directory))
   if stat.S_ISLNK(st.st_mode):links[relative]=os.readlink(p)
   elif stat.S_ISDIR(st.st_mode):directories[relative]=oct(stat.S_IMODE(st.st_mode));walk(p)
   else:assert stat.S_ISREG(st.st_mode);files[relative]={'sha256':h(p),'mode':f'{stat.S_IMODE(st.st_mode):04o}','bytes':st.st_size}
 walk(directory);return files,links,directories

def root_identity(path):
 st=path.lstat();assert stat.S_ISDIR(st.st_mode) and not stat.S_ISLNK(st.st_mode) and st.st_uid==os.getuid() and stat.S_IMODE(st.st_mode)==448
 return dict(path=str(path),dev=st.st_dev,ino=st.st_ino,uid=st.st_uid,gid=st.st_gid,mode='0700')
cleanup=[];modes=Counter()
for entry in classification['archive']:
 unit=entry['unit'];owned=Path(entry['originalOwnedDirectory']);assert str(owned)==receipts[unit]['ownedDirectory'] and re.fullmatch(r'gateway-independent-[A-Za-z0-9]{6}',owned.name)
 identity=root_identity(owned);files,links,dirs=inventory(owned);assert not links
 expected={row['path']:row for row in entry['archivedFiles']};assert len(expected)==44 and set(files)==set(expected)
 archived=D/'failed-owned-chart-archives'/unit;af,al,ad=inventory(archived);assert not al and af==files
 assert dirs==ad
 for path,fact in files.items():
  row=expected[path];assert fact['sha256']==row['sha256'] and fact['mode']==row['mode']
  rel=path.split('/',1)[1];fixed=next(x for x in chart['files'] if x['path']==rel);assert fact['sha256']==fixed['fixedSha256'];modes[fact['mode']]+=1
  assert fact['mode']==('0644' if path=='mutant/templates/_helpers.tpl' else '0600')
 cleanup.append(dict(**identity,kind='EXACT_FAILED_OWNED_CHART_UNIT',unit=unit,archive=str(archived.relative_to(R)),files=files,directories=dirs,symlinks={},allFixedCandidateBytesPreserved=True,exact0644RestorationGatePassed=False,cleanupProposedNotExecuted=True))
# Retained top-level workspace, including only its known dependency symlink, also fully archived.
workspace=Path(oldauth['scratch']);assert workspace.name=='obs009-gateway-independent-20261019-0620-once' and workspace.parent==Path('/private/tmp')
wi=root_identity(workspace);wf,wl,wd=inventory(workspace);arch=D/'complete-workspace-archive';af,al,ad=inventory(arch)
assert wf==af and wl==al and wd==ad and {k:v['sha256'] for k,v in wf.items()}==terminal['archiveFiles']
assert wl=={'studio-runner/node_modules':oldauth['dependencies']}
cleanup.append(dict(**wi,kind='EXACT_FAILED_OWNED_WORKSPACE',archive=str(arch.relative_to(R)),files=wf,directories=wd,symlinks=wl,cleanupProposedNotExecuted=True,dependencyTargetMustRemain=True))
# Concrete candidate delta: auth pins plus sole global022 call; oracle/package/call set unchanged.
oldhash=h(D/'root-authorization.json');newhash=h(N/'root-authorization.json');old=(D/'run_private.py').read_text();new=(N/'run_private.py').read_text()
comment='# Root-owned directories remain0700; actual chart copies must retain their bound0644 modes.\nos.umask(0o022)\n'
assert new.replace(comment,'')==old.replace(oldhash,newhash,1)
assert (N/'execute_once.py').read_text()==(D/'execute_once.py').read_text().replace(oldhash,newhash,1)
for key in ['package','manifestSha256','reviewSha256','node','nodeSha256','helm','helmSha256','dependencies','runCommand','maximumSeconds','singleHeavyUnitUnderSharedLock','automaticRetry','productSourceWrites']:assert oldauth[key]==newauth[key]
assert newauth['scratch']!=oldauth['scratch'] and newauth['scratch'].endswith('0622-corrected')
for key in ['node','helm']:assert h(Path(newauth[key]))==newauth[key+'Sha256']
assert root_identity(N)['mode']=='0700'
tree=ast.parse(new);masks=[n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and isinstance(n.func.value,ast.Name) and n.func.value.id=='os' and n.func.attr=='umask'];assert [n.args[0].value for n in masks]==[0o077,0o022]
vitest_call=next(n for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='run' and n.args and isinstance(n.args[0],ast.Name) and n.args[0].id=='argv');assert 'umask' not in {k.arg for k in vitest_call.keywords}
# Installed standard Python API inspection only, no Popen/run invocation.
assert 'umask' in inspect.signature(subprocess.Popen).parameters
assert 0o644 & ~0o077==0o600 and 0o644 & ~0o022==0o644 and 0o700 & ~0o022==0o700
source=(P/'private-repo/studio-runner/test/deployment/gateway-independent-mutants.test.ts').read_text()
assert 'mkdirSync(evidenceDir, { recursive: false, mode: 0o700 })' in source and "mkdtempSync(join(tmpdir(), 'gateway-independent-'))" in source
assert source.index('expect(snapshot(fixed)).toEqual(expected)')<source.index('for (const component of')<source.index('observeHelmRender(')
assert 'chmodSync(join(mutant, \'templates\', \'_helpers.tpl\'), 0o644)' in source and "if (restored && parentUnchanged)" in source
out=dict(scope='ACTUAL_FAILED_GATEWAY_SETUP_AND_EXACT_UNEXECUTED_MASK_CORRECTION',dispatchPinsVerified=len(pins),oldRawSuiteExit=1,actualFailedCases=2,actualPassedCases=0,actualTemplateRenders=0,oldPerCaseErrorCounts={k:v['errorCount'] for k,v in receipts.items()},failedChartModesHistogram=dict(modes),failedChartBytesAllFixedCandidateExact=True,originalRepository22ChartBindingsUnchanged=True,sealedPackageArtifactsVerified=len(manifest['artifacts']),originalManifestSha256=h(P/'manifest.json'),oldFailureClassificationSha256=h(D/'root-failure-classification.json'),newAuthorizationSha256=newhash,newRunPrivateSha256=h(N/'run_private.py'),newExecuteOnceSha256=h(N/'execute_once.py'),candidateOnlyGlobal022PlusAuthPins=True,childOnlyMaskActuallyImplemented=False,installedPythonChildUmaskKeywordSupported=True,requiredPrecisionCorrection='Keep parent077; remove global022 and pass umask=0o022 only to Vitest subprocess.run',cleanupCandidates=cleanup,cleanupRequiresFreshExactIdentityAndInventoryRecheck=True,cleanupExecuted=False,newNativeOrHelmRun=False,productSourceWritten=False,oldFailureOrGateFlagsRewritten=False,nativeLaneC8LifecycleCredit=False)
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k!='cleanupCandidates'}))

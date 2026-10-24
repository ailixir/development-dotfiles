SOURCE ONLY. This packet creates no binder output, snapshot, parser result, source/product edit or runtime. It writes only these five preparation files. Original failed05/driverdd88/scripts/bound03/facts/admission and all seals stay historical and immutable. Historical precise failure cause remainsUNKNOWN; raw0/incomplete driver1 is not relabeledPASS.

The source owner seal1b6ac6c0 binds candidateea56c0ef, fixture4a6c unchanged, exact one removed/one added line61 patch320cbeff and closed diagnostic8aa6669f. Only the quoted empty extra-array expansion is replaced by the shell-safe parameter expansion. All other script bytes, no-init/debug arguments, scenarios/order,90poll bounds, TLS/auth, image/main/RO/volume/browser/journal/callback checks, stop-t30, recording-after-draining and exact cleanup remain unchanged. The two isolated Bash builtin checks demonstrate the prospective compatibility issue and safe empty/nonempty argument behavior; no product/Docker/browser native case ran there. Source-owner bash-n is retained evidence, not rerun. Stage compatibility does not prove the original historical error; no old log or output leaf is reread.

Canonical host shell is /bin/bash, mode0o555, SHA41e7f937a0d2e7e0bc03884595f54f7a892e468087519de1fc53e177b2503308, diagnosed GNU Bash3.2.57. Runtime argv explicitly uses /bin/bash. The new driver checks same-environment bash resolution to that canonical path and exact hash/mode before launch and repeats the hash/mode with source guards. It performs no new shell check/reproduction; the accepted identity pin identifies the interpreter. PATH itself is recorded only as a hash, with no extra global policy.

New routes are execution06, bound04, unused collectorlabel02/resourceprefix02/output06. Existing exact33 dependencies29same/4reviewed successors, all9measured image/deployment facts, sourceA1/1814/hostE19/238/BD83/fullSDK and deployment05 AFTERcache191everyvalue remain the same. Existing guard predicates and closed projection are retained. The native invocation/wait/postguard/projection/finally tail and entire closed-reader section are byte-identical to driver05; only literal routes/candidate hash and additional source-correction-QA/canonical-shell admission guards change. The driver is unparsed/unexecuted here; root AST/source review remains separate.

The binder is NEW source, SHA3d327e6e07a7b468b5b1cec665c87b5324b267ba89e4314ea41ee211434f31f2, not unchangedde80. It validates exact candidate/fixture/originalNULLbindings/originalcommand/owner seal, all9facts plus a NEW root dependency reference, sourceQA and shell pins, then creates only the fresh four bound payloads plus their manifest. It copies the candidate script and unchangedfixture and updates literal data/command routes; old packets are never overwritten. The inverse recipe is restricted to the exact newbound04 packet BEFORE any runtime/label/output, hash-checks every file and removes only that packet if separately root-authorized. Neither recipe runs now.

Root must pin the final accepted source-QA artifact in admission (dynamic path/SHA and acceptedtrue), new dependency acceptance covering wrapper+QA+interpreter (old855a rejected), accepted06factsSHA, newboundmanifestSHA, prepmanifestSHA and explicit single-runtime authorization. The corresponding facts carry the same exact QA/shell/owner pins; the driver checks their agreement with admission and newpacket provenance. Source-QA reference remainsUNBOUND in this immutable preparation until root supplies the final literal admission; it is not guessed or inferred. Binding and runtime are separate root releases.

This is a separately justified prospective host-wrapper attempt; retryCount0 remains the original per-case no-retry oracle and does not erase historical05. No new scenario/observer/timer/source build/cache/image/provider/Replay operation is added. On any required lookup/guard/runtime/projection failure, stop and preserve the original result; no fallback or automatic retry. Same closed projection and opaque-body custody apply, inhibitor remains through original wait and postguards. Product/browser proofs and final backend admission remain pending actual success; all stories stayInProgress/cap/cutoff/privacy unchanged.

Exact driver delta for root review (no syntax execution):

```diff
--- sealed05/run-d2.py
+++ prospective06/run-d2.py
@@ -1,13 +1,13 @@
 from pathlib import Path
-import os,sys,json,hashlib,stat,subprocess,runpy,datetime,math,re,time
+import os,sys,json,hashlib,stat,subprocess,runpy,datetime,math,re,time,shutil
 
 # One compiler-free consumer of separately root-bound, byte-exact D2 scripts.
 # Preparation does not execute this file. No binder, source mutation or retry is implemented.
 R=Path(__file__).resolve().parents[6]
 P=Path(__file__).resolve().parent
 B=P.parent
-O=B/'final-d2-execution05'
-PACKET=B/'linux-image-smoke-final-bound03'
+O=B/'final-d2-execution06'
+PACKET=B/'linux-image-smoke-final-bound04'
 E=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
 def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
 def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
@@ -37,34 +37,53 @@
 checked_ref(binding['original33Binding'])
 for row in binding['sourceDependencies']:
  p=R/row['path'];assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256'] and p.stat().st_size==row['bytes'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
+# Exact one-expansion source successor and independently accepted dynamic QA.
+correction=binding['sourceCorrection'];assert admission['sourceCorrectionManifestSha256']==correction['ownerManifest']['sha256']=='1b6ac6c046dd173aede93a492491533b4d9156996083698f832ff54ee9a5c315'
+owner=checked_ref(correction['ownerManifest'])
+for row in json.loads(owner.read_text())['artifacts']:checked_ref(row)
+checked_ref(correction['candidate']);checked_ref(correction['closedDiagnostic'])
+assert admission['sourceCorrectionQaAccepted'] is True and admission['rootDependencyIncludesWrapperCorrectionAndShell'] is True
+sourceQa=admission['sourceCorrectionQa'];checked_ref(sourceQa)
+shell=correction['canonicalShell'];assert admission['canonicalShell']==shell
+checked_ref(binding['historicalFailed05']['producerManifest']);checked_ref(binding['historicalFailed05']['receipt'])
 dep=admission['dependencyReview'];checked_ref(dep)
+assert dep['sha256']!='855a7ff18815776de5afb3ddcf09293f74cbdcb8ad1bba551f30421bbf2e29e0'
 reviewRef=dep['reference'];assert isinstance(reviewRef,str) and reviewRef and not any(s in reviewRef for s in ['PENDING','UNBOUND','<','>'])
 factsPath=O/'accepted-final-measured-bindings.json'
 assert factsPath.is_file() and not factsPath.is_symlink() and sha(factsPath)==admission['acceptedFactsSha256']
 facts=json.loads(factsPath.read_text());values=facts['finalBindings'];assert values==binding['genuineNineFinalBindings']
 assert facts['acceptedFinalDependencyReviewReference']==reviewRef
+assert facts['sourceCorrectionManifestSha256']==correction['ownerManifest']['sha256'] and facts['sourceCorrectionQa']==sourceQa and facts['sourceCorrectionQaAccepted'] is True and facts['canonicalShell']==shell
+assert all(facts['rootDependencyAcceptance'][k]==dep[k] for k in ['path','sha256'])
 assert values['acceptedSourceDigest']==admission['expectedSourceDigest']=='a1f8e1c0eaf02f16834f6c129a2749411ab1bd5462f4daf501dc5182f6ff0ebc'
 assert values['acceptedDistDigest']==admission['expectedDistDigest']=='e19da60efb0a7f5eb1563a932b5b3d69f3c701e0b73e5155726e71970bae30c1'
 ID=values['measuredImmutableImageId'];assert ID==admission['expectedImageId']=='sha256:bd83d49256b5be0d2c8dc60b26ec92bef0bcf063eaa0a49de3d0db1fd154e753'
 assert sha(PACKET/'manifest.json')==admission['boundPacketManifestSha256']
 for row in json.loads((PACKET/'manifest.json').read_text())['files']:
  p=PACKET/row['path'];assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256']
-assert sha(PACKET/'future-smoke.sh')=='2b46b5e901df833ce11f570284516515dac8ca48df0119f6a3c97723fbdbc0ad'
+assert sha(PACKET/'future-smoke.sh')=='ea56c0ef2c45b4107a726b3c26cfd5cb35a96e51d18820da5d28463f6a414455'
 assert sha(PACKET/'fixture.mjs')=='4a6c8474c7c609c25b3c40ea3116094eb9e504d5b3da35f66fe730fdf9f89f91'
 packetBinding=json.loads((PACKET/'bindings.json').read_text())
 assert packetBinding['finalBindings']==values and packetBinding['finalDependencySuccessor']['acceptedReviewReference']==reviewRef
 assert packetBinding['finalDependencySuccessor']['measuredFactsSha256']==sha(factsPath)
+expectedCorrection={'ownerManifestSha256':correction['ownerManifest']['sha256'],'sourceQa':sourceQa,'canonicalShell':shell,'historicalScriptSha256':'2b46b5e901df833ce11f570284516515dac8ca48df0119f6a3c97723fbdbc0ad','candidateScriptSha256':correction['candidate']['sha256']}
+assert packetBinding['sourceCorrectionSuccessor']==expectedCorrection
+assert json.loads((PACKET/'manifest.json').read_text())['sourceCorrectionSuccessor']==expectedCorrection
+assert json.loads((PACKET/'future-command-and-bindings.json').read_text())['sourceCorrectionSuccessor']==expectedCorrection
 argv=commands['runtime']['argv'];assert json.loads((PACKET/'future-command-and-bindings.json').read_text())['argv']==argv
 label=commands['expectedLabel'];prefix=commands['resourcePrefix'];out=O/'d2-execution01'
-assert label==admission['collectorLabel']=='obs011-recovery-20261020-final-linux-d2-smoke01'
-assert prefix==admission['resourcePrefix']=='obs011-d2-final-01' and str(out)==admission['outputDirectory']
-assert argv==['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py'),label,'bash',str(PACKET/'future-smoke.sh'),ID,prefix,str(out)]
+assert label==admission['collectorLabel']=='obs011-recovery-20261020-final-linux-d2-smoke02'
+assert prefix==admission['resourcePrefix']=='obs011-d2-final-02' and str(out)==admission['outputDirectory']
+assert argv==['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py'),label,'/bin/bash',str(PACKET/'future-smoke.sh'),ID,prefix,str(out)]
 assert sha(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-runner.py')=='edeaa3592eb85b60097c79a7577d2025027b53ebc3eba470c092e9c9cf2a009f'
 assert not out.exists() and not (O/'driver-start.json').exists() and not any(E.glob(label+'*'))
 initialAllowed={factsPath.name}
 if admissionPath.parent==O:initialAllowed.add(admissionPath.name)
 assert all(p.is_file() and p.name in initialAllowed for p in O.iterdir())
 env=os.environ.copy();env['PATH']=commands['env']['PATHPrefix']+':'+env['PATH'];env['PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD']='1'
+resolvedShell=shutil.which('bash',path=env['PATH']);assert resolvedShell is not None and str(Path(resolvedShell).resolve(strict=True))==shell['path']=='/bin/bash'
+shellPath=Path(shell['path']);assert shellPath.is_file() and not shellPath.is_symlink() and sha(shellPath)==shell['sha256']=='41e7f937a0d2e7e0bc03884595f54f7a892e468087519de1fc53e177b2503308' and oct(stat.S_IMODE(shellPath.stat().st_mode))==shell['mode']=='0o555'
+write('canonical-shell-binding.json',{'canonicalShell':shell,'resolvedBashUnderSameEnvironment':resolvedShell,'pathSha256':hashlib.sha256(env['PATH'].encode()).hexdigest(),'explicitRuntimeArgvShell':'/bin/bash','sourceQa':sourceQa})
 meta=json.loads(checked_ref(binding['runtimeInputPins']).read_text())
 linksExpected=json.loads(checked_ref(binding['original21Links']).read_text())
 expected=json.loads(checked_ref(binding['freshFullInputBaseline']).read_text())
@@ -110,6 +129,7 @@
  assert quotes==supplement['quoted6'];write(name+'-chart-quotes.json',{'chart22':chart,'quoted6':quotes,'exactAcceptedDeployment05Bindings':True})
  for row in binding['sourceDependencies']:
   p=R/row['path'];assert p.is_file() and not p.is_symlink() and sha(p)==row['sha256'] and oct(stat.S_IMODE(p.stat().st_mode))==row['mode']
+ assert sha(shellPath)==shell['sha256'] and oct(stat.S_IMODE(shellPath.stat().st_mode))==shell['mode']
  write(name+'-guard.json',{'sourceA1Files':1814,'hostDistE19Files':238,'fullInputsAndCache191AllValuesExact':True,'protected21CliBrowserEnvChart22Quotes6Dependencies33Exact':True,'host':host()})
 def exact_resource_absence():
  checks=[]
```

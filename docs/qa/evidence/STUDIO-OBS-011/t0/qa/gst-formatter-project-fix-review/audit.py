"""Narrow source/cache/PUBLIC audit only. No phase/init/keeper/native entrypoint execution."""
from pathlib import Path
import ast,copy,datetime,hashlib,io,json,os,re,stat,zipfile

ROOT=Path.cwd();T0=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0'
OLD=T0/'early/gst-restricted-unit-prep';NEW=OLD/'resume2'
D=T0/'runtime/obs011-gst-provisional-01';U=T0/'runtime/gst-restricted-unit01'
PROBE=T0/'runtime/obs011-gst-context-probe01';OUT=T0/'qa/gst-formatter-project-fix-review'
checks=[];facts={}
def check(n,v):assert v,n;checks.append(n)
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
    for q in [p,*p.parents]:assert not q.is_symlink()
    a=p.stat();raw=p.read_bytes();b=p.stat()
    assert (a.st_ino,a.st_size,a.st_mtime_ns,a.st_ctime_ns,a.st_mode)==(b.st_ino,b.st_size,b.st_mtime_ns,b.st_ctime_ns,b.st_mode)
    f={'sha256':sha(raw),'bytes':len(raw),'mtimeNs':a.st_mtime_ns,'mode':f'{stat.S_IMODE(a.st_mode):04o}'}
    if p in facts:assert facts[p]==f
    facts[p]=f;return raw
def load(p):return json.loads(read(p))
def write(n,v):
    fd=os.open(OUT/n,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(v,f,indent=2);f.write('\n')
context_path=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gst-formatter-project-fix-review-context.txt'
context=read(context_path).decode();pins=re.findall(r'^(.+) SHA256 ([0-9a-f]{64})$',context,re.M)
for name,h in pins:check('dispatch pin '+name,sha(read(ROOT/name))==h)
check('1057 exact context pins',len(pins)==1057)
coverage_prefix=str((D/'original-public-coverage-preservation').relative_to(ROOT))+'/'
check('987 coverage-copy context pins',sum(name.startswith(coverage_prefix) for name,h in pins)==987)
for folder,count in [(OLD,13),(NEW,15)]:
    m=load(folder/'manifest.json');check('artifact count '+folder.name,len(m['files'])==count)
    for name,h in m['files'].items():check('manifest '+folder.name+'/'+name,sha(read(folder/name))==h)
for name,h in load(NEW/'bindings.json').items():check('new bound source/cache/public '+name,sha(read(Path(name) if name.startswith('/') else ROOT/name))==h)
old_init=read(OLD/'gst-three-only.init.gradle').decode();new_init=read(NEW/'gst-three-only.init.gradle').decode()
added="    // Only the observed exact buildSrc child may bypass this main-build formatter hook.\n    def expectedAuxiliary = new File(expectedProject, 'buildSrc')\n    if (p.projectDir.canonicalFile == expectedAuxiliary && gradle.parent != null) return\n"
check('exact only init insertion reversed',new_init.count(added)==1 and new_init.replace(added,'')==old_init)
check('auxiliary return before all Spotless setup',new_init.index(added)<new_init.index("p.extensions.getByName('spotless')"))
check('main/target/output/graph guards unchanged',all(s in new_init for s in ["GST_HOLD_PROJECT","GST_HOLD_INPUTS","GST_HOLD_TARGET","GST_HOLD_OUTPUT_LINK","GST_HOLD_STAGED_OUTPUT","GST_HOLD_GRAPH"]))
old_phase=read(OLD/'phase.py').decode();new_phase=read(NEW/'phase.py').decode()
expected=old_phase.replace('runtime/gst-restricted-unit01','runtime/gst-restricted-unit02').replace('gst-limited-start-proposal01/proposal.json','gst-limited-start-proposal02/proposal.json')
check('only two necessary phase pointer edits',expected==new_phase and old_phase.count('runtime/gst-restricted-unit01')==1 and old_phase.count('gst-limited-start-proposal01/proposal.json')==1)
check('phase AST algorithms identical after pointer normalization',ast.dump(ast.parse(new_phase.replace('runtime/gst-restricted-unit02','runtime/gst-restricted-unit01').replace('gst-limited-start-proposal02/proposal.json','gst-limited-start-proposal01/proposal.json')),include_attributes=False)==ast.dump(ast.parse(old_phase),include_attributes=False))
# Strict reconstruction of this one insertion patch, in memory only.
patch=read(NEW/'auxiliary-only.patch').decode().splitlines(keepends=True);src=old_init.splitlines(keepends=True);m=re.fullmatch(r'@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n',patch[2]);assert m
at=int(m[1])-1;result=src[:at];cursor=at;oc=nc=0
for line in patch[3:]:
    if line[0] in ' -':assert src[cursor]==line[1:];cursor+=1;oc+=1
    if line[0] in ' +':result.append(line[1:]);nc+=1
check('auxiliary patch reconstruction',oc==int(m[2]) and nc==int(m[4]) and ''.join(result+src[cursor:])==new_init)
one=load(T0/'runtime/gst-limited-start-proposal01/proposal.json');two=load(T0/'runtime/gst-limited-start-proposal02/proposal.json')
check('exact fresh02 proposal',sha(read(T0/'runtime/gst-limited-start-proposal02/proposal.json'))=='08a8c37e1c8f3265efb1b9b94cc01fe25cc4aba1141b0bc37547e475aa4f24b1')
extra={'previousOrderingProposalSha256','necessaryNamingDelta','previousUnit','actualContextEvidence'}
normalized={k:v for k,v in two.items() if k not in extra};normalized['atUtc']=one['atUtc'];normalized['status']=one['status'];normalized['proposedNativeCommandUnderImmutableLock']=copy.deepcopy(two['proposedNativeCommandUnderImmutableLock']);normalized['proposedNativeCommandUnderImmutableLock'][2]='obs011-gst-provisional-01'
check('honest proposal carry only label/history',normalized==one and two['previousOrderingProposalSha256']==sha(read(T0/'runtime/gst-limited-start-proposal01/proposal.json')))
check('same99catalog and all3writers',load(NEW/'case-catalog.json')==load(OLD/'case-catalog.json')==two['expectedCases'] and len(two['expectedCases'])==99 and two['writerBindings']==one['writerBindings'] and two['expectedSkips']==0 and two['orderedMethodCountInEditedFiles']==80)
check('fresh02 remains unreleased',two['sourceWriteReleased'] is False and two['actualExecution'] is False and two['nativeCredit'] is False and two['remediationClaim'] is False)
cache=load(NEW/'cache-metadata.json');check('cached formatter metadata unchanged',read(NEW/'cache-metadata.json')==read(OLD/'cache-metadata.json'))
jar=read(Path(cache['jarPath']));check('cached Spotless jar exact',sha(jar)==cache['jarSha256'])
with zipfile.ZipFile(io.BytesIO(jar)) as archive:
    for name,row in cache['classes'].items():check('cached class metadata '+name,sha(archive.read('com/diffplug/gradle/spotless/'+name+'.class'))==row['entrySha256'])

project=str(ROOT/'backend');aux=project+'/buildSrc'
check('source guard is exact canonical path and parent conjunction',"if (p.projectDir.canonicalFile == expectedAuxiliary && gradle.parent != null) return" in new_init and "if (p.projectDir.canonicalFile != expectedProject) throw new GradleException('GST_HOLD_PROJECT')" in new_init)
vectors=[]
for path,parent,want in [(project,False,'CONFIGURE_THREE'),(project,True,'CONFIGURE_THREE'),(aux,True,'SKIP_AUX'),(aux,False,'HOLD'),(aux+'-other',True,'HOLD'),(aux+'/nested',True,'HOLD'),(str(ROOT/'frontend/buildSrc'),True,'HOLD'),('/other/backend/buildSrc',True,'HOLD'),('/other/backend',False,'HOLD'),(project+'-other',True,'HOLD')]:
    got='SKIP_AUX' if path==aux and parent else 'HOLD' if path!=project else 'CONFIGURE_THREE'
    check('pure source-context decision '+path+str(parent),got==want);vectors.append({'canonicalProject':path,'gradleParentNonNull':parent,'expected':want,'modeledDecision':got,'groovyExecuted':False})
probe_terminal=load(PROBE/'root-terminal.json');probe_log=read(PROBE/'probe.stdout').decode();actual_contexts=[x for x in probe_log.splitlines() if x.startswith('GST_BUILD_CONTEXT|')]
check('actual help context order',actual_contexts==probe_terminal['contexts']==['GST_BUILD_CONTEXT|checks-buildsrc|'+aux+'|true','GST_BUILD_CONTEXT|checks-backend|'+project+'|false'])
check('actual help is closed zero with source retained',probe_terminal['wrapperExit']==0 and probe_terminal['source1808StillOriginal'] is True and probe_terminal['postWaitPsExit']==1 and probe_terminal['postWaitPsOutput']=='' and probe_terminal['sourceWrites']==0 and probe_terminal['native99Executed'] is False)
check('probe task was help not formatter/test','> Task :help' in probe_log and '> Task :test' not in probe_log and '> Task :spotless' not in probe_log and read(PROBE/'probe.stderr')==b'')
format_log=read(U/'format.log').decode();restore_log=read(U/'restore-compile.log').decode()
format_receipt=load(D/'owned-format/receipt.json');restore_receipt=load(D/'owned-restore-compile/receipt.json')
check('unit01 actual setup failure before formatter/test',format_receipt['collectorExit']==1 and 'GST_HOLD_PROJECT' in format_log and "line: 7" in format_log and '> Task :spotless' not in format_log and '> Task :test' not in format_log)
check('native phase logs exactly archived',sha(read(U/'format.log'))==sha(read(D/'owned-format/collector.private.log')) and sha(read(U/'restore-compile.log'))==sha(read(D/'owned-restore-compile/collector.private.log')))
check('cleanup compile zero UP_TO_DATE not fresh proof',restore_receipt['collectorExit']==0 and '> Task :compileTestJava UP-TO-DATE' in restore_log and 'BUILD SUCCESSFUL' in restore_log and '> Task :test' not in restore_log)
before=load(U/'before.json');restored=load(U/'restored.json');after=load(U/'after-restore-compile.json');stage=load(U/'staged.json')
check('unit01 source/dist restored and reconciled',before['files']==restored['files']==after['files'] and before['digest']==restored['digest']==after['digest']=='061fc41feb02ac4cf12fd5f696257682994e11671b8def3cf31bd1f5c9ce1617' and before['dist']==restored['dist']==after['dist'])
before_map={x['path']:x['sha256'] for x in before['files']};stage_map={x['path']:x['sha256'] for x in stage['files']}
check('only complete three candidates staged',set(k for k in before_map if before_map[k]!=stage_map[k])=={x['file'] for x in one['writerBindings']} and all(stage_map[x['file']]==x['afterSha256'] for x in one['writerBindings']))
closed=load(D/'root-unit-closed.json');preclose=load(D/'root-preunlock-restored-terminal.json')
check('old wrapper and lease closed with native1',closed['toolExit']==closed['wrapperExit']==1 and closed['kernelLockFreeObserved'] is True and closed['sourceRestoredDigest']==before['digest'] and closed['native99Executed'] is False and all(x['proof']=='PID_ABSENT' for x in closed['wrapperAndShellTerminal']))
check('recorded phase resources closed before unlock',len(preclose['recordedOwnedTerminal'])==3 and all(x['proof']=='PID_ABSENT' for x in preclose['recordedOwnedTerminal']) and not preclose['boundary']['otherProjectFacts'] and len(preclose['boundary']['inheritedMatched'])==6 and not preclose['boundary']['inheritedIdentityChanged'] and preclose['rootLeaseReturningToNoSourceWriterAfterUnlock'] is True)
check('all phase observer receipts terminal',all(r['status']=='NATIVE_PHASE_TERMINAL' and r['remainingOwnedNonJvmFacts']==[] and r['automaticRetry'] is False and r['evidenceErrors']==[] for r in [format_receipt,restore_receipt]))
original_modes=load(U/'original-modes.json')
for row in before['files']:
    p=ROOT/row['path'];check('current original restored '+row['path'],sha(read(p))==row['sha256'] and int(facts[p]['mode'],8)==original_modes[row['path']])
for row in before['dist']['files']:check('current original dist '+row['path'],sha(read(ROOT/'studio-runner/dist'/row['path']))==row['sha256'])
main=[x for x in before['files'] if x['path'].startswith('backend/src/main/')];check('main506 including resources exact',len(main)==506 and {str(p.relative_to(ROOT)) for p in (ROOT/'backend/src/main').rglob('*') if p.is_file() or p.is_symlink()}=={x['path'] for x in main})
for row in one['writerBindings']:
    check('all original backups retained '+row['file'],sha(read(D/'source-original-backups'/row['file']))==sha(read(U/'original'/Path(row['file']).name))==row['beforeSha256'])
preservation=load(D/'original-public-coverage-preservation.json')
check('987 preserved PUBLIC coverage facts',len(preservation['files'])==987 and preservation['staleDynamicCount']==967 and preservation['noFreshnessOrCoverageCredit'] is True and preservation['captureBaselineRegenerated'] is False)
for i,row in enumerate(preservation['files']):
    p=ROOT/row['archivePath'];check('coverage custody '+str(i),sha(read(p))==row['sha256'] and facts[p]['bytes']==row['bytes'] and facts[p]['mtimeNs']==row['originalMtimeNs'] and row['coverageCredit'] is False)
recipe=read(NEW/'RECIPE.md').decode();fences=re.findall(r'```bash\n(.*?)\n```',recipe,re.S)
for code in fences:
    if ('./gradlew ' in code or code.startswith('python3 ') and ('phase.py' in code or 'run-backend-tasked.py' in code)):
        check('direct foreground input closed '+code.split()[0],code.rstrip().endswith('< /dev/null'))
check('TTY procedure one command and status after prompt','Send exactly ONE command line per tool input' in recipe and 'Do not paste multiple fences/lines or queue status' in recipe and 'Do not redirect the interactive lock-shell launch itself to devnull' in recipe)
keeper=read(D/'owned_native_phase.py').decode();core=read(T0/'early/fullcheck-harness/resume3/harness.py').decode()
check('keeper uses original same-start ownership core',"'a1e7d05ff991965fae636077df1c26d11035c387e9456ff9aa29a6c4709e8aae'" in keeper and "scope['run_owned'](unit['argv']" in keeper)
check('core child inherits actual keeper stdin','subprocess.Popen(command,' in core and 'stdin=subprocess.PIPE' not in core)
# Pure unchanged formatter checker contracts only; no phase main or source/capture functions.
tree=ast.parse(new_phase);nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'hold','java_tokens','split_imports','format_only'} or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='TOKEN' for t in n.targets)]
env={'re':re};exec(compile(ast.Module(body=nodes,type_ignores=[]),'<unchanged-format-checker-pure-definitions>','exec'),env)
base=b'import a.Unused;\nimport b.Used;\nclass C { Used x; void t(){ assertThat(3).isEqualTo(3); } }\n'
format_vectors=[]
for name,value,want in [('identical',base,True),('outside whitespace/comments',base.replace(b'class C',b'// unchanged\nclass   C'),True),('unused import',base.replace(b'import a.Unused;\n',b''),True),('added import',b'import q.Added;\n'+base,False),('used import removed',base.replace(b'import b.Used;\n',b''),False),('assertion changed',base.replace(b'.isEqualTo(3)',b'.isEqualTo(4)'),False),('timer or number changed',base.replace(b'assertThat(3)',b'assertThat(30)'),False)]:
    try:env['format_only'](base,value);got=True
    except RuntimeError:got=False
    check('pure format checker '+name,got is want);format_vectors.append({'name':name,'accepted':got,'expected':want})
for p,f in list(facts.items()):check('stable source/PUBLIC/cache '+p.name,sha(read(p))==f['sha256'])
result={'decision':'BOUNDED_FORMATTER_CORRECTION_SUPPORTED_PENDING_FRESH_ROOT_RELEASE','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checksPassed':len(checks),'checks':checks,'dispatchPinsVerified':len(pins),'coveragePreservationPinsVerified':987,'oldArtifactsUnchanged':13,'newSealedArtifactsVerified':15,'newManifestSha256':sha(read(NEW/'manifest.json')),'newInitSha256':sha(read(NEW/'gst-three-only.init.gradle')),'newPhaseSha256':sha(read(NEW/'phase.py')),'proposal02Sha256':sha(read(T0/'runtime/gst-limited-start-proposal02/proposal.json')),'contextModels':vectors,'pureFormatCheckerControls':format_vectors,'oldUnit01FormatterExit':1,'oldNative99Executed':False,'originalSourceRestored':1808,'originalMainResourcesRestored':506,'originalDistRestored':238,'originalCompileStatus':'EXIT0_UP_TO_DATE_NO_FRESH_COMPILE_CREDIT','oldUnitWrapperExit':1,'oldResourcesAndLockClosureSupportedByArchivedEvidence':True,'newGroovyInitExecuted':False,'newNative99Executed':False,'root02PhaseKeeperAndActiveLockPinsStillRequired':True,'newSourceOrCommandRelease':False,'within0277LimitedOrderingOnly':True,'generalW1MainReplayC8LaneLifecycleCredit':False,'causeRemedyClaim':False,'rawPrivateOrNativeTempAccess':0,'actualNativeCompilerFormatterProbeCallsByReviewer':0,'requiredFindings':[],'budgetCeilingUsd':500,'actualSpend':'UNAVAILABLE','inputFacts':[{'path':str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else 'PINNED_CACHE/'+p.name,'fact':v} for p,v in facts.items()]}
write('audit.json',result)
print(json.dumps({k:result[k] for k in ['decision','checksPassed','dispatchPinsVerified','coveragePreservationPinsVerified','oldUnit01FormatterExit','oldNative99Executed','requiredFindings']}))

"""Finite design/source-text comparisons only. No subject/model/equivalence test executed.
The2092 table is metadata; original member bodies/modes are never acquired here.
"""
from pathlib import Path,PurePosixPath
import collections,hashlib,json,stat
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gst-style-isolated-validation-design');O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/gst-style-isolated-validation-design-review');T=Path('docs/qa/evidence/STUDIO-OBS-011/t0')
checks=[];pins=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(name,ok):
 if not ok:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def verified(row,prefix=None):
 p=Path(row['path']) if prefix is None else prefix/row['path'];check('NAMED_PUBLIC_ONLY_'+str(p),'/runtime/' not in str(p) and '/.gradle/' not in str(p) and not str(p).endswith('preexisting-baseline.json'))
 b=p.read_bytes();st=p.stat();mode=row['mode'];mode=int(mode,0) if type(mode)is str and mode.startswith('0o') else int(mode,8) if type(mode)is str else mode
 check('SHA_'+str(p),h(b)==row['sha256']);check('BYTES_'+str(p),len(b)==row['bytes']);check('MODE_'+str(p),stat.S_IMODE(st.st_mode)==mode);pins.append({'path':str(p),'sha256':h(b),'bytes':len(b),'mode':mode});return b
b=(S/'manifest.json').read_bytes();check('EXACT_SUBJECT_MANIFEST',h(b)=='1080e08125dc5f137ef7336be2eeb7b7aca42279528f624c8194b288dd0c3f8d');m=json.loads(b);check('DESIGN3_PAYLOADS',len(m['files'])==3)
for r in m['files']:verified(r,S)
d=json.loads((S/'design.json').read_bytes());text=(S/'review.md').read_text();check('EXACT_DESIGN',h((S/'design.json').read_bytes())=='9a055b24be7fb8eeff4cb4f9647ed4a7575b9bd0565d0d9c87e7e956cd8d22aa')
inputs=json.loads((S/'input-pins.json').read_bytes());check('NAMED39_INPUTS',inputs['count']==len(inputs['pins'])==39)
for r in inputs['pins']:verified(r)
candidate=T/'early/gst-checkstyle-remediation-prep/resume1';cm=json.loads((candidate/'manifest.json').read_bytes());check('EXACT_CANDIDATE25',h((candidate/'manifest.json').read_bytes())=='b6a935f9235b8b80cbaf5ddff4502631290668fe12334dccd1caba1dd612473e' and len(cm['members'])==25)
for r in cm['members']:verified(r,candidate)
for review in [T/'resume-architecture/resume2/gst-checkstyle-remediation-source-review',T/'qa/gst-checkstyle-remediation-source-review']:
 rm=json.loads((review/'manifest.json').read_bytes())
 for r in rm['files']:verified(r,review)
counts=cm['counts'];check('METHOD80_ASSERTION813_NOT_NATIVE',counts['testMethods']==80 and counts['assertionEntryPoints']==813 and counts['threeFileExpandedCaseCount']==88 and counts['acceptedFiveClassCaseCohort']==99)
G=json.loads((T/'early/gateway80-proof-prep/resume6/source-guards.json').read_bytes());expected={r['path']:{'sha256':r['sha256'],'mode':r['mode'],'origin':'SOURCE1808'} for r in G['files']}
check('SOURCE1808_UNIQUE',len(expected)==len(G['files'])==1808)
for r in G['dist']['files']:expected['studio-runner/dist/'+r['path']]={'sha256':r['sha256'],'mode':None,'origin':'DIST238'}
for group,rows in G['auxiliaryGroups'].items():
 for path,sha in rows.items():
  if path.endswith('/preexisting-baseline.json'):continue
  if path in expected:check('DEDUP_HASH_'+path,expected[path]['sha256']==sha)
  else:expected[path]={'sha256':sha,'mode':None,'origin':'AUXILIARY_'+group}
actual=d['finiteCopy']['members'];check('COPY2092_EXACT_UNIQUE',len(actual)==len({r['path'] for r in actual})==len(expected)==2092)
for r in actual:
 p=PurePosixPath(r['path']);check('FINITE_ROW_SAFE_'+r['path'],not p.is_absolute() and '..' not in p.parts and str(p)==r['path'] and not any(v in p.parts for v in ['.git','.gradle','build','node_modules']) and '/runtime/' not in r['path'] and not r['path'].endswith('/preexisting-baseline.json'))
 check('FINITE_ROW_METADATA_'+r['path'],{k:r[k] for k in ['sha256','mode','origin']}==expected[r['path']])
check('MISSING284_KNOWN1808',sum(r['mode']is None for r in actual)==d['finiteCopy']['missingModes']==284 and sum(type(r['mode'])is int for r in actual)==d['finiteCopy']['knownModes']==1808)
check('EXACT902_BACKEND_506_MAIN',sum(r['path'].startswith('backend/') for r in actual)==902 and sum(r['path'].startswith('backend/src/main/') for r in actual)==506)
check('MISSING_MODE_HARD_INPUT','NULLS_ARE_MANDATORY_MISSING_INPUTS' in d['finiteCopy']['modeRule'] and '284_FRESH_COPY_MODES' in d['hardMissingInputs'])
check('COPY_NO_LINKS_CACHES_BASELINE',d['finiteCopy']['protectedBaselineCopied'] is False and d['finiteCopy']['copyGitIgnoredBuildsCachesVendorHomeOrExecutionBodies'] is False and d['finiteCopy']['sourceSymlinksToR'] is False and d['finiteCopy']['nodeModulesEntryCreated'] is False)
for path in ['backend/gradlew','backend/gradle/wrapper/gradle-wrapper.jar','backend/gradle/wrapper/gradle-wrapper.properties','backend/buildSrc/build.gradle.kts','backend/buildSrc/settings.gradle.kts','backend/build.gradle.kts','backend/settings.gradle.kts','backend/gradle.properties']:
 check('COMPLETE_BUILD_PATH_'+path,path in expected)
check('BUILD_SRC_SOURCE_AND_CONTRACT',any(p.startswith('backend/buildSrc/src/') for p in expected) and any(p.endswith('/v3/fixtures.json') for p in expected))
records=json.loads((candidate/'source-records.json').read_bytes());check('OVERLAY_EXACT3',len(d['overlay'])==len(records)==3)
for r in d['overlay']:
 old=next(v for v in records if v['source']==r['path']);check('EXACT_OVERLAY_'+r['path'],r['preimageSha256']==old['sourceSha256']==expected[r['path']]['sha256'] and r['candidateSha256']==old['postimageSha256'] and r['mode']==0o644 and r['candidateSha256']!=r['preimageSha256'])
 check('POSTIMAGE_PIN_'+r['path'],h(Path(r['candidateSource']).read_bytes())==r['candidateSha256'])
check('VIRTUAL_DIGEST_NOT_F9','NOT_REUSE_F9' in d['virtualDigest'] and d['acceptedComposition']['freshActualRQualificationOwed'] is True)
check('SOURCE_R_READONLY',d['sourceWindow']['sharedSourceWriters']==[] and d['sourceWindow']['sharedApply'] is False and d['sourceWindow']['generalMainW1ReplayRelease'] is False)
check('LEASE_EXACT3_DESTINATIONS',set(d['sourceWindow']['destinationJavaWriters'])=={d['roots']['projectP']+'/'+r['path'] for r in d['overlay']} and d['sourceWindow']['maximumLeaseHours']==12)
check('QUALIFICATION_THEN_LEASE_BEFORE_PREPARE',text.index('Then create one new exclusive lease')<text.index('1. Prepare the finite source composition') and d['sourceWindow']['expiry']=='NO_NEW_PHASE_HOLD_NO_AUTO_RENEW')
check('NOT_CURRENT_NAMES',d['pathExistenceOrCurrentHolderObserved'] is False)
ph={r['id']:r for r in d['phases']};check('PHASE_ORDER',[r['id'] for r in d['phases']]==['prepare','format','verify','regression','archive'])
check('EXACTLY3_ONCE_NATIVE',sum(r.get('nativeInvocationsMaximum',0) for r in d['phases'])==3 and all(ph[n]['nativeInvocationsMaximum']==1 for n in ['format','verify','regression']))
for name,limit in [('format',900),('verify',3600),('regression',7200)]:
 p=ph[name];argv=p['argv'];check('PHASE_LIMIT_'+name,p['acceptanceDeadlineSeconds']==limit and p['expectedNativeExit']==0 and p['parentUmask']=='077' and p['childUmask']=='022')
 check('EXACT_NATIVE_COMMON_'+name,argv[:3]==['/usr/bin/caffeinate','-i',d['roots']['projectP']+'/backend/gradlew'] and p['cwd']==d['roots']['projectP']+'/backend' and all(x in argv for x in ['--offline','--no-configuration-cache','--no-build-cache','--rerun-tasks','--no-daemon','-Dorg.gradle.java.home='+d['java']['home']]))
 check('OWNED_CACHES_'+name,argv[argv.index('--gradle-user-home')+1]==d['roots']['gradleUserHome'] and argv[argv.index('--project-cache-dir')+1]==d['roots']['gradleProjectCache'])
check('FORMAT_SCOPE_AND_CHANGED_HASH_STOP','spotlessJavaApply' in ph['format']['argv'] and 'ONLY_TARGET3_MAY_CHANGE_REVIEW_NEW_HASHES' in ph['format']['nextDecision'])
check('VERIFY_FULL_STYLE_AND_COMPILE',ph['verify']['requiredTasks']==['spotlessJavaCheck','checkstyleMain','checkstyleTest','compileTestJava'] and ph['verify']['testTasks']==[] and ph['verify']['freshCheckstyleXmlBothMainAndTest'] is True)
cases=json.loads((T/'early/gst-restricted-unit-prep/resume6/case-catalog.json').read_bytes());reg=ph['regression'];check('EXACT_CASE_CATALOG575',h((T/'early/gst-restricted-unit-prep/resume6/case-catalog.json').read_bytes())==reg['expectedCaseCatalogSha256']=='575481aa0e652ef11577ef39224b21c340591a6440787647ccb19997f23ecd0e' and reg['caseCatalog']==cases)
check('EXACT99_CLASSES',len(cases)==len({(r['task'],r['class'],r['name']) for r in cases})==99 and collections.Counter(r['class'] for r in cases)==reg['classCounts'] and len(reg['classCounts'])==5)
check('NO_SKIPS_OR_SUBSET',reg['expectedCounts']=={'total':99,'passed':99,'failed':0,'errors':0,'skipped':0} and reg['allowedSkipsFile'] is None and reg['requireFreshTestExec'] is True and reg['collectorOptions']==['--test-tasks','test','--require-exec-tasks','test'])
check('EXACT_FIVE_WHOLE_TEST_FILTERS',[reg['argv'][i+1] for i,v in enumerate(reg['argv']) if v=='--tests']==['com.citi.put.checks.studio.guided.session.'+n for n in ['GuidedSessionIT','GuidedServiceTransportFaultIT','GuidedLifecycleReasonIT','GuidedEvidencePendingAppendIT','GuidedCommittedRefreshStateTest']])
check('JAVA_FOUR_PROPERTIES',d['java']['ownedGradleProperties']=={'org.gradle.java.home':d['java']['home'],'org.gradle.java.installations.auto-detect':'false','org.gradle.java.installations.auto-download':'false','org.gradle.java.installations.paths':d['java']['home']} and d['nativeEnvironment']['JAVA_HOME']==d['java']['home'])
check('JDK_ANCESTRY_ONLY',d['java']['suppliedCachedBindingsNotFreshProbe'] is True and d['monitor']['caffeinateBinaryPin'] is None)
check('OFFLINE_INPUTS_UNKNOWN',d['offlineCache']['seedManifestSha256'] is None and d['offlineCache']['seedCompleteDependencyClosure'] is None and d['offlineCache']['freshBoundedCacheInputAuthorityRequired'] is True and d['offlineCache']['noReadOrProbeNow'] is True and d['offlineCache']['networkInstallPullFallbackRetry'] is False)
check('NO_SECRET_CACHE_COPY',d['offlineCache']['copyPrivateHomePropertiesCredentialsInitDaemonOrJdkRegistry'] is False and d['offlineCache']['originalSeedWrites'] is False)
check('PG_FIXTURE_UNQUALIFIED',d['fixture']['literalFromFiveClassSource']=='postgres:15-alpine' and d['fixture']['freshImageAndJavaFixtureCapabilityProof'] is None and d['fixture']['pullRetagOrFixtureSkipRyukChange'] is False)
check('EXPLICIT_ROOT_COLLECTOR',d['helpers']['legacyMainInvocationAllowed'] is False and d['helpers']['legacyRootDiscoveryOrGitCaptureAllowedInP'] is False and d['helpers']['newControllerAndHooksSeals'] is None)
check('HOOKS_EXACT_DELTAS',d['helpers']['peerHookDelta']=='ONE_EXPECTED_BACKEND_ROOT_LITERAL_ONLY' and d['helpers']['formatterHookDelta']=='EXACT_ROOT_LITERAL_PLUS_CHECK_TASK_GRAPH_AND_REPORTS_XML_REQUIRED_TRUE')
check('DEADLINES_NOT_SIGNALS',d['monitor']['deadlineIsSignalOrTerminality'] is False and d['monitor']['signalKillTerminateOrSynthetic124'] is False and d['monitor']['unresolvedChildAllowsReturnOrUnlock'] is False and d['monitor']['directFirstChildPidStartArgvParentBinaryProof'] is True)
check('ORDINARY_CLOSE_EXACT',d['closure']['freshnessSeconds']==60 and d['closure']['refreshRetryAllowed'] is False and d['closure']['cleanupAuthorized'] is False and d['closure']['isolatedCompileOwedInVerify'] is True and d['closure']['sharedRestoreOrSharedOriginalCompileOwed'] is False)
check('PREPARATION_FAILURE_RETAINED',[(r['toolChunk'],r['exit']) for r in d['sourcePreparationHistory']]==[('037d6b',1),('9ca1ff',0)])
check('NO_CURRENT_AUTHORITY',d['actualRuntimeSourceWindowNativeToolProbeCachePrivateBaselineActions']==0 and d['implementationOrActualLeaseOrAdmissionAuthorized'] is False and d['C8MainIRLaneLifecycleCredit'] is False)
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':h(b),'designPayloads':3,'directPublicInputs':39,'candidatePayloads':25,'pins':pins,'copyTableRowsAreMetadataOnly':2092,'currentCopyTableMemberBodiesOrModesObserved':False,'runtimeCachePrivateBaselineReads':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'FINITE_DOCUMENT_AND_SOURCE_METADATA_DESIGN_CHECKS','count':len(checks),'checks':checks,'allExpected':True,'finiteCopyRowsChecked':2092,'unqualifiedModesRemainNull':284,'candidateSourceTestsOrEquivalenceReplays':0,'subjectOrModelFunctionsExecuted':0,'actualNativeOrResourceActions':0,'noCopyTableMemberCurrentStatOrBodyReads':True,'newBookkeepingFailures':[],'budgetCeilingUsd':500,'aggregateSpend':'UNKNOWN'},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'copyRows':2092,'unknownModes':284,'candidatePayloads':25,'publicInputs':39,'subjectOrModelFunctionsExecuted':0,'actualActions':0}))

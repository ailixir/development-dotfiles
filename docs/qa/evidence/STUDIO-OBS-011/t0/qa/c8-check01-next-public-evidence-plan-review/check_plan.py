"""Read-only source/document checks for the finite plan; no implementation/run."""
import hashlib,json,pathlib,stat
D=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/c8-check01-next-public-evidence-plan')
O=pathlib.Path(__file__).parent
def read(p):return json.loads(pathlib.Path(p).read_text())
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
checks=[];pins=[]
def check(label,value):assert value,label;checks.append({'check':label,'passed':True})
check('exact plan manifest',sha(D/'manifest.json')=='190235dc5dec26fb3603deed1f9147b25778a6668dd9fb1828a067965f0ed30a')
for f in read(D/'manifest.json')['files']:
 p=D/f['path'];check('plan member '+f['path'],sha(p)==f['sha256'] and p.stat().st_size==f['bytes'] and stat.S_IMODE(p.stat().st_mode)==f['mode']);pins.append({'path':str(p),**{k:v for k,v in f.items() if k!='path'}})
scope=read(D/'exact-scope.json');gates=read(D/'source-gates.json')
check('24 explicit public/source inputs',len(scope['inputPins'])==24)
for f in scope['inputPins']:
 p=pathlib.Path(f['path']);check('declared input '+f['path'],sha(p)==f['sha256'] and p.stat().st_size==f['bytes'] and stat.S_IMODE(p.stat().st_mode)==f['mode']);pins.append(f)
for f in gates['frozenQuotedBindings']:
 p=pathlib.Path(f['path']);check('frozen source gate hash '+str(f['line'])+' '+p.name,sha(p)==f['sha256']);lines=p.read_text().splitlines();check('exact gate quote '+str(f['line'])+' '+p.name,lines[f['line']-1].strip()==f['quote'].strip());pins.append({'path':str(p),'sha256':f['sha256'],'line':f['line']})
selected='actualPublishedWrongPasswordAnnotatesEarlierSecretFill'
profile=scope['nativeProfile'];lease=scope['temporaryInstrumentationLease'];output=scope['minimalPublicOutput'];restore=scope['sourceRestorationAndCompile']
check('one original selected method',scope['publicFailureSubject']['method']==selected and scope['publicFailureSubject']['order']==17 and profile['junitExpectedInvocations']==1 and profile['parameterizedVariants']==0 and profile['requiredSkips']==0)
check('one consumed native attempt',scope['proposedNewUnit']['newNativeAttemptCap']==1 and scope['proposedNewUnit']['automaticRetry'] is False)
check('exact default original4000 command',profile['argv']==['./gradlew','test','--tests','com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT.'+selected,'--rerun-tasks','--no-daemon'] and profile['fixtureProfile']=='original4000')
check('one temporary writable test file',lease['writableFiles']==['backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'] and lease['allMainBuildConfigurationDistHelmOtherTestsReadOnly'] is True)
check('one public request/record maximum',lease['publicReadCap']==1 and output['recordCap']==1 and lease['captureOnlyUnexpectedTerminal'] is True)
check('finite restoration compile',restore['restoredCompileAttemptCap']==1 and restore['restoredStandaloneCompileArgv']==['./gradlew','compileTestJava','--rerun-tasks','--no-daemon'] and restore['wholeSourceReturnToF9cAndMainUnchangedRequired'] is True)
check('frozen exact restoration',restore['exactRestoredReplayHash']==lease['exactPreimage']['sha256']=='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475' and restore['originalMode']==420)
check('no authority or clock started',scope['currentPermission'] is False and scope['nativeOrSourceImplementationWritten'] is False and scope['IRClockStarted'] is False and scope['C8OrLaneMainLifecycleCredit'] is False and gates['actualAuthorityIssued'] is False)
check('C8 obligation unchanged',gates['userC8BeforeCredit']['unchanged'] is True and gates['userC8BeforeCredit']['newUserWaiverRequested'] is False)
check('nonIR classification conditional',gates['nonIrQualification']['futureNativeExclusionNotAutomatic'] is True and gates['nonIrQualification']['noTEST001StagesMutationsOrIRProofCredit'] is True)
replay=pathlib.Path(lease['writableFiles'][0]).read_text()
start=replay.index('void '+selected+'()');method=replay[start:replay.index('\n  @Test',start)]
helper=replay[replay.index('private void p3PublishedLogin('):replay.index('\n  private ',replay.index('private void p3PublishedLogin(')+1)]
wait=replay[replay.index('private void awaitFinalizing('):replay.index('\n  private ',replay.index('private void awaitFinalizing(')+1)]
call=replay[replay.index('private JsonNode p3Call('):replay.index('\n  private ',replay.index('private JsonNode p3Call(')+1)]
check('source selected route', 'p3Case(() -> p3PublishedLogin(P3Mode.LOGIN, true))' in method)
check('source helper one direct await',helper.count('awaitFinalizing(id)')==1 and helper.index('p3Seed(scope, correct)')<helper.index('awaitFinalizing(id)')<helper.index('p3Publish(id)')<helper.index('p3Seed(scope, wrong)'))
check('source wait/oracle unchanged','Duration.ofSeconds(90)' in wait and 'Thread.sleep(50)' in wait and '.isEqualTo("FINALIZING")' in wait)
check('p3Call raw capture exclusion necessary','capture.recordHttp(response)' in call and '.timeout(Duration.ofSeconds(15))' in call)
build=pathlib.Path('backend/build.gradle.kts').read_text();check('source default original4000 profile','configureJoinedFixtureLane(this, "original4000")' in build and 'tasks.test { finalizedBy(retainOriginalGuidedCohort) }' in build)
service=pathlib.Path('backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java').read_text();check('source scoped public API errorCode','access.checkUser(user, session.document())' in service and 'access.checkCurrent(session.document())' in service and 'out.set("errorCode", session.progress().path("errorCode"))' in service)
projector=pathlib.Path('backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedPublicPresentationProjector.java').read_text();check('terminal progress cannot establish stage','TERMINAL.contains(state)' in projector and 'out.putNull("activeStep")' in projector)
check('closed states/codes and UNKNOWN',output['fields']['pollState']==['FINALIZING','FAILED','EXPIRED','UNKNOWN_OUTCOME','CANCELLED','UNKNOWN'] and 'UNKNOWN' in output['fields']['errorCode'] and len(output['fields']['errorCode'])==len(set(output['fields']['errorCode'])))
actual_qa=pathlib.Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/c8-check01-failed-resource-actual-closure-review/manifest.json');check('accepted actual closure QA preserved',sha(actual_qa)=='e0d54dce4589996c6eddfe67e616f0932c3f782a21f2bc6586d1675b3378678a');pins.append({'path':str(actual_qa),'sha256':sha(actual_qa)})
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':sha(D/'manifest.json'),'pins':pins,'noReferencedRuntimeReportCohortModelPrivateBodiesRead':True},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'checks':checks,'allPassed':True,'sourceOnly':True,'candidateCodeOrActualAction':False,'nonIRPlanConditionalOnExactLiteralCandidate':True,'selectedCaseDoesNotEstablishFull46Or108CohortCredit':True},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'allPassed':True}))

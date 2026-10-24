"""Generate only inert review metadata/templates in this exact new prep directory."""
from pathlib import Path
import hashlib
import json
HERE=Path(__file__).absolute().parent
assert HERE==Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume3').absolute()
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
k=json.loads((HERE/'contract.json').read_bytes());N=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime'/k['subject']['label']/k['namespace']
def put(name,value):(HERE/name).write_text(json.dumps(value,indent=2)+'\n')
code={n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in k['installedCode']}
code_records={str(HERE/'manifest.json'):None,str(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway80-failed-red-resource-code03-exact-review/manifest.json'):None,str(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-failed-red-resource-code03-exact-review/manifest.json'):None}
a=dict(kind='INERT_FAILED_RED_RESOURCE_ONLY_ROOT_AUTHORIZATION_TEMPLATE',authorizedBy=None,authorized=False,
 expectedWrapperExit=1,newNativeInvocations=0,sourceWrites=[],cleanup=False,normalRoute='HARD_HOLD',credit=False,
 subject=k['subject'],retainedFailure=k['retainedFailure'],compileObligation='NONE_NODE_ONLY_UNCHANGED_SOURCE',
 distinctFailedEntrypointAuthorized=False,sourceDigest=k['protectedInputs']['sourceDigest'],limits=k['limits'],rootInputPins={},codePins=code,
 externalPins={str(ROOT/p):h for p,h in k['externalSourcePins'].items()},newDirectoryPins={},
 pythonRoles={r:dict(path=None,sha256=None) for r in ('launch','reported','process','observedArgument')},
 observationExecutables={r:dict(path=None,sha256=None) for r in ('/bin/ps','/usr/sbin/lsof','git')},
 binaryModes={},binaryHashes={},exactIndependentCodeReviewsQualified=False,newCodeRecordPins=code_records,
 priorNamespaces=k['priorNamespaces'],oldIndexSha256=k['frozenEvidence']['terminalIndexSha256'],physicalNFactFinalizeOnly=True,
 currentFactsObserved=False,actualInstallationAuthorized=False,actualGuardClosingAuthority=False)
put('authorization.template.json',a)
def common(role,mode):return dict(authorizedBy=None,role=role,mode=mode,releaseSha256=None,
 subjectHoldSha256=k['subject']['holdSha256'],oldIndexSha256=k['frozenEvidence']['terminalIndexSha256'],
 retainedFailure=k['retainedFailure'],credit=False,cleanup=False,inputPins={},actualAuthority=False)
put('setup-ownership.template.json',dict(common('SETUP_OWNERSHIP_ADMISSION','negative'),separatelyCaptured=False,oldBindingsUnchanged=False,newBindingsReadonly=False,setupHelperRosterComplete=False,readEofStatus=None,actualBufferVerificationExit=None,actualEvalExit=None,bindingBufferSha256=code['guard-failed-red.bash'],bindingBufferBytes=len((HERE/'guard-failed-red.bash').read_bytes()),helpers=[],actualToolEvidence=[],historicalNumericBase=2255,dynamicHelperPidsNotGuessed=True))
put('negative-status.template.json',dict(common('NEGATIVE_ACTUAL_STATUS','held-proof'),actualNegativeStatus=None,separatelyCaptured=False,oldNormalBindingsUnchanged=False,actualToolEvidence=[]))
put('guard-admission.template.json',dict(common('FAILED_GUARD_ADMISSION','admission'),setupActualStatus=None,negativeActualStatus=None,heldProofActualStatus=None,
 setupInspected=False,negativeSeparateStatusCaptured=False,heldSeparateStatusCaptured=False,sameHolderAfterDenial=False,oldNormalBindingsUnchanged=False,newReadonlyBindingInspected=False,
 configuredLaunch=None,configuredLaunchOperatorTrace=[],heldProofSha256=None,negativeSha256=None,parentBashInspectionIsRootAttestation=True,childReadsParentFunctionContents=False))
put('archive-decision.template.json',dict(common('ARCHIVE_FAILED_STATE','archive'),maximumInvocations=1,actualPriorToolEvidence=[]))
put('actual-review-adoption.template.json',dict(common('ACTUAL_ARCHIVE_REVIEW','final'),actualArchiveExit=None,actualQaReviewed=False,archiveInspected=False,separatelyCaptured=False,
 archiveReceiptSha256=None,independentQaRecord=dict(path=str(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-failed-red-resource-actual-archive-review/manifest.json'),sha256=None),actualToolEvidence=[]))
put('close-permit.template.json',dict(common('FAILED_EXIT_PERMIT','gate'),expectedWrapperExit=1,actualFinalStatus=None,finalSeparateStatusCaptured=False,readinessInspected=False,
 oldNormalBindingsUnchanged=False,readinessSha256=None,finalResultSha256=None,issuedAtEpoch=None,actualToolEvidence=[]))
put('wrapper-result.template.json',dict(common('ACTUAL_WRAPPER_RESULT','postclose'),actualWrapperExit=None,separatelyCaptured=False,actualToolEvidence=[],gateAllowSha256=None,permitSha256=None,readinessSha256=None))
put('install-map.json',dict(kind='INERT_LATER_ROOT_INSTALLATION_ONLY',R=str(ROOT),E=str(N.parent),W=k['protectedInputs']['ownedWorkspaceBinding']['path'],N=str(N),
 newDirectoryMode=0o700,oldDirectEMembers=2263,typedImmutablePriorNamespaces=k['priorNamespaces'],prospectiveDirectEntries=2265,allowedNewDirectEMembers=['failed-red-resource-disposition01',N.name],
 files=[dict(source=n,destination=str(N/n),sha256=h,sourceMode=0o644,installedMode=0o600) for n,h in code.items()],
 sourceManifestSelfExcluded=True,actualRootControlsNotInSourceManifest=True,actualInstallation=False,
 archiveRoots=[str(N/name) for name in k['archiveNames']],archiveChildModes='actual source modes preserved; roots0700',
 noOldMemberWrites=True,sourceWrites=[],nativeInvocations=0,cleanup=False))
put('control-schema.json',dict(kind='FINITE_EXTERNAL_ROOT_CONTROL_AND_OWN_GENERATED_RECORD_CONTRACT',
 integrity='Root SHA argument is checked before interpreting its immutable JSON buffer; complete root-derived preexisting N inputPins required. No self-derived authorization.',
 authority='authorization.template.json',controls={
 'root-setup-ownership.json':'SETUP_OWNERSHIP_ADMISSION','root-negative-status.json':'NEGATIVE_ACTUAL_STATUS','root-guard-admission.json':'FAILED_GUARD_ADMISSION','root-archive-decision.json':'ARCHIVE_FAILED_STATE',
 'root-actual-review-adoption.json':'ACTUAL_ARCHIVE_REVIEW','root-close-permit.json':'FAILED_EXIT_PERMIT','root-wrapper-result.json':'ACTUAL_WRAPPER_RESULT'},
 immutableControlNames=['root-setup-ownership.json','root-authorization.json','root-negative-status.json','root-guard-admission.json','root-archive-decision.json','root-actual-review-adoption.json','root-close-permit.json','root-wrapper-result.json'],
 immutableOutputs=['negative-denial.json','held-proof.json','archive-attempt.json','archive-receipt.json','final-attempt.json','readiness.json','final-result.json','gate-attempt.json','gate-allow.json','postclose.json'],
 clientPattern='client-PID-SHA256START16.json',utilityPattern='utility-CLIENTPID-SHA256START16-NUMBER.json',
 currentUtilityLimitations='Popen PID/requested argv/canonical binary/wait bound; only the exact census probe gains current snapshot start, not invented utility history.',
 oldUtilities=2245,oldClients=4,oldRecordedPidStartPairs=7,oldStartless=73492,oldNumericUnion=2253,newNumericUnion=2255,numericOnlyAbsent=[73492,86096,96486],
 futureFailureNamespaceStageRegistry='source-reason-registry.json; separate primaryFailure and cleanupFailures; no old reason backfill',
 priorFirstHold='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED; descriptor16 is provisional, not post-exit leak proof',
 parentBashFunctionInspection='Separate ROOT actual declare/readonly inspection + statuses, pinned in authority/admission; no child OS observation of non-exported parent function contents.',
 requestedLaunch='Configured BIN + exact root operator inspection trace; sys.orig_argv records APP only, never proof of requested BIN.',
 unresolved='UNKNOWN immutable qualified journal or closed explicitly UNQUALIFIED ROOT_OPERATOR_TOOL_TRACE before outer exit; retained child/custody references, HOLD. No signals/fake124/retry/refresh/reset/delete.',
 failureSchema='failure-schema.json; same single sink in guard and CLI/postclose; never an N fact',
 archiveCopy='Custody.copy_from expected FD metadata/length/hash/mode and actual shared byte/entry budgets before and during chunks; source06 copier never invoked',
 setupControl='Root writes exact helper/status/null-start-FP control after binding; externally supplied SHA is configured once in new readonly variable and verified before parsing. No auth/self/future hash cycle; every current table requires helper numeric absence in addition to immutable2255 base.',
 currentPostcloseClient='Discharged by separately waited actual outer tool result; no recursive observer invented.'))
# Root uses the reviewed installer CLI to derive all maps. No caller binary modes,
# code maps, loader maps or full input map are accepted in this descriptor.
base=dict(a)
for name in ('binaryModes','binaryHashes','codePins','newCodeRecordPins'):base.pop(name,None)
# Expected bindings are ancestry, not current observations; all7 files/modes are
# independently acquired and verified before the first physical mutation.
index=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/resume2-gateway80-failed-resource-code02-negative-failed-index.json').read_bytes())
bindings=index['rootOperatorAuthorizationDefect']['requiredBinaryHashes']
binpath='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13'
apppath='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python'
base['pythonRoles']={role:dict(path=path,sha256=bindings[path]) for role,path in [('launch',binpath),('reported',binpath),('process',apppath),('observedArgument',apppath)]}
base['observationExecutables']={role:dict(path=path,sha256=bindings[path]) for role,path in [('/bin/ps','/bin/ps'),('/usr/sbin/lsof','/usr/sbin/lsof'),('git','/opt/homebrew/Cellar/git/2.43.2/bin/git')]}
outside=ROOT/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/gateway80-fr03-root-install01'
put('root-candidate.template.json',base)
put('install-scope.template.json',dict(role='SOURCE03_INSTALL_ONLY',authorizedBy=None,authorized=False,cleanup=False,nativeInvocations=0,sourceDirectory=str(HERE),destination=str(N),outsideDirectory=str(outside),outsideDirectoryFact=None,oldEDirectory=None,sourceManifestSha256=None,reviewPins=code_records,readsetPolicy='EXACT_SOURCE03_CONTRACT_REVIEWS_AND_SEVEN_CANONICAL_BINARIES',candidate=base))
put('installer-input-shape.json',dict(kind='EXACT_REVIEWED_SOURCE03_INSTALLER_INPUT',scopePath=str(outside/'root-install-scope.json'),scopeMode=0o600,
 rootSupplies=['external raw scope SHA','source03 manifest SHA and three exact source/review pins','new root authorized flags/Node-only unchanged-f9 applicability','separately approved exact oldE/outside directory facts'],
 cliDerives=['eight loader pins from externally pinned source manifest BEFORE helper compilation','six code pins from same consumed source buffers','complete readset from reviewed source contract, fixed review pins and all7 canonical roles','all7 binary modes/hashes/metadata from independent bounded same-buffer no-follow acquisition','N02 dev/ino only after exclusive oldE-FD anchored creation; same validated draft finalization'],
 forbiddenCallerMaps=['binaryHashes','binaryModes','binaryWitnesses','candidate.codePins','candidate.newCodeRecordPins','loaderPins','inputPins'],
 requiredPythonUniqueFiles=2,requiredUtilityFiles=3,requiredOriginalNodeHelmFiles=2,totalUniqueBinaryFiles=7,
 oldERegulars=2263,priorN01Members=7,oldEWithPriorAndNewEntries=2265,namespaceCreationBeforePreflight=False,
 outputNames=['pending-draft.json','install-attempt.json','installation-result.json','installation-failure.json'],outputsOutsideN=True,
 installNotPhaseAuthority=True,noActualInputFactsObserved=True))
print(json.dumps(dict(status='INERT_SOURCE_METADATA_ONLY',installedPayloads=len(code),actualActions=0)))

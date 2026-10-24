"""Generate only inert review metadata/templates in this exact new prep directory."""
from pathlib import Path
import hashlib
import json
HERE=Path(__file__).absolute().parent
assert HERE==Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume2').absolute()
ROOT=next(p for p in HERE.parents if p.name=='ui-studio')
k=json.loads((HERE/'contract.json').read_bytes());N=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/runtime'/k['subject']['label']/k['namespace']
def put(name,value):(HERE/name).write_text(json.dumps(value,indent=2)+'\n')
code={n:hashlib.sha256((HERE/n).read_bytes()).hexdigest() for n in k['installedCode']}
code_records={str(HERE/'manifest.json'):None,str(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway80-failed-red-resource-code02-exact-review/manifest.json'):None,str(ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway80-failed-red-resource-code02-exact-review/manifest.json'):None}
a=dict(kind='INERT_FAILED_RED_RESOURCE_ONLY_ROOT_AUTHORIZATION_TEMPLATE',authorizedBy=None,authorized=False,
 expectedWrapperExit=1,newNativeInvocations=0,sourceWrites=[],cleanup=False,normalRoute='HARD_HOLD',credit=False,
 subject=k['subject'],retainedFailure=k['retainedFailure'],compileObligation='NONE_NODE_ONLY_UNCHANGED_SOURCE',
 distinctFailedEntrypointAuthorized=False,sourceDigest=k['protectedInputs']['sourceDigest'],limits=k['limits'],rootInputPins={},codePins=code,
 externalPins={str(ROOT/p):h for p,h in k['externalSourcePins'].items()},newDirectoryPins={str(N):None},
 pythonRoles={r:dict(path=None,sha256=None) for r in ('launch','reported','process','observedArgument')},
 observationExecutables={r:dict(path=None,sha256=None) for r in ('/bin/ps','/usr/sbin/lsof','git')},
 binaryModes={},binaryHashes={},exactIndependentCodeReviewsQualified=False,newCodeRecordPins=code_records,
 currentFactsObserved=False,actualInstallationAuthorized=False,actualGuardClosingAuthority=False)
put('authorization.template.json',a)
def common(role,mode):return dict(authorizedBy=None,role=role,mode=mode,releaseSha256=None,
 subjectHoldSha256=k['subject']['holdSha256'],oldIndexSha256=k['frozenEvidence']['terminalIndexSha256'],
 retainedFailure=k['retainedFailure'],credit=False,cleanup=False,inputPins={},actualAuthority=False)
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
 newDirectoryMode=0o700,oldDirectEMembers=2263,allowedNewDirectEMembers=[N.name],
 files=[dict(source=n,destination=str(N/n),sha256=h,sourceMode=0o644,installedMode=0o600) for n,h in code.items()],
 sourceManifestSelfExcluded=True,actualRootControlsNotInSourceManifest=True,actualInstallation=False,
 archiveRoots=[str(N/name) for name in k['archiveNames']],archiveChildModes='actual source modes preserved; roots0700',
 noOldMemberWrites=True,sourceWrites=[],nativeInvocations=0,cleanup=False))
put('control-schema.json',dict(kind='FINITE_EXTERNAL_ROOT_CONTROL_AND_OWN_GENERATED_RECORD_CONTRACT',
 integrity='Root SHA argument is checked before interpreting its immutable JSON buffer; complete root-derived preexisting N inputPins required. No self-derived authorization.',
 authority='authorization.template.json',controls={
 'root-negative-status.json':'NEGATIVE_ACTUAL_STATUS','root-guard-admission.json':'FAILED_GUARD_ADMISSION','root-archive-decision.json':'ARCHIVE_FAILED_STATE',
 'root-actual-review-adoption.json':'ACTUAL_ARCHIVE_REVIEW','root-close-permit.json':'FAILED_EXIT_PERMIT','root-wrapper-result.json':'ACTUAL_WRAPPER_RESULT'},
 immutableControlNames=['root-authorization.json','root-negative-status.json','root-guard-admission.json','root-archive-decision.json','root-actual-review-adoption.json','root-close-permit.json','root-wrapper-result.json'],
 immutableOutputs=['negative-denial.json','held-proof.json','archive-attempt.json','archive-receipt.json','final-attempt.json','readiness.json','final-result.json','gate-attempt.json','gate-allow.json','postclose.json'],
 clientPattern='client-PID-SHA256START16.json',utilityPattern='utility-CLIENTPID-SHA256START16-NUMBER.json',
 currentUtilityLimitations='Popen PID/requested argv/canonical binary/wait bound; only the exact census probe gains current snapshot start, not invented utility history.',
 oldUtilities=2245,oldClients=4,oldRecordedPidStartPairs=7,oldStartless=73492,oldNumericUnion=2253,
 parentBashFunctionInspection='Separate ROOT actual declare/readonly inspection + statuses, pinned in authority/admission; no child OS observation of non-exported parent function contents.',
 requestedLaunch='Configured BIN + exact root operator inspection trace; sys.orig_argv records APP only, never proof of requested BIN.',
 unresolved='UNKNOWN immutable qualified journal or closed explicitly UNQUALIFIED ROOT_OPERATOR_TOOL_TRACE before outer exit; retained child/custody references, HOLD. No signals/fake124/retry/refresh/reset/delete.',
 failureSchema='failure-schema.json; same single sink in guard and CLI/postclose; never an N fact',
 archiveCopy='Custody.copy_from expected FD metadata/length/hash/mode and actual shared byte/entry budgets before and during chunks; source06 copier never invoked',
 currentPostcloseClient='Discharged by separately waited actual outer tool result; no recursive observer invented.'))
print(json.dumps(dict(status='INERT_SOURCE_METADATA_ONLY',installedPayloads=len(code),actualActions=0)))

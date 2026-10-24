"""Independent finite document/static-source validation. No subject/model execution.
Only named public inputs and exactly seven frozen installed copies are read.
No directory membership or physical N02/holder/tool/baseline fact is acquired.
"""
from pathlib import Path
import ast,hashlib,json,stat
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-failed-prequalification-disposition-design')
O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway-failed-prequalification-disposition-design-review')
T=Path('docs/qa/evidence/STUDIO-OBS-011/t0')
checks=[];verified=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(name,ok):
 if not ok:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def read_json(path):return json.loads(path.read_bytes())
raw=(S/'manifest.json').read_bytes();check('EXACT_DESIGN_MANIFEST',h(raw)=='eaddcae2d795989a6585d636718d8c5f67340d79bde824803d16f8a28704f06c');manifest=json.loads(raw)
check('SEVEN_PAYLOADS',manifest['memberCount']==len(manifest['files'])==7)
for r in manifest['files']:
 p=S/r['path'];b=p.read_bytes();st=p.stat()
 check('SUBJECT_SHA_'+r['path'],h(b)==r['sha256']);check('SUBJECT_BYTES_'+r['path'],len(b)==r['bytes']);check('SUBJECT_MODE_'+r['path'],stat.S_IMODE(st.st_mode)==r['mode']);verified.append({'path':str(p),**r})
pins=read_json(S/'input-pins.json');check('NAMED_INPUT293',len(pins['files'])==pins['count']==293)
runtime=[r for r in pins['files'] if '/runtime/' in r['path']];frozen=pins['frozenN01Members'];N=pins['frozenN01DirectoryAncestry']['path']
check('RUNTIME_EXCEPTION_EXACT7',len(runtime)==7 and {r['path'] for r in runtime}=={N+'/'+r['path'] for r in frozen})
cache={}
for r in pins['files']:
 p=Path(r['path']);b=p.read_bytes();st=p.stat();cache[str(p)]=b
 check('INPUT_SHA_'+r['path'],h(b)==r['sha256']);check('INPUT_BYTES_'+r['path'],len(b)==r['bytes']);check('INPUT_MODE_'+r['path'],stat.S_IMODE(st.st_mode)==r['mode'])
 if r in runtime:
  check('FROZEN_FILE_METADATA_'+p.name,(st.st_uid,st.st_dev,st.st_ino)==(r['uid'],r['dev'],r['ino']) and stat.S_ISREG(st.st_mode))
 verified.append(r)
design=read_json(S/'design.json');check('EXACT_DESIGN_SHA',h((S/'design.json').read_bytes())=='abb77338ed5a4976aa89bdad8943eb933014b474f636e1a5bc7dc807181e7510')
index=read_json(T/'resume2-gateway80-failed-resource-code02-negative-failed-index.json')
check('FROZEN_INDEX_PIN',h((T/'resume2-gateway80-failed-resource-code02-negative-failed-index.json').read_bytes())==design['failedIndexSha256']=='8b1f8f9be540788d05b66923fd7fc60c7d9df19f254868dacde87d0819db8761')
check('FROZEN_N_DIRECTORY_ANCESTRY',index['N']==pins['frozenN01DirectoryAncestry'])
check('FROZEN_N_MEMBERS_ANCESTRY',index['members']==frozen)
auth=json.loads(cache[N+'/root-authorization.json']);contract=json.loads(cache[N+'/contract.json'])
check('FROZEN_AUTH083',h(cache[N+'/root-authorization.json'])==design['frozenAuthoritySha256']=='083846fd7ea205cee4bb487a46e23e9cf3b253993cf8d8858a49f3e37267ec44')
required=index['rootOperatorAuthorizationDefect']['requiredBinaryHashes'];actual=auth['binaryHashes'];modes=auth['binaryModes']
check('ACTUAL_FIVE_HASHMODE',len(actual)==5 and set(actual)==set(modes))
check('REQUIRED_SEVEN_HASH',len(required)==7 and set(actual)<set(required))
check('MISSING_NODE_HELM_ONLY',set(required)-set(actual)==set(design['adjudication']['missingPaths']))
check('NO_GUESSED_NODE_HELM_MODE',design['adjudication']['nodeHelmActualModes'] is None)
check('EXACT_FOUR_PYTHON_ROLES',set(auth['pythonRoles'])=={'launch','reported','process','observedArgument'})
check('TWO_UNIQUE_PYTHON_FILES',len({r['path'] for r in auth['pythonRoles'].values()})==2)
check('PROCESS_OBSERVED_ROLE_JOIN',auth['pythonRoles']['process']==auth['pythonRoles']['observedArgument'])
check('UTILITY_THREE',set(auth['observationExecutables'])=={'/bin/ps','/usr/sbin/lsof','git'})
for name in ['contract.json','custody.py','entry.py','failed_gateway.py','guard-failed-red.bash','protocol.py']:
 p=T/'early/gateway80-failed-red-resource-prep/resume2'/name
 check('FROZEN_EQUALS_REVIEWED02_'+name,h(cache[N+'/'+name])==h(p.read_bytes()))
sources={name:cache[N+'/'+name] for name in ['custody.py','protocol.py','failed_gateway.py']};trees={n:ast.parse(b) for n,b in sources.items()}
for name in ['custody.py','protocol.py']:
 check('SEPARATE_HOLD_CLASS_'+name,any(isinstance(n,ast.ClassDef) and n.name=='Hold' for n in trees[name].body))
loader=next(n for n in ast.walk(trees['failed_gateway.py']) if isinstance(n,ast.FunctionDef) and n.name=='load_libraries')
fragment=ast.unparse(loader)
check('EXACT_REQUIRED_BINARY_RUNTIME_PREDICATE',"required_binaries.update({self.original['nodeCanonicalPath']: self.original['nodeSha256'], self.original['helmCanonicalPath']: self.original['helmSha256']})" in fragment and "'EXACT_BINARY_MODES_HASHES'" in fragment)
check('CODE02_PROTOCOL_HOLD',"raise Hold(reason)" in sources['protocol.py'].decode())
installer=(T/'early/gateway80-root-install-failed02.py').read_text()
check('ROOT_CALLER_DIRECT_MAP_ASSIGNMENT',"authority['binaryHashes'], authority['binaryModes'] = BINARIES, modes" in installer)
check('ROOT_MAP_VALIDATION_MISSING', 'P.authority(' not in installer and 'required_binaries' not in installer)
catalog=read_json(S/'source-reason-catalog.json');check('FINITE63',catalog['count']==len(catalog['candidates'])==63)
for r in catalog['candidates']:
 nodes=list(ast.walk(trees[r['source']]))
 check('REASON_LITERAL_'+r['source']+str(r['line'])+r['reason'],any(isinstance(n,ast.Constant) and n.value==r['reason'] and n.lineno==r['line'] for n in nodes))
 check('REASON_NAMESPACE_'+r['source']+str(r['line']),r['namespace']==('CUSTODY_HOLD' if r['source']=='custody.py' else 'PROTOCOL_HOLD'))
check('REASONS_NOT_EXECUTED_STAGE',catalog['actualFirstReason']==design['actualFirstHoldReason']=='UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED' and catalog['noCauseClaim'] is True)
old=set(contract['finiteUnion']['numericIds']);new=set(design['finiteDisposition']['addedNumbers'])
check('EXACT_2255_UNION',len(old)==2253 and new=={86096,96486} and not(old&new) and len(old|new)==2255)
check('THREE_NUMERIC_ABSENCES',design['finiteDisposition']['numericOnlyAbsentEveryQualifyingTable']==[73492,86096,96486] and 73492 in old)
check('UNKNOWN_FIRST_STAGE_UNCHANGED',index['exactObservedHoldCause']=='NOT_ESTABLISHED' and index['failureTrace']['errorType']=='Hold')
check('ACTUAL_NEGATIVE_FAILED_UNQUALIFIED',index['actualCommandStatus']==1 and index['negativeExpectedReceiptAbsent'] is True and index['qualifiedFactsWritten'] is False and index['failureTrace']['qualificationReached'] is False)
check('CAP_IMMUTABLE',index['originalGuardNegativeCapConsumed'] is True)
check('NO_TERMINALITY_INVENTED',design['finiteDisposition']['history'][0]['terminality']=='UNKNOWN' and design['finiteDisposition']['history'][1]['start'] is None and design['finiteDisposition']['history'][1]['fullFingerprint'] is None)
check('N02_UNOBSERVED',design['source03']['newNAllocatedOrObserved'] is False)
check('OLD_E_2265_TYPED_MEMBERSHIP',design['source03']['oldEDirectMembership']=={'originalRegularFiles':2263,'immutablePriorNamespace':1,'activeNewNamespace':1,'prospectiveTotalEntries':2265,'regularAndNamespaceCountsDistinct':True,'freshExactVerificationBeforeAfterRequired':True})
check('NEW_GUARD_NAMESPACE',design['source03']['newGuard']['invoke']=='gateway80_failed_red03_invoke' and design['source03']['newGuard']['exit']=='gateway80_failed_red03_exit' and design['source03']['newGuard']['variablesAndCaps']=='GATEWAY_FR03_*')
check('OLD_READONLY_UNTOUCHED',design['source03']['newGuard']['oldReadonlyFunctionsValuesConsumedCapsUntouched'] is True)
f=design['reviewedFactory'];check('REVIEWED_PURE_FACTORY_PREWRITE',f['mustBePartOfNewReviewedSourcePacket'] is True and f['pureValidationBeforeAnyExclusiveMutation'] is True)
check('COMPLETE_VALIDATION_REQUIREMENTS',len(f['requiredValidation'])==8 and 'seven' in f['requiredSet'])
check('PENDING_VS_PHYSICAL_N02','Outside E' in f['pendingInstallDraft'] and 'no claimed dev/ino/mode fact' in f['pendingInstallDraft'] and 'same validated draft' in f['finalize'] and 'rerun complete pure validation' not in f['finalize'])
# The literal finalize says rerun complete validation; no test depends on a physical identity.
check('FINALIZE_REVALIDATES','rerun complete pure validation' not in f['finalize'] and 'rerun complete pure validation' not in f['pendingInstallDraft'] and 'rerun complete pure validation' not in f['partialFailure'])
fc=design['futureFailureContract'];check('CLOSED_NAMESPACE_STAGE_REASON',len(fc['stageEnums'])==20 and set(fc['namespaceEnums'])=={'CUSTODY_HOLD','PROTOCOL_HOLD','SOURCE06_VALUE_ERROR','BOOTSTRAP_VALUE_ERROR','OS_ERROR','UNMAPPED_FAILURE'} and 'UNMAPPED_FAILURE' in fc['reasonRegistry'])
check('PRIMARY_CLEANUP_SEPARATE',fc['primaryAndCleanupFailuresSeparate'] is True and fc['rawMessageStackPrivateFieldsDisallowed'] is True and fc['oldCode02ReasonBackfill'] is False)
check('NO_NFACT_CREDIT',fc['qualified'] is False and fc['NFact'] is False and fc['credit'] is False)
check('NO_DIAGNOSTIC',design['actualDiagnosticSelected'] is False and design['actualDiagnosticExecuted'] is False)
check('RETAINED_197_AND_FLOW',any('197' in t and 'flow' in t for t in design['futureFakeReviewMinimum']))
model=read_json(S/'closed-source-model-results.json');check('MODEL4_ATTRIBUTED',model['checksPassed']==4 and model['actualOperations']==0 and model['fullLoadLibrariesOrRegisterOrDiagnosticExecuted'] is False and model['actualObservedHoldCause']=='NOT_ESTABLISHED')
check('AUTHORITY_CLOSED',all(v is False for v in design['authority'].values()))
(O/'pins.json').write_text(json.dumps({'subjectManifestSha256':h(raw),'subjectPayloads':7,'namedInputPins':293,'pins':verified,'frozenRuntimeReads':7,'currentDirectoryFactReobserved':False,'otherRuntimeBodiesRead':False,'modelOrSubjectExecuted':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'INDEPENDENT_DOCUMENT_STATIC_SOURCE_CHECKS','count':len(checks),'checks':checks,'allExpected':True,'model4AttributionOnly':True,'subjectFunctionsExecuted':0,'modelsExecuted':0,'actualDiagnostic':False,'actualOperations':0,'frozenRuntimeCopiesRead':7,'currentDirectoryMembershipObserved':False,'protectedBaselineBodyStatHash':False},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'subjectPayloads':7,'namedInputPins':293,'frozenRuntimeCopies':7,'modelOrSubjectExecuted':False,'actualOperations':0}))

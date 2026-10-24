"""Pure qualified FAILED-resource policy. No filesystem/process/imported helper."""
import hashlib
import json
import re
SOURCE='f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277'
MODES=('negative','held-proof','archive','final','gate','postclose')
class Hold(Exception):namespace='PROTOCOL_HOLD'
def need(value,reason):
    if value is not True:raise Hold(reason)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def packed(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def pin(value):return type(value)is str and re.fullmatch('[0-9a-f]{64}',value)is not None
def pairs(items):
    out={}
    for key,value in items:need(key not in out,'DUPLICATE_JSON');out[key]=value
    return out
def decode(raw):
    need(type(raw)is bytes and len(raw)<=16777216,'BOUNDED_JSON')
    return json.loads(raw.decode('utf-8','strict'),object_pairs_hook=pairs,parse_constant=lambda x:(_ for _ in ()).throw(Hold('NONFINITE')))
def canonical(path):
    return type(path)is str and path.startswith('/') and '\x00' not in path and '//' not in path and not any(x in ('.','..','') for x in path.split('/')[1:])
PROFILE='FAILED_RESOURCE_TYPED_SELF_TEXT_AND_PHYSICAL_ROLES_V1'
def text_fact(value):
    """Opaque memory only; count UTF8 bytes BEFORE allocating/encoding/hashing."""
    result=dict(kind='SELF_REPORTED_TEXT_DIGEST',status='UNAVAILABLE',encoding='STRICT_UTF8',normalization='NONE',utf8Bytes=None,textSha256=None)
    if type(value)is not str or not value or len(value)>4096:return result
    total=0
    for char in value:
        cp=ord(char)
        if cp==0 or 0xd800<=cp<=0xdfff:return result
        total+=1 if cp<128 else 2 if cp<2048 else 3 if cp<65536 else 4
        if total>4096:return result
    result['utf8Bytes']=total
    try:result['textSha256']=sha(value.encode('utf-8','strict'));result['status']='COMPLETE'
    except BaseException:result['status']='HASH_UNAVAILABLE'
    return result
def safe_self_sample(value):
    """Keep only independently well-typed metadata; never return an unknown raw value."""
    answer={}
    for key in ('reported','origArgv0'):
        row=value.get(key) if type(value)is dict else None
        fact=dict(kind='SELF_REPORTED_TEXT_DIGEST',status='UNAVAILABLE',encoding='STRICT_UTF8',normalization='NONE',utf8Bytes=None,textSha256=None)
        if type(row)is dict and set(row)==set(fact) and row.get('kind')==fact['kind'] and row.get('encoding')=='STRICT_UTF8' and row.get('normalization')=='NONE':
            if type(row.get('utf8Bytes'))is int and 0<row['utf8Bytes']<=4096:fact['utf8Bytes']=row['utf8Bytes']
            if pin(row.get('textSha256')):fact['textSha256']=row['textSha256']
            if row.get('status') in ('COMPLETE','UNAVAILABLE','HASH_UNAVAILABLE'):fact['status']=row['status']
        answer[key]=fact
    answer['origArgv0LiteralAppSatisfied']=type(value)is dict and value.get('origArgv0LiteralAppSatisfied') is True
    return answer
def require_self_sample(sample,k):
    need(type(sample)is dict and set(sample)=={'reported','origArgv0','origArgv0LiteralAppSatisfied'},'SELF_TEXT_SCHEMA')
    for key in ('reported','origArgv0'):
        row=sample[key];expected=k['typedRoleContract']['selfTextConstraints'][key]
        need(type(row)is dict and set(row)=={'kind','status','encoding','normalization','utf8Bytes','textSha256'} and row['kind']=='SELF_REPORTED_TEXT_DIGEST' and row['encoding']=='STRICT_UTF8' and row['normalization']=='NONE','SELF_TEXT_SCHEMA')
        need(row['status']=='COMPLETE' and type(row['utf8Bytes'])is int and row['utf8Bytes']==expected['expectedUtf8Bytes'] and row['textSha256']==expected['expectedTextSha256'],'SELF_TEXT_DIGEST_COUNT_MISMATCH')
    need(sample['origArgv0LiteralAppSatisfied'] is True,'ORIG_ARGV_APP_LITERAL_MISMATCH')
    return sample
def client_shape(who,a,k):
    fields={'kind','authoritySha256','typedRoleContractSha256','ownerDecisionPins','pid','ppid','start','argvHash','requestedLaunch','selfText','physicalProcessFingerprint','origArgv0CanonicalAppLiteralSatisfied','legacyReportedCanonicalPredicateSatisfied','oldAndNewPredicatesEquivalent','parentBinaryFingerprintClaimed','identityComplete'}
    need(type(who)is dict and set(who)==fields and who['kind']=='FAILED_RESOURCE_TYPED_CLIENT_V1','CLIENT_HISTORY_TYPED_IDENTITY')
    need(type(who['pid'])is int and who['pid']>0 and type(who['ppid'])is int and who['ppid']>0 and type(who['start'])is str and 0<len(who['start'])<=128 and pin(who['argvHash']),'CLIENT_HISTORY_TYPED_IDENTITY')
    need(who['typedRoleContractSha256']==a['roleContractSha256'] and who['ownerDecisionPins']=={owner:a['typedOwnerRecordPins'][path] for owner,path in k['typedOwnerPaths'].items()} and pin(who['authoritySha256']),'CLIENT_HISTORY_ROLES')
    need(who['requestedLaunch']==dict(a['physicalPythonRoles']['requestedLaunchBIN'],proofKind='ROOT_PARENT_REQUESTED_LAUNCH_ATTESTATION') and who['legacyReportedCanonicalPredicateSatisfied'] is False and who['oldAndNewPredicatesEquivalent'] is False and who['parentBinaryFingerprintClaimed'] is False and who['identityComplete'] is True,'CLIENT_HISTORY_ROLES')
    need(type(who['selfText'])is dict and set(who['selfText'])=={'reported','origArgv0'},'SELF_TEXT_SCHEMA')
    require_self_sample(dict(who['selfText'],origArgv0LiteralAppSatisfied=who['origArgv0CanonicalAppLiteralSatisfied']),k)
    physical=who['physicalProcessFingerprint']
    need(type(physical)is dict and set(physical)=={'commHash','executableHash','executableFileHash','processRolePath','physicalWitnessSetSha256','psBeforeAfterQualified','twoLsofMappingsQualified'} and all(pin(physical[x]) for x in ('commHash','executableHash','executableFileHash','physicalWitnessSetSha256')) and physical['processRolePath']==a['physicalPythonRoles']['sampledProcessAPP']['path'] and physical['executableFileHash']==a['physicalPythonRoles']['sampledProcessAPP']['sha256'] and physical['psBeforeAfterQualified'] is True and physical['twoLsofMappingsQualified'] is True,'CLIENT_HISTORY_PHYSICAL_FINGERPRINT')
    return who
def typed_authority(a,k):
    need('pythonRoles' not in a and a.get('typedRoleContract')==k['typedRoleContract'] and a.get('physicalPythonRoles')==k['expectedPhysicalPythonRoles'] and a.get('legacyReportedCanonicalPredicateSatisfied') is False,'TYPED_ROLE_CONTRACT_SCOPE')
    need(a['typedRoleContract'].get('kind')==PROFILE and a['typedRoleContract'].get('legacyReportedCanonicalPredicateSatisfied') is False and a['typedRoleContract'].get('oldAndNewPredicatesEquivalent') is False and a.get('roleContractSha256')==sha(packed(k['typedRoleContract'])),'TYPED_ROLE_CONTRACT_SCOPE')
    need(type(a.get('typedOwnerRecordPins'))is dict and set(a['typedOwnerRecordPins'])==set(k['typedOwnerPaths'].values()) and all(pin(h) for h in a['typedOwnerRecordPins'].values()),'TYPED_OWNER_RULINGS_REQUIRED')
def typed_binding(a,k):
    typed_authority(a,k)
    return dict(kind=PROFILE,legacyReportedCanonicalPredicateSatisfied=False,oldAndNewPredicatesEquivalent=False,roleContractSha256=a['roleContractSha256'],typedOwnerRecordPins=a['typedOwnerRecordPins'],newCodeRecordPins=a['newCodeRecordPins'])
def owner_expected(a,k,who):
    sources=[p for p in a['newCodeRecordPins'] if '/early/' in p]
    architecture=[p for p in a['newCodeRecordPins'] if '/resume-architecture/' in p]
    qa=[p for p in a['newCodeRecordPins'] if '/qa/gateway80-failed-red-resource-code08-exact-review/' in p]
    need(len(sources)==len(architecture)==len(qa)==1,'TYPED_OWNER_CODE_REVIEW_BINDING')
    return dict(kind='UNIT_SPECIFIC_TYPED_ROLE_TECHNICAL_OWNER_DECISION',owner=who,decision='ACCEPT_NARROW_RESOURCE_ONLY_PROOF_SUBJECT_CORRECTION',authorized=True,unit=k['subject']['label'],pty=k['subject']['pty'],wrapperPid=k['subject']['wrapper']['pid'],shellPid=k['subject']['shell']['pid'],proposal=PROFILE,designManifestSha256=k['typedRoleContract']['designManifestSha256'],failedResourceCode08ManifestSha256=a['newCodeRecordPins'][sources[0]],failedResourceCode08AriaReviewManifestSha256=a['newCodeRecordPins'][architecture[0]],failedResourceCode08QuinnReviewManifestSha256=a['newCodeRecordPins'][qa[0]],typedRoleContractSha256=a['roleContractSha256'],legacyReportedCanonicalPredicateSatisfied=False,oldAndNewPredicatesEquivalent=False,acceptNarrowResourceOnlyProofSubjectCorrection=True,physicalSevenAndAllActualIdentitySecurityObligationsPreserved=True,unknownUnpreservedInvariant=None,source09Borrowed=False,C8Waiver=False,actualRuntimeAuthorized=False,nativeCompilerSourceWindowLeaseCleanupCreditAuthority=False,freshnessProofSubject='ORIGINAL_PERMIT_AT_FINAL_GUARDED_ACCEPTANCE_AFTER_SELECTED_CLEANUP',parentSchedulingIntervalProved=False,initialAuthorizationCompleteActualFactsRequired=True,actorInputBound=8192,initialActualFactBound=64)
def owner_records(a,k,records):
    typed_authority(a,k)
    need(type(records)is dict and set(records)==set(k['typedOwnerPaths'].values()),'TYPED_OWNER_RULINGS_REQUIRED')
    for who,path in k['typedOwnerPaths'].items():
        raw=records[path]
        need(type(raw)is bytes and sha(raw)==a['typedOwnerRecordPins'][path],'TYPED_OWNER_RAW_PIN')
        actual=decode(raw);expected=owner_expected(a,k,who)
        exact_owner(actual,expected)
        need(actual==expected,'TYPED_OWNER_EXACT_DECISION')
    return True
def exact_owner(actual,expected):
    need(type(actual)is dict and set(actual)==set(expected),'TYPED_OWNER_EXACT_SCALAR_SCHEMA')
    for name,value in expected.items():
        need(type(actual[name])is type(value),'TYPED_OWNER_EXACT_SCALAR_SCHEMA')
    return actual

def source_subject(a):
    paths=[path for path in a['newCodeRecordPins'] if '/early/gateway80-failed-red-resource-prep/resume8/manifest.json' in path]
    need(len(paths)==1,'CONTROL_AUTHOR_SOURCE_BINDING');return a['newCodeRecordPins'][paths[0]]

def pending_author(pid,ppid,sample,a,k,path,role,producer_name,producer_sha):
    need(type(pid)is int and 0<pid<=2147483647 and type(ppid)is int and 0<ppid<=2147483647,'CONTROL_AUTHOR_ACTUAL_IDS')
    require_self_sample(sample,k)
    need(canonical(path) and producer_name in ('install-cli.py','control-author-cli.py') and pin(producer_sha),'CONTROL_AUTHOR_SOURCE_BINDING')
    row=dict(pid=pid,ppid=ppid,kind='DESIGNATED_PENDING_ACTUAL_SOURCE08_CONTROL_AUTHOR',start=None,argvHash=None,fullFingerprint=None,
        completionKind='ACTUAL_EXTERNAL_TOOL_EXIT',actualStatus=None,directWaitClaimed=False,qualified=False,
        requiredDisposition='NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS',evidence=path+'#DESIGNATED_PENDING_ACTUAL_SOURCE08_CONTROL_AUTHOR')
    designation=dict(kind='SOURCE08_DESIGNATED_PENDING_ACTUAL_CONTROL_AUTHOR',pid=pid,ppid=ppid,controlPath=path,controlRole=role,
        sourceManifestSha256=source_subject(a),roleContractSha256=a['roleContractSha256'],producerEntryName=producer_name,producerEntrySha256=producer_sha,
        actualStatus=None,completionKind='ACTUAL_EXTERNAL_TOOL_EXIT',selfEvidence=safe_self_sample(sample))
    return designation,row

def designated_author(value,a,k,path,role,producer_pins=None):
    d=value.get('designatedControlAuthor')
    fields={'kind','pid','ppid','controlPath','controlRole','sourceManifestSha256','roleContractSha256','producerEntryName','producerEntrySha256','actualStatus','completionKind','selfEvidence'}
    need(type(d)is dict and set(d)==fields and d['kind']=='SOURCE08_DESIGNATED_PENDING_ACTUAL_CONTROL_AUTHOR','CONTROL_AUTHOR_REQUIRED')
    need(type(d['pid'])is int and 0<d['pid']<=2147483647 and type(d['ppid'])is int and 0<d['ppid']<=2147483647
        and d['actualStatus'] is None and d['completionKind']=='ACTUAL_EXTERNAL_TOOL_EXIT','CONTROL_AUTHOR_MUST_BE_PENDING')
    need(d['controlPath']==path and d['controlRole']==role and d['sourceManifestSha256']==source_subject(a)
        and d['roleContractSha256']==a['roleContractSha256'] and d['producerEntryName'] in ('install-cli.py','control-author-cli.py')
        and pin(d['producerEntrySha256']),'CONTROL_AUTHOR_SOURCE_BINDING')
    if producer_pins is not None:need(producer_pins.get(d['producerEntryName'])==d['producerEntrySha256'],'CONTROL_AUTHOR_SOURCE_BINDING')
    require_self_sample(d['selfEvidence'],k)
    need(value.get('typedActorRosterComplete') is True and type(value.get('typedPriorActors'))is list
        and type(value.get('typedActorEvidencePins'))is dict,'TYPED_ACTOR_ROSTER_COMPLETE')
    rows=actor_union(k,value['typedPriorActors'],allow_pending=True)
    matches=[row for row in value['typedPriorActors'] if type(row)is dict and row.get('pid')==d['pid']]
    need(len(matches)==1,'CONTROL_AUTHOR_REQUIRED')
    expected=dict(pid=d['pid'],ppid=d['ppid'],kind='DESIGNATED_PENDING_ACTUAL_SOURCE08_CONTROL_AUTHOR',start=None,argvHash=None,fullFingerprint=None,
        completionKind='ACTUAL_EXTERNAL_TOOL_EXIT',actualStatus=None,directWaitClaimed=False,qualified=False,
        requiredDisposition='NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS',evidence=path+'#DESIGNATED_PENDING_ACTUAL_SOURCE08_CONTROL_AUTHOR')
    need(matches[0]==expected and matches[0]['actualStatus'] is None,'CONTROL_AUTHOR_MUST_BE_PENDING')
    need({row['pid'] for row in k['knownPostBaseActors']}<={row['pid'] for row in value['typedPriorActors']},'TYPED_ACTOR_KNOWN_OMITTED')
    return rows

def actor_union(k,rows,allow_pending=False):
    need(type(rows)in(list,tuple) and len(rows)<=8192,'TYPED_ACTOR_ROSTER_SCHEMA')
    known=k['knownPostBaseActors'];result={}
    fields={'pid','ppid','kind','start','argvHash','fullFingerprint','completionKind','actualStatus','directWaitClaimed','qualified','requiredDisposition','evidence'}
    for row in [*known,*rows]:
        need(type(row)is dict and set(row)==fields and type(row['pid'])is int and 0<row['pid']<=2147483647 and (row['ppid'] is None or type(row['ppid'])is int and 0<row['ppid']<=2147483647),'TYPED_ACTOR_ROSTER_SCHEMA')
        need(row['start'] is None or type(row['start'])is str and 0<len(row['start'])<=128,'TYPED_ACTOR_ROSTER_SCHEMA')
        need(row['argvHash'] is None or pin(row['argvHash']),'TYPED_ACTOR_ROSTER_SCHEMA')
        need(row['fullFingerprint'] is None and row['qualified'] is False and row['requiredDisposition']=='NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS','TYPED_ACTOR_ROSTER_SCHEMA')
        need(type(row['kind'])is str and 0<len(row['kind'])<=128 and type(row['evidence'])is str and 0<len(row['evidence'])<=1024,'TYPED_ACTOR_ROSTER_SCHEMA')
        status=row['actualStatus'];pending=allow_pending is True and status is None and row['completionKind'] in ('SEPARATE_FOREGROUND_STATUS','ACTUAL_EXTERNAL_TOOL_EXIT')
        need(row['completionKind'] in ('SEPARATE_FOREGROUND_STATUS','ACTUAL_EXTERNAL_TOOL_EXIT','OBSERVED_DIRECT_UTILITY_WAIT') and (pending or type(status)is int and -2147483648<=status<=2147483647) and row['directWaitClaimed'] is (row['completionKind']=='OBSERVED_DIRECT_UTILITY_WAIT'),'TYPED_ACTOR_COMPLETION_UNKNOWN')
        need(row['pid'] not in result or result[row['pid']]==row,'TYPED_ACTOR_ROSTER_CONFLICT')
        result[row['pid']]=row
    return [result[p] for p in sorted(result)]
def initial_actor_facts(raw,expected_sha,a,k,scope_sha,installer_pid):
    need(type(raw)is bytes and len(raw)<=65536 and pin(expected_sha) and sha(raw)==expected_sha,'INITIAL_FACTS_RAW_PIN')
    value=decode(raw)
    fields={'kind','unit','sourceManifestSha256','installScopeSha256','authorizedBy','authorized','completeActualFacts','actors'}
    need(type(value)is dict and set(value)==fields and value['kind']=='SOURCE08_INITIAL_ACTUAL_FACTS'
        and value['unit']==k['subject']['label'] and value['sourceManifestSha256']==source_subject(a)
        and pin(scope_sha) and value['installScopeSha256']==scope_sha and value['authorizedBy']=='root'
        and value['authorized'] is True and value['completeActualFacts'] is True,'INITIAL_FACTS_SCOPE')
    need(packed(value)==raw,'INITIAL_FACTS_CANONICAL_BUFFER')
    facts=value['actors'];need(type(facts)is list and 1<=len(facts)<=64,'INITIAL_FACTS_BOUND')
    roles={'EXTERNAL_ROOT_CONTROL_AUTHOR','EXTERNAL_ROOT_APPROVED_SOURCE_READER','EXTERNAL_ROOT_APPROVED_HELPER','EXTERNAL_ROOT_OWNER_RECORD_AUTHOR','EXTERNAL_ROOT_INSTALL_SCOPE_AUTHOR','EXTERNAL_ROOT_INPUT_AUTHOR'}
    rows=[]
    for item in facts:
        need(type(item)is dict and set(item)=={'role','pid','ppid','actualStatus','toolCallId','separateStatusCaptured','originalTrace'},'INITIAL_FACT_SCHEMA')
        need(item['role'] in roles and type(item['pid'])is int and 0<item['pid']<=2147483647
            and type(item['ppid'])is int and 0<item['ppid']<=2147483647 and type(item['actualStatus'])is int
            and -2147483648<=item['actualStatus']<=2147483647 and item['separateStatusCaptured'] is True
            and type(item['toolCallId'])is str and re.fullmatch('[A-Za-z0-9_-]{1,128}',item['toolCallId'])is not None,'INITIAL_FACT_SCHEMA')
        need(item['pid']!=installer_pid,'INITIAL_FACT_SELF_PRECOMPLETION')
        trace=item['originalTrace']
        expected=dict(kind='ORIGINAL_SEPARATELY_CAPTURED_TOOL_TRACE',toolCallId=item['toolCallId'],pid=item['pid'],ppid=item['ppid'],actualStatus=item['actualStatus'],separateStatusCaptured=True,statusMeaning='ACTUAL_EXTERNAL_TOOL_EXIT_NOT_DIRECT_WAIT',unit=value['unit'],sourceManifestSha256=value['sourceManifestSha256'],installScopeSha256=scope_sha)
        need(type(trace)is dict and set(trace)==set(expected) and all(type(trace[name])is type(want) for name,want in expected.items()) and trace==expected,'INITIAL_FACT_TRACE_BINDING')
        row=dict(pid=item['pid'],ppid=item['ppid'],kind=item['role'],start=None,argvHash=None,fullFingerprint=None,completionKind='ACTUAL_EXTERNAL_TOOL_EXIT',actualStatus=item['actualStatus'],directWaitClaimed=False,qualified=False,requiredDisposition='NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS',evidence=k['initialActorCarrierPath']+'#SOURCE08_INITIAL_ACTUAL_FACTS:'+item['toolCallId'])
        rows=actor_union(k,[*rows,row],allow_pending=False)
    return value,rows

def validate_initial_actor_facts(a,k):
    buffer=a.get('initialActualFactsBuffer');expected=a.get('initialActualFactsSha256');scope=a.get('initialInstallScopeSha256')
    need(type(buffer)is str and len(buffer)<=65536,'INITIAL_FACTS_RAW_PIN')
    need(all(32<=ord(ch)<=126 for ch in buffer),'INITIAL_FACTS_CANONICAL_BUFFER')
    designation=a.get('designatedControlAuthor');need(type(designation)is dict and type(designation.get('pid'))is int,'CONTROL_AUTHOR_REQUIRED')
    value,derived=initial_actor_facts(buffer.encode('ascii','strict'),expected,a,k,scope,designation['pid'])
    need(a.get('typedActorRosterComplete') is True and type(a.get('typedPriorActors'))is list,'TYPED_ACTOR_ROSTER_COMPLETE')
    actual=actor_union(k,a['typedPriorActors'],allow_pending=True);by_pid={row['pid']:row for row in actual}
    need(all(by_pid.get(row['pid'])==row for row in derived),'INITIAL_FACT_DERIVED_ROSTER')
    return derived

def completion_attestation(raw,expected_sha,control_sha,k):
    need(type(raw)is bytes and len(raw)<=65536 and pin(expected_sha) and sha(raw)==expected_sha,'ROOT_COMPLETION_BUFFER_SHA')
    value=decode(raw)
    need(type(value)is dict and set(value)=={'kind','unit','controlSha256','roleContractSha256','readonlyBuffer','separatelyCaptured','actors'} and value['kind']=='ROOT_OPERATOR_ATTESTATION' and value['unit']==k['subject']['label'] and value['controlSha256']==control_sha and value['roleContractSha256']==sha(packed(k['typedRoleContract'])) and value['readonlyBuffer'] is True and value['separatelyCaptured'] is True,'ROOT_COMPLETION_SOURCE_BINDING')
    need(type(value['actors'])is list and len(value['actors'])<=64,'ROOT_COMPLETION_ACTOR_BOUND')
    seen=set()
    for row in value['actors']:
        need(type(row)is dict and set(row)=={'pid','ppid','completionKind','actualStatus','toolEvidence'} and type(row['pid'])is int and row['pid']>0 and row['pid'] not in seen and type(row['ppid'])is int and row['ppid']>0 and row['completionKind'] in ('ACTUAL_EXTERNAL_TOOL_EXIT','SEPARATE_FOREGROUND_STATUS') and type(row['actualStatus'])is int and row['actualStatus']==0,'ROOT_COMPLETION_ACTOR_SCHEMA')
        need(type(row['toolEvidence'])is list and 1<=len(row['toolEvidence'])<=16 and all(type(x)is dict and set(x)=={'toolCallId','separateStatusCaptured','actualStatus'} and type(x['toolCallId'])is str and re.fullmatch('[A-Za-z0-9_-]{1,128}',x['toolCallId']) is not None and x['separateStatusCaptured'] is True and type(x['actualStatus'])is int and x['actualStatus']==row['actualStatus'] for x in row['toolEvidence']),'ROOT_COMPLETION_ACTUAL_TOOL_EVIDENCE')
        seen.add(row['pid'])
    return value
def resolve_actor_completions(k,rows,attestation):
    union=actor_union(k,rows,allow_pending=True)
    pending={r['pid']:r for r in union if r['actualStatus'] is None}
    observed={r['pid']:r for r in attestation['actors']}
    need(set(observed)==set(pending),'ROOT_COMPLETION_EXACT_PENDING_SET')
    resolved=[]
    for row in union:
        if row['pid'] in pending:
            actual=observed[row['pid']]
            need(actual['ppid']==row['ppid'] and actual['completionKind']==row['completionKind'] and row['directWaitClaimed'] is False,'ROOT_COMPLETION_AUTHOR_CONFLICT')
            row=dict(row,actualStatus=actual['actualStatus'])
        resolved.append(row)
    return actor_union(k,resolved)
def prior_index_bindings(k,raws):
    need(type(raws)is dict and set(raws)==set(k['priorIndexPins']),'PRIOR_INDEX_EXACT_BUFFERS')
    for path,expected in k['priorIndexPins'].items():
        raw=raws[path];need(type(raw)is bytes and sha(raw)==expected,'PRIOR_INDEX_RAW_PIN')
        index=decode(raw);directory=index.get('N')
        if directory is None:directory=dict(index['directory'],path=index['namespace'])
        matches=[p for p in k['priorNamespaces'] if p['directory']==directory]
        need(len(matches)==1 and type(index.get('members'))is list,'PRIOR_INDEX_DIRECTORY_BINDING')
        prior=matches[0];listed={r['path']:r for r in index['members']}
        need(len(listed)==len(index['members'])==len(prior['members']) and set(listed)=={r['path'] for r in prior['members']},'PRIOR_INDEX_EXACT_MEMBERS')
        for row in prior['members']:
            need(all(listed[row['path']].get(key)==value for key,value in row.items()),'PRIOR_INDEX_MEMBER_BINDING')
    return True
def binary_requirements(a,k):
    roles=a.get('physicalPythonRoles');tools=a.get('observationExecutables')
    need(type(roles)is dict and set(roles)=={'requestedLaunchBIN','sampledProcessAPP','origArgv0CanonicalAPP'} and roles['sampledProcessAPP']==roles['origArgv0CanonicalAPP'],'FACTORY_TYPED_PHYSICAL_PYTHON_ROLES')
    need(type(tools)is dict and set(tools)=={'/bin/ps','/usr/sbin/lsof','git'},'FACTORY_THREE_UTILITY_ROLES')
    need(roles==k['expectedPhysicalPythonRoles'] and tools==k['expectedObservationExecutables'],'FACTORY_EXACT_CANONICAL_ROLE_BINDINGS')
    required={}
    for item in [*roles.values(),*tools.values(),*k['binaryAncestors'].values()]:
        need(type(item)is dict and set(item)=={'path','sha256'} and canonical(item['path']) and pin(item['sha256']),'FACTORY_CANONICAL_ROLE')
        need(item['path'] not in required or required[item['path']]==item['sha256'],'FACTORY_ROLE_CONFLICT')
        required[item['path']]=item['sha256']
    need(len({v['path'] for v in roles.values()})==2 and len(required)==7,'FACTORY_EXACT_SEVEN_UNIQUE')
    return required
def external_input_specs(k):
    hashes=k.get('externalSourcePins');modes=k.get('externalInputModes')
    need(type(hashes)is dict and type(modes)is dict and len(hashes)==29 and set(modes)==set(hashes),'EXTERNAL_INPUT_MODE_REGISTRY')
    joined={}
    for path,h in hashes.items():
        need(type(path)is str and not path.startswith('/') and canonical('/'+path) and pin(h),'EXTERNAL_INPUT_MODE_REGISTRY')
        mode=modes[path]
        need(type(mode)is int and mode in(0o600,0o644),'EXTERNAL_INPUT_MODE_REGISTRY')
        joined[path]=(h,mode)
    return joined

def authority_shape(a,contract):
    need(type(a)is dict and set(a)<=set(contract['authorityAllowedFields']),'AUTHORITY_UNKNOWN_FIELD')
    declared=external_input_specs(contract)
    need(a.get('externalPins')=={'/Users/brunobuger/orca/workspaces/put-checks/ui-studio/'+path:spec[0] for path,spec in declared.items()},'EXACT_EXTERNAL_SOURCE_PIN_MAP')
    typed_authority(a,contract)
    need(a.get('freshnessProofSubject')==contract['freshnessProofSubject'] and a.get('parentSchedulingIntervalProved') is False,'GATE_PROOF_SUBJECT')
    validate_initial_actor_facts(a,contract)
    need(a.get('authorizedBy')=='root' and a.get('authorized') is True,'ROOT_AUTHORITY')
    need(type(a.get('expectedWrapperExit'))is int and a['expectedWrapperExit']==1 and type(a.get('newNativeInvocations'))is int and a['newNativeInvocations']==0,'FAILED_ONLY')
    need(a.get('sourceWrites')==[] and a.get('cleanup') is False and a.get('normalRoute')=='HARD_HOLD' and a.get('credit') is False,'NO_SOURCE_NATIVE_CREDIT')
    need(packed(a.get('subject'))==packed(contract['subject']) and packed(a.get('retainedFailure'))==packed(contract['retainedFailure']),'EXACT_FAILED_SUBJECT')
    need(a.get('compileObligation')=='NONE_NODE_ONLY_UNCHANGED_SOURCE' and a.get('distinctFailedEntrypointAuthorized') is True,'NEW_ROOT_EXCEPTION')
    need(a.get('sourceDigest')==SOURCE and packed(a.get('limits'))==packed(contract['limits']),'SOURCE_LIMITS')
    need(type(a.get('rootInputPins'))is dict and all(type(k)is str and pin(v) for k,v in a['rootInputPins'].items()),'ROOT_INPUT_PINS')
    need(type(a.get('codePins'))is dict and set(a['codePins'])==set(contract['installedCode']) and all(pin(v) for v in a['codePins'].values()),'CODE_PINS')
    return a
def control_shape(value,k):
    need(type(value)is dict and type(value.get('role'))is str and value['role'] in k['controlAllowedFields'] and set(value)<=set(k['controlAllowedFields'][value['role']]),'CONTROL_UNKNOWN_FIELD')
    return value

def authority(a,contract):
    authority_shape(a,contract)
    required=binary_requirements(a,contract)
    need(type(a.get('binaryHashes'))is dict and a['binaryHashes']==required and type(a.get('binaryModes'))is dict and set(a['binaryModes'])==set(required) and all(type(v)is int and 0<=v<=0o7777 and bool(v&0o111) for v in a['binaryModes'].values()),'EXACT_BINARY_MODES_HASHES')
    return a

def finite_join(rows,contract,clients,current,controllers,probe,helpers=(),actors=()):
    old=contract['finiteUnion'];live=[]
    need(type(helpers)in(list,tuple) and len(helpers)<=64 and all(type(r)is dict and type(r.get('pid'))is int and r['pid']>0 for r in helpers),'SETUP_HELPER_JOIN_TYPES')
    helper_numbers={r['pid'] for r in helpers};need(not helper_numbers&set(rows),'SETUP_HELPER_NUMERIC_PRESENT_HOLD')
    actor_numbers={r['pid'] for r in actor_union(contract,actors)}
    need(not actor_numbers&set(rows),'KNOWN_ACTOR_NUMERIC_PRESENT_HOLD')
    for who in old['historicalPidStartsRequiringAbsentOrReused']:
        if rows.get(who['pid'],{}).get('start')==who['start']:live.append(who)
    need(not live,'HISTORICAL_SAME_START_LIVE')
    need(not set(old['numericOnlyAbsent'])&set(rows),'STARTLESS_NUMERIC_PRESENT_HOLD')
    prior=[c for c in clients if c!=current and rows.get(c['pid'],{}).get('start')==c['start']]
    need(not prior,'PRIOR_CLIENT_LIVE')
    roots={current['pid']}|set(controllers)
    descendants=set(roots)
    while True:
        more=descendants|{pid for pid,row in rows.items() if row['ppid'] in descendants}
        if more==descendants:break
        descendants=more
    need(probe['terminal'] is True and probe['status']==0 and type(probe['status'])is int and rows.get(probe['pid'],{}).get('start')==probe['observedStart'],'WAITED_CENSUS_PROBE')
    need(not descendants-roots-{probe['pid']},'UNACCOUNTED_DESCENDANTS')
    need(not [r for r in rows.values() if r.get('gatewayMarkerCandidate') is True and r['pid'] not in roots|{probe['pid']}],'CURRENT_GATEWAY_MARKER')
    return dict(sevenHistoricalPairsAbsentOrReused=True,startlessNumericAbsent=True,oldUtilitiesHaveNoInventedStart=True,
        priorClientsAbsentOrReused=True,currentCensusProbe=dict(pid=probe['pid'],start=probe['observedStart'],commandSha256=sha(' '.join(probe['command']).encode()),executableSha256=probe['executableSha256'],waitedExit=0),unexpectedDescendants=[],finiteNumericUnion=old['numericCountExcludingControllers'],globalQuiet=False,historicalRepair=False,setupHelperNumbersRequiredAbsent=sorted(helper_numbers),typedActorNumbersRequiredAbsent=sorted(actor_numbers),effectiveFiniteNumericCount=len(set(old['numericIds'])|helper_numbers|actor_numbers))

def equivalent(rows):
    return [{k:v for k,v in r.items() if k not in ('dev','ino','mtimeNs','ctimeNs')} for r in rows]
def freshness(now,readiness,permit):
    need(type(now)in(int,float) and type(readiness)in(int,float) and type(permit)in(int,float),'CLOCK_TYPE')
    need(0<=now-readiness<=60 and readiness<=permit<=now and now-permit<=60,'FRESHNESS_OR_CLOCK_REVERSE')


class GateQualification:
    """One opaque original-permit continuation, held by the existing outer sink.

    Accepted proof ends at final guarded acceptance. Parent scheduling is unproved;
    separately captured wrapper/postclose/QA remain required. No refresh/domain swap.
    """
    def __init__(self,unit,readiness,issued,before):
        self.unit=unit;self.sink=unit.failure_sink;self.finalizer=self.sink.finalizer_token
        self.readiness=readiness;self.issued=issued;self.last=before;self.consumed=False;self.delivery=None
        self.pins=(unit.auth_sha,unit.control_sha,unit.pins[str(N_for(unit)/'readiness.json')])
        self.proofSubject='ORIGINAL_PERMIT_AT_FINAL_GUARDED_ACCEPTANCE_AFTER_SELECTED_CLEANUP'
        freshness(before,readiness,issued)
    def checkpoint(self):
        now=self.unit.s.now();need(type(now)in(int,float) and now>=self.last,'NONREVERSING_CLOCK')
        freshness(now,self.readiness,self.issued);self.last=now;return now
    def prepare_delivery(self):
        need(self.delivery is None and self.consumed is False,'GATE_QUALIFICATION_ONCE')
        # All selected fallible serialization/status preparation precedes acceptance.
        self.delivery=packed(dict(status=0,expectedWrapperExit=1,proofSubject=self.proofSubject,
            parentSchedulingIntervalProved=False,originalAuthoritySha256=self.pins[0],originalPermitSha256=self.pins[1],originalReadinessSha256=self.pins[2]))
        need(type(self.delivery)is bytes and len(self.delivery)<=2048,'GATE_DELIVERY_PREPARATION')
    def accept_after_cleanup(self,sink,token):
        need(self.consumed is False,'GATE_QUALIFICATION_ONCE');self.consumed=True
        need(sink is self.sink and token is self.finalizer and sink.finalizer_label=='GUARD'
            and self.delivery is not None and sink.primary_failure is None and not sink.cleanup_failures
            and not sink.bootstrap_fds and not self.unit.pending,'GATE_OUTER_GUARD_REQUIRED')
        need(all(not getattr(c,'chain',[]) and not getattr(c,'leaves',[]) for c in sink.resources),'GATE_SELECTED_CLEANUP_COMPLETE')
        need(self.pins==(self.unit.auth_sha,self.unit.control_sha,self.unit.pins[str(N_for(self.unit)/'readiness.json')]),'GATE_ORIGINAL_PINS')
        self.checkpoint()
        # Only pure assignments/literal status propagation follow. No selected I/O,
        # observer, fresh helper, permit substitution or cleanup is scheduled here.
        return 0

def N_for(unit):return unit.s.path(unit.k['priorNamespaces'][0]['directory']['path']).parent/unit.k['namespace']

# BEGIN SINGLE OUTER FAILURE SINK (same exact definition embedded in guard)
STAGES=('ENTRY_BUFFER', 'AUTHORITY_BUFFER', 'AUTHORITY_SHAPE', 'N04_CUSTODY', 'PRIOR_N01_CUSTODY', 'OLD_E_MEMBERSHIP', 'N04_MEMBERSHIP', 'NEW_REVIEW_BUFFERS', 'SOURCE06_LEAF', 'SOURCE06_PACKAGE', 'EXTERNAL_SOURCE_BUFFERS', 'LIBRARY_DEFINITIONS', 'OLD_RELEASE_METADATA', 'DIRECTORY_CUSTODY', 'CORE_DEFINITIONS', 'REQUIRED_BINARY_MAP', 'UTILITY_PRELAUNCH', 'CLIENT_HOLDER_QUALIFICATION', 'CLOSE_ACCOUNTING', 'UNMAPPED_FAILURE', 'N02_CUSTODY', 'N02_MEMBERSHIP', 'SELF_TEXT_VALIDATION', 'TYPED_OWNER_RULINGS', 'PRIOR_N02_CUSTODY', 'CONTROL_AUTHOR', 'FINAL_GUARDED_ACCEPTANCE', 'CONTROL_AUTHOR_WRITE', 'STATE_PUBLICATION', 'OPERATOR_COMPLETION')
REASON_REGISTRY={'CUSTODY_HOLD': ['ARCHIVE_FILE_CAP_TYPE', 'ARCHIVE_TOTAL_BYTE_CAP', 'COPY_BYTE_BUDGET', 'COPY_CLOSE_UNCONFIRMED', 'COPY_EXPECTED_BYTES', 'COPY_EXPECTED_METADATA', 'COPY_OUTPUT_CHANGED', 'COPY_READ_PARTIAL', 'COPY_SOURCE_CHANGED', 'COPY_SOURCE_TYPE_OWNER', 'CUSTODY_CLOSE_UNCONFIRMED', 'CUSTODY_DIRECTORY_CHANGED', 'CUSTODY_MEMBERS', 'CUSTODY_OWNER_MODE', 'CUSTODY_PATH', 'EXCLUSIVE_OUTPUT', 'EXCLUSIVE_OUTPUT_CUSTODY', 'EXCLUSIVE_OUTPUT_INODE', 'FILE_IDENTITY_CHANGED', 'FILE_OWNER_MODE_CAP', 'LINK_CHANGED', 'LINK_ENTRY', 'LINK_ENTRY_TYPE', 'MEMBER', 'MKDIR_CREATION_MARKER', 'MKDIR_NAME', 'OUTPUT_IDENTITY_CHANGED', 'READ_CAP', 'READ_EXPECTED_METADATA', 'READ_PARTIAL', 'WRITE_BYTES', 'WRITE_PARTIAL'], 'PROTOCOL_HOLD': ['ACTUAL_ADMISSION_STATUSES', 'ACTUAL_ARCHIVE_QA_INSPECTED', 'ACTUAL_ARCHIVE_RECEIPT_PIN', 'ACTUAL_GATE_WRAPPER_CHAIN', 'ACTUAL_WRAPPER_ONE', 'ADMISSION_HASH_CHAIN', 'ADMISSION_INSPECTIONS', 'ADMITTED_HELD_PROOF', 'ANCHORED_CURRENT_PARENT', 'ARCHIVE_COPY_EQUALITY', 'ARCHIVE_ENTRY_CAP', 'ARCHIVE_FILE_CAP_TYPE', 'ARCHIVE_ROOT_TYPE_OWNER', 'ARCHIVE_TOTAL_BYTE_CAP', 'AUTHORITY_UNKNOWN_FIELD', 'AUTHOR_ACTUAL_HELPER_FACTS', 'AUTHOR_AUTHORITY_RAW_PIN', 'AUTHOR_EXACT_ROOT_FACTS', 'AUTHOR_INSTALLED_SAME_BUFFER', 'AUTHOR_ONCE_NO_REWRITE', 'AUTHOR_PRIOR_CLIENT_ACTUAL_STATUS', 'AUTHOR_REQUEST_SCHEMA', 'AUTHOR_REQUEST_SCOPE', 'AUTHOR_SOURCE_GRAPH', 'AUTHOR_STATE_BYTE_CAP', 'AUTHOR_STATE_ENTRY_CAP', 'AUTHOR_STATE_IDENTITY', 'AUTHOR_STATE_MEMBER', 'AUTHOR_STATE_MEMBERSHIP', 'AUTHOR_STATE_OUTER_STATUS', 'AUTHOR_STATE_RAW_PIN', 'AUTHOR_STATE_SCOPE', 'BIN_APP_ROLE_MISMATCH', 'BOUNDED_JSON', 'CANONICAL_EXTERNAL_PIN', 'CENSUS_COMPLETE', 'CENSUS_DUPLICATE', 'CLEANUP_FAILURE_BOUND', 'CLIENT_HISTORY_PHYSICAL_FINGERPRINT', 'CLIENT_HISTORY_ROLES', 'CLIENT_HISTORY_TYPED_IDENTITY', 'CLIENT_IDENTITY_CHANGED', 'CLIENT_IMAGE_MAP', 'CLIENT_JOURNAL', 'CLIENT_NAME', 'CLIENT_PID_START_ARGV_PROCESS', 'CLOCK_TYPE', 'CODE_PINS', 'CONFLICTING_EXPLICIT_INPUT_PIN', 'CONFLICTING_EXTERNAL_PIN', 'CONTROL_AUTHOR_ACTUAL_IDS', 'CONTROL_AUTHOR_MUST_BE_PENDING', 'CONTROL_AUTHOR_REQUIRED', 'CONTROL_AUTHOR_SOURCE_BINDING', 'CONTROL_MODE', 'CONTROL_UNKNOWN_FIELD', 'COPY_BYTE_BUDGET', 'COPY_DIRECTORY_TYPE', 'COPY_ENTRY_IDENTITY', 'COPY_ENTRY_KIND', 'COPY_EXPECTED_BYTES', 'COPY_EXPECTED_METADATA', 'COPY_OUTPUT_CHANGED', 'COPY_READ_PARTIAL', 'COPY_RELATIVE_ENTRY', 'COPY_SOURCE_CHANGED', 'COPY_SOURCE_TYPE_OWNER', 'CURRENT_CLIENT_NOT_RECORDED', 'CURRENT_CLIENT_REUSED_OR_REPARENTED', 'CURRENT_GATEWAY_MARKER', 'CURRENT_PARENT_CENSUS_CHANGED', 'CURRENT_UNKNOWN_PROJECT_ROLE', 'CURRENT_UTILITY_UNKNOWN', 'CUSTODY_CLOSE_UNCONFIRMED', 'CUSTODY_DIRECTORY_CHANGED', 'CUSTODY_MEMBERS', 'CUSTODY_OWNER_MODE', 'CUSTODY_PATH', 'DUPLICATE_JSON', 'EXACT_BINARY_MODES_HASHES', 'EXACT_EXTERNAL_CONTROL_ARGUMENT', 'EXACT_EXTERNAL_SOURCE_PIN_MAP', 'EXACT_FAILED_RESOURCE_CLI', 'EXACT_FAILED_SUBJECT', 'EXACT_FINAL_RESULT_TYPES', 'EXACT_NEW_CODE_REVIEWS_OWED', 'EXACT_THREE_NEW_CODE_RECORDS', 'EXACT_WAITED_CENSUS_PROBE', 'EXCLUSIVE_FINAL_ATTEMPT_CHAIN', 'EXCLUSIVE_OUTPUT', 'EXCLUSIVE_OUTPUT_CUSTODY', 'EXCLUSIVE_OUTPUT_INODE', 'EXTERNAL_CONTROL_BEFORE_PARSE', 'EXTERNAL_CONTROL_PIN_MAP', 'EXTERNAL_CONTROL_SHA', 'EXTERNAL_INPUT_MODE_REGISTRY', 'EXTERNAL_PIN_REQUIRED', 'FACTORY_BASE_TYPE', 'FACTORY_CANONICAL_ROLE', 'FACTORY_EXACT_CANONICAL_ROLE_BINDINGS', 'FACTORY_EXACT_SEVEN_UNIQUE', 'FACTORY_EXACT_SIX_BUFFERS', 'FACTORY_EXACT_SOURCE_REVIEWS', 'FACTORY_EXTERNAL_GRAPH', 'FACTORY_FINAL_N_BINDING', 'FACTORY_FOUR_PYTHON_ROLES', 'FACTORY_INDEPENDENT_REVIEW_SUBJECT', 'FACTORY_NO_CALLER_BINARY_MAP', 'FACTORY_NO_FUTURE_CONTROL_CYCLE', 'FACTORY_NO_PRECREATE_N_FACT', 'FACTORY_OPENED_N_FACT', 'FACTORY_PRIOR_AND_INDEX', 'FACTORY_REVIEW_CONSUMED_BUFFERS', 'FACTORY_ROLE_CONFLICT', 'FACTORY_SAME_VALIDATED_DRAFT', 'FACTORY_SAME_WITNESSES', 'FACTORY_SEVEN_WITNESSES', 'FACTORY_SOURCE_CODE_GRAPH', 'FACTORY_SOURCE_MANIFEST_SHAPE', 'FACTORY_THREE_UTILITY_ROLES', 'FACTORY_TYPED_PHYSICAL_PYTHON_ROLES', 'FACTORY_WITNESS_BINDING', 'FACTORY_WITNESS_TYPES', 'FAILED_ARCHIVE_EQUALITY_DRIFT', 'FAILED_ARCHIVE_RELEASE', 'FAILED_ONLY', 'FAILED_W_CHANGED_DURING_ARCHIVE', 'FAILURE_AFTER_FINALIZATION', 'FAILURE_SINK_ARGV_BOUND', 'FAILURE_SINK_BYTES_BOUND', 'FAILURE_SINK_CHILD_BOUND', 'FILE_IDENTITY_CHANGED', 'FILE_OWNER_MODE_CAP', 'FINALIZATION_OWNER_CONFLICT', 'FINALIZATION_OWNER_REQUIRED', 'FINALIZATION_OWNER_TOKEN', 'FINITE_RELEVANT_LISTENER', 'FRESHNESS_OR_CLOCK_REVERSE', 'GATE_DELIVERY_PREPARATION', 'GATE_ORIGINAL_PINS', 'GATE_OUTER_GUARD_REQUIRED', 'GATE_PROOF_SUBJECT', 'GATE_QUALIFICATION_ONCE', 'GATE_SELECTED_CLEANUP_COMPLETE', 'HISTORICAL_SAME_START_LIVE', 'IMMUTABLE_BUFFER_SUBSTITUTED', 'IMMUTABLE_FILE_IDENTITY_CHANGED', 'IMMUTABLE_MODE_CONFLICT', 'INDEPENDENT_ACTUAL_QA_PIN', 'INHERITED_BOUNDARY', 'INITIAL_FACTS_BOUND', 'INITIAL_FACTS_CANONICAL_BUFFER', 'INITIAL_FACTS_RAW_PIN', 'INITIAL_FACTS_SCOPE', 'INITIAL_FACT_DERIVED_ROSTER', 'INITIAL_FACT_SCHEMA', 'INITIAL_FACT_SELF_PRECOMPLETION', 'INITIAL_FACT_TRACE_BINDING', 'INSTALL_CANDIDATE_SHAPE', 'INSTALL_CONTRACT_BUFFER', 'INSTALL_DERIVED_MAPS_ONLY', 'INSTALL_EXACT_APPROVED_READSET', 'INSTALL_EXACT_SEVEN_NEW_MEMBERS', 'INSTALL_FIXED_DESTINATION', 'INSTALL_INPUT_CONFLICT', 'INSTALL_INPUT_PIN', 'INSTALL_N_IDENTITY_STABLE', 'INSTALL_OLD_E_EXACT_ANCESTRY', 'INSTALL_OLD_E_IDENTITY', 'INSTALL_OLD_E_UNCHANGED_BYTES_MODES', 'INSTALL_ONCE_NO_RESET', 'INSTALL_OUTSIDE_CUSTODY', 'INSTALL_OUTSIDE_E_TRACE_SCOPE', 'INSTALL_OUTSIDE_MEMBER_TYPE', 'INSTALL_POST_WRITE_EQUALITY', 'INSTALL_PRIOR_FIXED_DIRECTORY', 'INSTALL_PRIOR_IDENTITY_MEMBERS', 'INSTALL_PRIOR_MEMBER_IDENTITY', 'INSTALL_REVIEWED_SOURCE_PIN', 'INSTALL_ROOT_SCOPE', 'INSTALL_STRICT_OUTSIDE_NAMES', 'INSTALL_TYPED_DIRECTORY_FACT', 'INSTALL_VERIFIED_CONSUMED_INPUT', 'KERNEL_LOCK_INODE', 'KERNEL_UNKNOWN', 'KNOWN_ACTOR_NUMERIC_PRESENT_HOLD', 'LINK_CHANGED', 'LINK_ENTRY', 'LINK_ENTRY_TYPE', 'LOCAL_NAME', 'LOCK_NAMED_FD', 'MEMBER', 'MKDIR_CREATION_MARKER', 'MKDIR_NAME', 'NEGATIVE_CLIENT_CHAIN', 'NEGATIVE_DENIAL', 'NEGATIVE_ORDER', 'NEW_CODE_RECORD_SCOPE', 'NEW_NODE_E_RELATED_CWD', 'NEW_ROOT_EXCEPTION', 'NONFINITE', 'NONREVERSING_CLOCK', 'NO_NATIVE_OR_ALTERNATE_MODE', 'NO_NATIVE_TOOL', 'NO_OUTPUT_BEFORE_QUALIFICATION', 'NO_SOURCE_NATIVE_CREDIT', 'N_CONTROL_PIN_SCOPE', 'N_MEMBER_MODE_OWNER', 'N_ONLY_LIBRARY_WRITE', 'N_ONLY_NEW_DIRECTORY_PIN_SCOPE', 'N_ONLY_OUTPUT_NAME', 'N_ONLY_PHYSICAL_ARCHIVE', 'N_STRICT_MEMBER_NAME', 'OBSERVER_UMASK_077', 'OLD_EXACT_COUNT', 'OLD_E_BYTES_CHANGED', 'OLD_E_MEMBERSHIP_PLUS_N_ONLY', 'ONLY_DEPENDENCY_LINK_ENTRY', 'ORIGINAL_22_CHART', 'ORIGINAL_E_W_NOT_N', 'ORIGINAL_FAILED_W_ARCHIVE_DRIFT', 'ORIG_ARGV_APP_LITERAL_MISMATCH', 'OUTPUT_IDENTITY_CHANGED', 'OWNED_W_IDENTITY', 'PERMIT_EXACT_CHAIN_PINS', 'POSTCLOSE_KERNEL_NOT_FREE', 'POSTCLOSE_OLD_CONTROLLER_LIVE', 'PRIOR_CLIENT_LIVE', 'PRIOR_INDEX_DIRECTORY_BINDING', 'PRIOR_INDEX_EXACT_BUFFERS', 'PRIOR_INDEX_EXACT_MEMBERS', 'PRIOR_INDEX_MEMBER_BINDING', 'PRIOR_INDEX_RAW_PIN', 'PRIOR_N01_EXACT_SEVEN', 'PRIOR_N01_IDENTITY', 'PRIOR_N01_MEMBER_DRIFT', 'PRIOR_NAMESPACE_EXACT_MEMBERS', 'PRIOR_NAMESPACE_IDENTITY', 'PRIOR_NAMESPACE_MEMBER_DRIFT', 'PROVISIONAL_CHILD_CAP_OR_PENDING', 'PYTHON_FOUR_ROLES', 'PYTHON_ROLE_CANONICAL', 'RAW_ARCHIVE_SET', 'RAW_FAILED_ARTIFACT_EQUALITY', 'READINESS_PERMIT_CHAIN', 'READ_CAP', 'READ_EXPECTED_METADATA', 'READ_PARTIAL', 'REQUESTED_LAUNCH_OPERATOR_TRACE', 'ROOT_AUTHORITY', 'ROOT_COMPLETION_ACTOR_BOUND', 'ROOT_COMPLETION_ACTOR_SCHEMA', 'ROOT_COMPLETION_ACTUAL_TOOL_EVIDENCE', 'ROOT_COMPLETION_AUTHOR_CONFLICT', 'ROOT_COMPLETION_BUFFER_SHA', 'ROOT_COMPLETION_EXACT_PENDING_SET', 'ROOT_COMPLETION_SOURCE_BINDING', 'ROOT_INPUT_PINS', 'ROOT_NO_HISTORICAL_REPAIR', 'ROOT_N_OPENED_IDENTITY', 'ROOT_ROLE_OR_SCOPE', 'ROOT_SUBJECT_PINS', 'SELF_TEXT_DIGEST_COUNT_MISMATCH', 'SELF_TEXT_SCHEMA', 'SEPARATE_FAILED_PERMIT', 'SEPARATE_NEGATIVE_STATUS', 'SETUP_BOUNDED_HELPERS', 'SETUP_HELPER_ACTUAL_COMPLETION', 'SETUP_HELPER_JOIN_TYPES', 'SETUP_HELPER_NUMERIC_PRESENT_HOLD', 'SETUP_ROOT_ATTESTATIONS', 'SETUP_SAME_READONLY_BUFFER', 'SETUP_SEPARATE_STATUSES', 'SETUP_TYPED_HELPER_IDENTITY', 'SOURCE_BEFORE_AFTER_CHANGED', 'SOURCE_LIMITS', 'STARTLESS_NUMERIC_PRESENT_HOLD', 'TYPED_ACTOR_COMPLETION_UNKNOWN', 'TYPED_ACTOR_EXTERNAL_EVIDENCE', 'TYPED_ACTOR_KNOWN_EVIDENCE', 'TYPED_ACTOR_KNOWN_OMITTED', 'TYPED_ACTOR_ROSTER_COMPLETE', 'TYPED_ACTOR_ROSTER_CONFLICT', 'TYPED_ACTOR_ROSTER_SCHEMA', 'TYPED_CONTROL_BINDING', 'TYPED_LOCAL_RECORD_BINDING', 'TYPED_OWNER_CODE_REVIEW_BINDING', 'TYPED_OWNER_EXACT_DECISION', 'TYPED_OWNER_EXACT_SCALAR_SCHEMA', 'TYPED_OWNER_RAW_PIN', 'TYPED_OWNER_RULINGS_REQUIRED', 'TYPED_RESULT_BINDING', 'TYPED_ROLE_CONTRACT_SCOPE', 'UNACCOUNTED_DESCENDANTS', 'UNIT_CLOSE_UNCONFIRMED', 'UNPINNED_PREEXISTING_N_MEMBER', 'UTILITY_ARGV', 'UTILITY_BINDING_LENGTH', 'UTILITY_CANONICAL_BINDING', 'UTILITY_CANONICAL_NO_ALIAS', 'UTILITY_HISTORY_CANONICAL_COMMAND', 'UTILITY_HISTORY_COMPLETE_HASHES', 'UTILITY_HISTORY_NAME_PID', 'UTILITY_HISTORY_UNKNOWN', 'UTILITY_NO_RESULT_ONLY', 'UTILITY_PARTIAL_OR_NONZERO_OR_STDERR', 'UTILITY_PID', 'VERIFIED_CONSUMED_BUFFER_CHANGED', 'VERIFIED_ENTRY_ONLY', 'WAITED_CENSUS_PROBE', 'WRAPPER_EXACT_PIN_CHAIN', 'WRITE_BYTES', 'WRITE_PARTIAL'], 'SOURCE06_VALUE_ERROR': ['ABSOLUTE_READER_PATH', 'ACTUAL_ROOT_RELEASE_REQUIRED', 'ACTUAL_WRAPPER_ZERO_REQUIRED', 'ARCHIVE_ALREADY_EXISTS', 'ARCHIVE_EQUALITY_FAILED', 'ARCHIVE_ROOT_SCOPE', 'AUXILIARY_CHANGED', 'AUXILIARY_MODE_BINDINGS', 'BANK_CHANGED', 'BOOTSTRAP_VERIFIED_BUFFER_MISMATCH', 'BOUNDED_OBSERVATION_FAILED', 'CANDIDATE_COMM_PARSE', 'CANDIDATE_TABLE_EMPTY_OR_BOUND', 'CASE_IDENTITY_MULTISET_MISMATCH', 'CHART_BYTES_OR_MODE', 'CHART_DIRECTORY_PATH_SET', 'CHART_EXACT_22_PATH_SET', 'CHART_SYMLINK_FORBIDDEN', 'COMM_CURRENT_HOLDER_MISSING', 'CONFLICTING_IMMUTABLE_CONTROL_PIN', 'CONTROL_PIN_NAME', 'CONTROL_PIN_SHA', 'COPIED_FILE_IDENTITY_CHANGED', 'COPIED_INPUT_CHANGED', 'COPY_PARENT_OUTSIDE_WORKSPACE', 'COPY_SOURCE_IDENTITY_CHANGED', 'CURRENT_IMMUTABLE_BYTES_CHANGED', 'CURRENT_OBSERVER_IDENTITY_NOT_BOUND', 'CUSTODY_DESTINATION_EXISTS_OR_LINK', 'CUSTODY_DIRECTORY_IDENTITY_CHANGED', 'CUSTODY_DIRECTORY_OR_ROOT_LINK', 'CUSTODY_LEAF_LINK', 'CUSTODY_LEAF_TYPE', 'CUSTODY_PARENT_FD_IDENTITY', 'CWD_IDENTITY_CHANGED', 'CWD_OBSERVATION_MISSING_OR_AMBIGUOUS', 'DECISION_RELEASE', 'DEPENDENCY_SYMLINK_CHANGED', 'DEPENDENCY_TARGET_CHANGED', 'DEPENDENCY_TREE_CHANGED', 'DIST_CHANGED', 'DIST_PATH_SET', 'DUPLICATE_COMM_PID', 'ENTRY_KIND', 'ENTRY_RELEASE_PATH', 'EXACT_GENERATION06_PACKAGE_REQUIRED', 'EXACT_PERMIT_SHA_REQUIRED', 'EXPECTED_REGULAR_FILE', 'EXPECTED_SHA_REQUIRED', 'EXPLICIT_IMMUTABLE_CONTROL_PINS_REQUIRED', 'FILE_COLLECTION_OR_HOOK_ERROR', 'FILTERED_CASE_RAN', 'FINAL_CHART_ARCHIVE_MISMATCH', 'FINAL_CHART_NOT_22', 'FINAL_READINESS_AND_RESULT_REQUIRED', 'FINAL_REQUIRES_RELEASESHA_ACTUALREVIEWADOPTIONSHA', 'FIXED_BANK_CHANGED', 'FIXED_BANK_READ_CHANGED', 'FIXTURE_SCRATCH_CLEANUP_FAILED', 'FRESH_ROOT_CUSTODY_BINDINGS_REQUIRED', 'GATEWAY_BOUNDARY_CENSUS_INCOMPLETE', 'GATEWAY_MARKER_SURVIVOR_OR_UNOWNED_CANDIDATE', 'GLOBAL_COMM_EMPTY', 'GLOBAL_PS_FAILED_OR_EMPTY', 'GLOBAL_TABLE_DUPLICATE_PID', 'GLOBAL_TABLE_INCOMPLETE', 'GLOBAL_TABLE_PARSE', 'GREEN_FAILURE_MESSAGES', 'GREEN_NATIVE_EXIT_OR_SUCCESS', 'GREEN_STATUS_COUNTS', 'GREEN_SUMMARY_COUNTS', 'HELM_CHANGED', 'HOLDER_ARGV_CHANGED', 'HOLDER_IDENTITY_LOST', 'HOLDER_PARENT', 'HOLD_MODE', 'IMMUTABLE_BUFFER_TYPE', 'IMMUTABLE_PATH_SUBSTITUTED', 'INHERITED_NODE_CHANGED', 'INSTALL_EXACT_ORIGINAL_PREIMAGE_REQUIRED', 'INSTALL_TARGET_IDENTITY_CHANGED', 'INTENDED_RED_REQUIRED', 'INVENTORY_ROOT_CHANGED', 'KERNEL_LOCK_FD_IDENTITY', 'KERNEL_LOCK_NOT_HELD', 'KERNEL_LOCK_UNKNOWN', 'LOCK_BINDING_TYPE', 'LOCK_DESCRIPTOR_MALFORMED', 'LOCK_DESCRIPTOR_NONCANONICAL', 'LOCK_FIELDS_INCOMPLETE', 'LOCK_FIELD_ORDER_OR_DUPLICATE', 'LOCK_REPLACED', 'LOCK_RETURNED_INODE_MISMATCH', 'LOCK_RETURNED_NAME_MISMATCH', 'LOCK_RETURNED_PID_MISMATCH', 'LSOF_OBSERVATION_FAILED_OR_EMPTY', 'MAIN_506', 'MISSING_ASSERTIONS', 'MISSING_NATIVE_STATUS', 'NATIVE_OWNERSHIP_HOLD', 'NODE_CANDIDATE_BOUND', 'NODE_CHANGED', 'NOT_DIRECT_HELD_SHELL_CHILD', 'OBSERVATION_ARGV_TYPE', 'OBSERVATION_BINARY_CHANGED', 'OBSERVATION_BINARY_READER_REQUIRED', 'OBSERVATION_CHILD_PID_UNKNOWN', 'OBSERVATION_CLIENT_BINDING_CHANGED', 'OBSERVATION_CLIENT_CENSUS_ANCHOR', 'OBSERVATION_CLIENT_ROW_INCOMPLETE', 'OBSERVATION_COMMAND_FAILED', 'OBSERVATION_HISTORY_BOUND', 'OBSERVATION_LAUNCH_UNKNOWN_NO_SIGNAL', 'OBSERVATION_NOT_COMPLETE_OR_WAITED', 'OBSERVATION_RECORD_NOT_READY', 'OBSERVATION_STDERR_UNQUALIFIED', 'OBSERVATION_UNKNOWN_NO_SIGNAL', 'ONE_COMPLETE_FILE_REQUIRED', 'ONE_SHOT_PHASE_ALREADY_CONSUMED', 'OPTIMIZED_PYTHON_FORBIDDEN', 'ORIGINAL_CONTROLLER_STILL_LIVE', 'OWNED_ROOT_CHANGED', 'PACKET_MEMBER_CHANGED', 'PACKET_MEMBER_METADATA', 'PACKET_MEMBER_PATH', 'PACKET_SEAL', 'PARENT_UMASK_MUST_ALREADY_BE_077', 'PATH_OUTSIDE_APPROVED_CUSTODY', 'PHASE_RECEIPT_EXISTS', 'PHASE_REQUIRES_PHASE_RELEASEPATH_RELEASESHA_DECISIONSHA', 'POSTCLOSE_LOCK_CHANGED', 'POSTCLOSE_LOCK_FD_CHANGED', 'POSTCLOSE_OLD_CONTROLLER_SURVIVES', 'POSTCLOSE_PHASE_RECEIPT', 'POSTCLOSE_RECORDED_IDENTITY_SURVIVES', 'POSTCLOSE_REQUIRES_RELEASESHA_WRAPPERRESULTSHA', 'POSTCLOSE_SOURCE_CHANGED', 'PRECEDING_RECEIPT_NOT_ACCEPTED', 'PRECEDING_RECEIPT_SHA', 'PREDECESSOR_BINDINGS', 'PREDECESSOR_PHASE_NAME', 'PREUNIT_CANDIDATE_BASELINE_REQUIRED', 'PRIOR_OBSERVATION_CHILD_BINDING_INCOMPLETE', 'PRIOR_OBSERVATION_CHILD_UNKNOWN_OR_UNWAITED', 'PRIOR_OBSERVATION_CLIENT_IDENTITY_UNKNOWN', 'PRIOR_OBSERVATION_CLIENT_SURVIVES', 'PROCESS_CENSUS_INCOMPLETE', 'READ_RACE', 'RED_FAILURE_ARITY', 'RED_NATIVE_EXIT_OR_SUCCESS', 'RED_STATUS_COUNTS', 'RED_SUMMARY_COUNTS', 'RELEASE_PATH', 'REPORT_NOT_OBJECT', 'RESIDENT_WORKER_OR_UNKNOWN_CANDIDATE', 'RESOURCE_BOUNDARY_HOLD', 'REVIEWS_REQUIRED', 'ROOT_PHASE_DECISION_REQUIRED', 'ROOT_RELEASE_SCOPE', 'RUNTIME_SUITE_ERROR', 'SCOPED_PS_OBSERVATION_FAILED', 'SCOPE_WIDENING', 'SELECTED_RED_DID_NOT_FAIL', 'SOURCE_BYTES_OR_MODE_CHANGED', 'SOURCE_PATH_SET', 'SOURCE_RELEASE_DIGEST', 'SUCCESS_ONLY_EXPLICIT_GATE_CALL', 'SYMLINK_PARENT', 'TABLE_COLLECTOR_PARENT_MISMATCH', 'TABLE_CURRENT_COLLECTOR_OR_PARENT_MISSING', 'TABLE_HELD_PARENT_MISMATCH', 'TABLE_HOLDER_INCONSISTENT', 'TMPDIR_NOT_EMPTY_BEFORE_PHASE', 'TODO_TEST', 'TOOL_ALIAS_TARGET_CHANGED', 'TOTAL_TEST_COUNT', 'UNAPPROVED_ARCHIVE_LINK', 'UNBOUND_IMMUTABLE_JSON_INPUT', 'UNBOUND_OBSERVATION_BINARY', 'UNBOUND_PRECEDING_RECEIPT', 'UNBOUND_SAFE_ENV', 'UNDECLARED_BASELINE_READER_PATH', 'UNEXPECTED_PREEXISTING_COPY_PARENT', 'UNEXPECTED_WORKSPACE_ENTRY', 'UNKNOWN_PHASE', 'UNREVIEWED_ENV_KEY', 'UNSAFE_EVIDENCE_ROOT', 'UNSAFE_FILE', 'UNSAFE_WORKSPACE_ROOT', 'USAGE: phase release-path exact-release-sha decision-sha', 'VERIFIED_IMMUTABLE_BUFFER_CHANGED', 'VERIFIED_READER_ANCESTOR_CHANGED', 'VERIFIED_READER_LEAF_CHANGED', 'VERIFIED_READER_REGULAR', 'VERIFIED_SCOPE', 'WORKSPACE_ALREADY_EXISTS', 'WRITE_OUTSIDE_OWNED_ROOTS', 'WRONG_FILE', 'WRONG_HOLD', 'WRONG_LOCK_PATH', 'WRONG_RED_ASSERTION_SOURCE_FRAME', 'WRONG_RED_EXPECTATION'], 'BOOTSTRAP_VALUE_ERROR': ['AUTHOR_REQUEST_RAW_PIN', 'BOOTSTRAP_ANCESTOR', 'BOOTSTRAP_CHANGED', 'BOOTSTRAP_CLOSE_UNCONFIRMED', 'BOOTSTRAP_LEAF', 'BOOTSTRAP_N_MODE', 'BOOTSTRAP_SHORT', 'BUFFER_INTEGRITY', 'BUFFER_METADATA', 'CLEANUP_FAILURE_BOUND', 'CODE_ROOT_PINS', 'CODE_VERIFIED_BUFFER', 'DUPLICATE_ROOT_CONTROL', 'EXTERNAL_AUTH_SHA', 'FAILED_BOOTSTRAP_INTEGRITY', 'FAILURE_AFTER_FINALIZATION', 'FAILURE_SINK_ARGV_BOUND', 'FAILURE_SINK_BYTES_BOUND', 'FAILURE_SINK_CHILD_BOUND', 'FINALIZATION_OWNER_CONFLICT', 'FINALIZATION_OWNER_REQUIRED', 'FINALIZATION_OWNER_TOKEN', 'INSTALL_BOOTSTRAP_ANCESTOR', 'INSTALL_BOOTSTRAP_CHANGED', 'INSTALL_BOOTSTRAP_METADATA', 'INSTALL_BOOTSTRAP_PARTIAL', 'INSTALL_DERIVED_MAPS_ONLY', 'INSTALL_DERIVED_READSET_POLICY', 'INSTALL_DUPLICATE_SCOPE', 'INSTALL_ENTRY_SOURCE_GRAPH', 'INSTALL_EXTERNAL_SCOPE_SHA', 'INSTALL_FIXED_SCOPE_PATH', 'INSTALL_LOADER_REVIEWED_GRAPH', 'INSTALL_LOADER_SHA', 'INSTALL_NONFINITE_SCOPE', 'INSTALL_REVIEWED_SOURCE_PIN', 'INSTALL_SCOPE_UNKNOWN_FIELD', 'INSTALL_SOURCE_MANIFEST_DUPLICATE', 'INSTALL_SOURCE_MANIFEST_SHA', 'INSTALL_SOURCE_MANIFEST_SHAPE', 'INSTALL_VERIFIED_ENTRY_REQUIRED', 'OUTER_FAILURE_SINK_REQUIRED'], 'OS_ERROR': ['OS_ERROR'], 'UNMAPPED_FAILURE': ['UNMAPPED_FAILURE']}
class BootstrapValueError(ValueError):namespace="BOOTSTRAP_VALUE_ERROR"
class FailureSink:
    """One root/operator trace record; never an N fact or qualified observation."""
    def __init__(self,emit,pid=None,ppid=None):
        self.emit,self.pid,self.ppid=emit,pid,ppid;self.owner=None;self.finalized=False;self.finalizer_token=None;self.finalizer_label=None;self.primary_type=None;self.cleanup_seen={};self.namespace_state=None;self.bootstrap_fds=[];self.resources=[];self.bounded_metadata_omitted=False;self.stage="ENTRY_BUFFER";self.primary_failure=None;self.cleanup_failures=[];self.gate_qualification=None
    def text(self,value,maximum):
        if value is None:return None
        if type(value)is str and len(value)<=maximum:return value
        self.bounded_metadata_omitted=True;return None
    def number(self,value,minimum,maximum):
        if value is None:return None
        if type(value)is int and minimum<=value<=maximum:return value
        self.bounded_metadata_omitted=True;return None
    def classify(self,error,stage=None):
        namespace=getattr(type(error),"namespace",getattr(error,"namespace",None))
        if isinstance(error,OSError):namespace="OS_ERROR";reason="OS_ERROR"
        else:
            reason=error.args[0] if len(error.args)==1 and type(error.args[0])is str else None
            if namespace not in REASON_REGISTRY or reason not in REASON_REGISTRY[namespace]:namespace="UNMAPPED_FAILURE";reason="UNMAPPED_FAILURE"
        actual_stage=getattr(error,"failure_stage",self.stage) if stage is None else stage
        return dict(stage=actual_stage if actual_stage in STAGES else "UNMAPPED_FAILURE",namespace=namespace,reason=reason)
    def require_finalizer(self):
        if self.finalizer_token is None or self.finalized:raise BootstrapValueError("FINALIZATION_OWNER_REQUIRED")
    def claim_finalizer(self,label):
        if self.finalizer_token is not None or label not in ("GUARD","INSTALL_LOADER","DIRECT_RUN","DIRECT_INSTALL_CLI","DIRECT_ENTRY","CALLER","DIRECT_CONTROL_AUTHOR","CONTROL_AUTHOR_LOADER"):raise BootstrapValueError("FINALIZATION_OWNER_CONFLICT")
        self.finalizer_token=object();self.finalizer_label=label;return self.finalizer_token
    def primary(self,error,stage=None):
        if self.finalized:raise BootstrapValueError("FAILURE_AFTER_FINALIZATION")
        if self.primary_failure is None:self.primary_failure=self.classify(error,stage);self.primary_type=type(error).__name__[:128]
        for cleanup in getattr(error,"cleanup_failures",[]):self.cleanup(cleanup)
    def cleanup(self,error):
        if self.finalized:raise BootstrapValueError("FAILURE_AFTER_FINALIZATION")
        if id(error) in self.cleanup_seen:return
        self.cleanup_seen[id(error)]=error
        if self.primary_type is None:self.primary_type=type(error).__name__[:128]
        if len(self.cleanup_failures)>=64:raise BootstrapValueError("CLEANUP_FAILURE_BOUND")
        self.cleanup_failures.append(self.classify(error,"CLOSE_ACCOUNTING"))
    def forward(self,error):
        """Accumulate only. The selected outer cleanup owner must finalize."""
        self.primary(error)
    def finalize(self,token):
        self.require_finalizer()
        if token is not self.finalizer_token:raise BootstrapValueError("FINALIZATION_OWNER_TOKEN")
        if self.primary_failure is None and not self.cleanup_failures and self.gate_qualification is not None:
            try:
                self.gate_qualification.prepare_delivery()
                accepted=self.gate_qualification.accept_after_cleanup(self,token)
            except BaseException as error:self.primary(error,'FINAL_GUARDED_ACCEPTANCE')
            else:self.finalized=True;return accepted
        self.finalized=True
        if self.primary_failure is None and not self.cleanup_failures:return None
        owner=self.owner
        current=(getattr(owner,"client",None) or getattr(owner,"provisional_client",None)) if owner is not None else None
        known=[];utilities=getattr(owner,"utilities",[]) if owner is not None else []
        prequalified=getattr(owner,"prequalified",False) is True
        selected=[r for r in utilities if not prequalified or r.get("classification")!="WAITED_POPEN_CHILD" or r.get("terminal") is not True]
        # Launch bounds guarantee this is closed; no truncation of unknown children.
        if len(selected)>64:raise BootstrapValueError("FAILURE_SINK_CHILD_BOUND")
        for row in selected:
            command=row.get("command")
            if type(command)is not list or len(command)>16 or not all(type(x)is str and len(x)<=1024 for x in command):raise BootstrapValueError("FAILURE_SINK_ARGV_BOUND")
            status=row.get("status");pid=row.get("pid")
            known.append(dict(pid=self.number(pid,1,2147483647),command=command,
                executableSha256=self.text(row.get("executableSha256"),64),start=self.text(row.get("observedStart"),128),
                startObserved=type(row.get("observedStart"))is str and len(row["observedStart"])<=128,fullFingerprint=None,
                waited=row.get("terminal") is True,status=self.number(status,-2147483648,2147483647),
                stdoutComplete=row.get("stdoutComplete") is True,stderrComplete=row.get("stderrComplete") is True,
                partialStdoutAvailable=row.get("partialStdoutAvailable") is True,partialStderrAvailable=row.get("partialStderrAvailable") is True,
                classification=self.text(row.get("classification"),64),ownership="PROVISIONAL_UNQUALIFIED"))
        client=dict(pid=self.number(self.pid,1,2147483647),ppid=self.number(self.ppid,0,2147483647),start=None,argvHash=None,fullFingerprint=None)
        if type(current)is dict:
            client.update(pid=self.number(current.get("pid"),1,2147483647),ppid=self.number(current.get("ppid"),0,2147483647),start=self.text(current.get("start"),128),argvHash=self.text(current.get("argvHash"),64))
            if current.get("identityComplete") is True:client["fullFingerprint"]={key:self.text(current["physicalProcessFingerprint"][key],64) for key in ("commHash","executableHash","executableFileHash")}
        resources=self.resources
        unresolved=sum(len(getattr(c,"chain",[]))+len(getattr(c,"leaves",[])) for c in resources)
        value=dict(kind="FAILED_RESOURCE_PROVISIONAL_OWNERSHIP",sink="ROOT_OPERATOR_TOOL_TRACE",status="HOLD",
            errorType=self.primary_type,qualified=False,NFact=False,credit=False,
            qualificationReached=prequalified,client=client,children=known,
            priorQualifiedUtilityRecordCount=len(utilities)-len(selected),
            unresolvedDescriptorCount=unresolved+len(self.bootstrap_fds),
            descriptorCompletion="UNKNOWN" if unresolved or self.bootstrap_fds else "CLOSED",
            childCompletion="UNKNOWN" if any(not r["waited"] for r in known) else "KNOWN_WAIT_RESULTS_ONLY",
            historicalRepair=False,outerObserverCompletionOwed=True,boundedMetadataOmitted=self.bounded_metadata_omitted,primaryFailure=self.primary_failure,cleanupFailures=self.cleanup_failures,stageDescribesFutureOnly=True,oldFirstHoldReason="UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED",descriptorSnapshotIsPostExitLeakProof=False,finalizationOwner=self.finalizer_label,namespaceCreation=self.namespace_state,selfText=getattr(owner,"provisional_self_text",None) if owner is not None else None)
        if len(json.dumps(value,ensure_ascii=True,separators=(",",":"),allow_nan=False).encode())>8388608:raise BootstrapValueError("FAILURE_SINK_BYTES_BOUND")
        self.emit(value)
# END SINGLE OUTER FAILURE SINK

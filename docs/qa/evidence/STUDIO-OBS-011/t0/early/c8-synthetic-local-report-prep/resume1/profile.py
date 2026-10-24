"""Distinct synthetic local-report validators. No ordinary/business acceptance bridge."""
import json,re,hashlib
PROTOCOL='C8_JAVA_SYNTHETIC_LOCAL_REPORT_V1'
CLAIM='LOCAL_SYNTHETIC_MODE_REPORT_WITH_SAMPLED_OBSERVATIONS'
PRINCIPAL='OWNED_DIRECT_CHILD_CHANNEL_MATCH_V1'
MODES=('parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write','tls-stall-body','tls-stall-trailers','tls-dribble','relay')
OPERATIONS=('capture','negative','held','fixture','compile','mode','archive','final','gate','postclose','author')
GUARANTEES=dict(strongExecutableObjectIdentityProved=False,kernelMainMappedVnodeEqualityProved=False,
 highResolutionProcessIdentityProved=False,launchTimeExecutableObjectBound=False,completeIntervalHistoryProved=False,
 exhaustiveDescendantDiscoveryProved=False,adversarialReplacementRaceExcluded=False,globalQuietProved=False,
 legacyOrdinaryGateSatisfied=False,intervalCaptureClaimed=False)
UNSUPPORTED={name:dict(value=None,reason='NOT_PROVED_BY_SYNTHETIC_LOCAL_REPORT_PROFILE') for name in
 ('kernelStartSeconds','kernelStartMicroseconds','kernelMainExecutableObject','mainMappedObjectEquality','launchTimeObjectBinding','strongPlatformCertificateSha256')}
ROLES=('BIN','APP','PS','LSOF','GIT','NODE','HELM')
CODE=('profile.py','qualification_custody.py','storage.py','mode_predicates.py','public_contract.py','runtime.py')
REASONS=frozenset(('NONE','PROFILE_OR_SCOPE','CONTROL_SCHEMA','EXTERNAL_PIN','OWNER_RULINGS_OWED','ROLE_CONTRACT',
 'CAP_CONSUMED','HOLDER_OR_LOCK','CURRENT_SAMPLE_UNKNOWN','RELEVANCE_LIVE_OR_AMBIGUOUS','SOURCE_DRIFT',
 'INPUTS_UNQUALIFIED','PHASE_ORDER','NATIVE_FAILED','NATIVE_UNKNOWN','NATIVE_DEADLINE','NATIVE_CONSTRUCTOR_UNKNOWN',
 'UTILITY_UNKNOWN','CHANNEL_UNQUALIFIED','EARLY_OR_DUPLICATE_ENROLLMENT','PEER_MISMATCH','FRAME_INVALID',
 'PROJECTION_CUSTODY','COMMIT_INVALID','MODE_EVIDENCE','OWNERSHIP_UNKNOWN','ARCHIVE_UNKNOWN','ACTUAL_QA_OWED',
 'READINESS_OWED','PERMIT_STALE','PUBLICATION_UNKNOWN','OUTER_COMPLETION_OWED','FILESYSTEM_FAILURE','UNMAPPED_FAILURE'))

class Hold(Exception):pass
def need(ok,reason):
    if ok is not True:raise Hold(reason)
def reason(error):
    return error.args[0] if type(error) is Hold and len(error.args)==1 and type(error.args[0]) is str and error.args[0] in REASONS else 'UNMAPPED_FAILURE'
def hash_value(value):return type(value) is str and re.fullmatch('[0-9a-f]{64}',value) is not None
def integer(value,minimum=0,maximum=2147483647):return type(value) is int and minimum<=value<=maximum
def fields(value,names):need(type(value) is dict and set(value)==set(names),'CONTROL_SCHEMA')
def wire(value):return json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
def digest(raw):return hashlib.sha256(raw).hexdigest()
def decode(raw,maximum=16777216):
    need(type(raw) is bytes and 0<len(raw)<=maximum,'CONTROL_SCHEMA')
    def pairs(items):
        result={}
        for key,value in items:
            need(key not in result,'CONTROL_SCHEMA');result[key]=value
        return result
    return json.loads(raw.decode('utf-8','strict'),object_pairs_hook=pairs,
        parse_constant=lambda unused:(_ for _ in ()).throw(Hold('CONTROL_SCHEMA')))
def claim(**facts):
    return dict(protocol=PROTOCOL,claimSet=CLAIM,guarantees=dict(GUARANTEES),unsupportedEvidence=UNSUPPORTED,
        historicalIdentityUncertainty=True,identityComplete=False,kernelIdentityComplete=False,
        C8=False,credit=False,cleanupAuthorized=False,sourceWrites=[],**facts)
def validate_claim(value):
    need(type(value) is dict and value.get('protocol')==PROTOCOL and value.get('claimSet')==CLAIM,'PROFILE_OR_SCOPE')
    need(value.get('guarantees')==GUARANTEES and all(value['guarantees'][name] is False for name in GUARANTEES),'PROFILE_OR_SCOPE')
    need(value.get('unsupportedEvidence')==UNSUPPORTED and value.get('historicalIdentityUncertainty') is True
        and value.get('identityComplete') is False and value.get('kernelIdentityComplete') is False
        and value.get('C8') is False and value.get('credit') is False and value.get('cleanupAuthorized') is False
        and value.get('sourceWrites')==[],'PROFILE_OR_SCOPE')
    return value
def safe_absolute(value):return type(value) is str and value.startswith('/') and '\x00' not in value and '//' not in value and all(x not in ('','.','..') for x in value.split('/')[1:])
def pin(value):
    fields(value,('path','sha256','bytes','mode','uid'))
    need(safe_absolute(value['path']) and hash_value(value['sha256']) and integer(value['bytes'],0,134217728)
        and integer(value['mode'],0,0o777) and integer(value['uid']),'EXTERNAL_PIN')
    return value
def holder(value):
    fields(value,('wrapper','shell','lock','inherited','directories'))
    for name in ('wrapper','shell'):
        row=value[name];fields(row,('pid','uid','legacyStart','argvSha256'))
        need(integer(row['pid'],1) and integer(row['uid']) and type(row['legacyStart']) is str and bool(row['legacyStart']) and hash_value(row['argvSha256']),'HOLDER_OR_LOCK')
    row=value['lock'];fields(row,('path','dev','inode','wrapperFd'))
    need(safe_absolute(row['path']) and integer(row['dev']) and integer(row['inode'],1) and integer(row['wrapperFd']),'HOLDER_OR_LOCK')
    need(type(value['inherited']) is list and len(value['inherited'])==6,'HOLDER_OR_LOCK')
    for row in value['inherited']:
        fields(row,('pid','legacyStart','argvSha256'));need(integer(row['pid'],1) and type(row['legacyStart']) is str and bool(row['legacyStart']) and hash_value(row['argvSha256']),'HOLDER_OR_LOCK')
    need(type(value['directories']) is list and bool(value['directories']),'HOLDER_OR_LOCK')
    for row in value['directories']:
        fields(row,('path','dev','inode','uid','mode'));need(safe_absolute(row['path']) and all(integer(row[x]) for x in ('dev','inode','uid','mode')),'HOLDER_OR_LOCK')
def release(value,manifest_sha):
    fields(value,('schemaVersion','protocol','claimSet','purpose','unit','repoRoot','workRoot','evidenceRoot','ownerUid','sourceManifestSha256',
        'codeReviews','ownerRulings','rootScope','holder','roles','selfTextPolicy','sourceInputs','phaseInputs','sourceAncestrySha256',
        'operation','mode','argv','cwd','environmentPin','launchControlPin','nativeBudgetNs','artifactLimits','expectedOutputMembers'))
    need(value['schemaVersion']==1 and type(value['schemaVersion']) is int and value['protocol']==PROTOCOL and value['claimSet']==CLAIM and value['purpose']=='ONE_SYNTHETIC_LOCAL_REPORT_UNIT','PROFILE_OR_SCOPE')
    need(value['sourceManifestSha256']==manifest_sha and hash_value(manifest_sha) and type(value['unit']) is str and re.fullmatch('c8-synth-[a-z0-9-]{1,64}',value['unit']) is not None,'PROFILE_OR_SCOPE')
    for name in ('repoRoot','workRoot','evidenceRoot','cwd'):need(safe_absolute(value[name]),'CONTROL_SCHEMA')
    need(value['workRoot'].startswith('/private/tmp/') and value['evidenceRoot'].startswith(value['repoRoot']+'/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/')
        and value['workRoot']!=value['evidenceRoot'] and integer(value['ownerUid']),'PROFILE_OR_SCOPE')
    holder(value['holder']);need(value['holder']['lock']['path']==value['repoRoot']+'/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock','HOLDER_OR_LOCK')
    need(type(value['roles']) is dict and set(value['roles'])==set(ROLES),'ROLE_CONTRACT')
    for name,item in value['roles'].items():
        fields(item,('use','declaredPath','pin','historicalOnly'))
        need(safe_absolute(item['declaredPath']) and item['use'] in ('OPERATIONAL','METADATA_ONLY'),'ROLE_CONTRACT')
        if item['use']=='OPERATIONAL':pin(item['pin']);need(item['pin']['path']==item['declaredPath'] and item['historicalOnly'] is False,'ROLE_CONTRACT')
        else:need(item['pin'] is None and item['historicalOnly'] is True,'ROLE_CONTRACT')
    need(all(value['roles'][x]['use']=='OPERATIONAL' for x in ('BIN','APP','PS','LSOF')) and all(value['roles'][x]['use']=='METADATA_ONLY' for x in ('GIT','NODE','HELM')),'ROLE_CONTRACT')
    self_policy=value['selfTextPolicy'];fields(self_policy,('kind','reportedBytes','reportedSha256','origArgv0Bytes','origArgv0Sha256','ownRoleRulingRequired'))
    need(self_policy['kind']=='MEMORY_TEXT_DIGEST_ONLY_NOT_A_PATH' and self_policy['ownRoleRulingRequired'] is True
        and integer(self_policy['reportedBytes'],1,4096) and hash_value(self_policy['reportedSha256']) and integer(self_policy['origArgv0Bytes'],1,4096) and hash_value(self_policy['origArgv0Sha256']),'ROLE_CONTRACT')
    need(type(value['sourceInputs']) is list and 0<len(value['sourceInputs'])<=32768 and len({x['path'] for x in value['sourceInputs']})==len(value['sourceInputs']),'INPUTS_UNQUALIFIED')
    for item in value['sourceInputs']:
        pin(item);need(item['path'].startswith(value['repoRoot']+'/') and '/t0/runtime/' not in item['path'] and not item['path'].endswith('/preexisting-baseline.json'),'INPUTS_UNQUALIFIED')
    need(hash_value(value['sourceAncestrySha256']) and type(value['phaseInputs']) is dict and bool(value['phaseInputs']),'INPUTS_UNQUALIFIED')
    for item in value['phaseInputs'].values():pin(item)
    need(value['operation'] in ('fixture','compile','mode') and (value['mode'] in MODES if value['operation']=='mode' else value['mode'] is None),'CONTROL_SCHEMA')
    need(type(value['argv']) is list and value['argv'] and all(type(x) is str and x and '\x00' not in x for x in value['argv'])
        and integer(value['nativeBudgetNs'],1,86400000000000),'INPUTS_UNQUALIFIED')
    need(value['cwd'].startswith(value['workRoot']+'/'),'PROFILE_OR_SCOPE')
    pin(value['environmentPin']);pin(value['launchControlPin']);pin(value['rootScope'])
    need(value['artifactLimits']==dict(entries=8192,total=536870912,perFile=134217728),'CONTROL_SCHEMA')
    need(type(value['expectedOutputMembers']) is list and all(type(x) is str and not x.startswith('/') and all(p not in ('','.','..') for p in x.split('/')) for x in value['expectedOutputMembers']),'CONTROL_SCHEMA')
    for field,roles in (('codeReviews',('Aria','Quinn')),('ownerRulings',('Aria','Quinn','root'))):
        need(type(value[field]) is dict and set(value[field])==set(roles),'OWNER_RULINGS_OWED')
        for item in value[field].values():pin(item)
    t0=value['repoRoot']+'/docs/qa/evidence/STUDIO-OBS-011/t0/'
    expected_reviews=dict(Aria='resume-architecture/resume2/c8-synthetic-local-report-source01-exact-review/review-record.json',Quinn='qa/c8-synthetic-local-report-source01-exact-review/review-record.json')
    expected_owners=dict(Aria='resume-architecture/resume2/c8-synthetic-local-report-source01-owner-ruling/owner-ruling-Aria.json',Quinn='qa/c8-synthetic-local-report-source01-owner-ruling/owner-ruling-Quinn.json',root='resume2-c8-synthetic-local-report-source01-owner-ruling-root.json')
    need(all(value['codeReviews'][name]['path']==t0+path for name,path in expected_reviews.items())
        and all(value['ownerRulings'][name]['path']==t0+path for name,path in expected_owners.items()),'OWNER_RULINGS_OWED')
    return value
def decision(value,release_sha,unit,operation,previous):
    fields(value,('schemaVersion','protocol','purpose','authorizedBy','releaseSha256','unit','operation','previous','attemptCap'))
    need(value['schemaVersion']==1 and type(value['schemaVersion']) is int and value['protocol']==PROTOCOL and value['purpose']=='ONE_ROOT_OPERATION'
        and value['authorizedBy']=='root' and value['releaseSha256']==release_sha and value['unit']==unit and value['operation']==operation
        and value['previous']==previous and type(value['attemptCap']) is int and value['attemptCap']==1,'CONTROL_SCHEMA')
    return value

"""Exact selected SOURCE02 pure mode/projection definitions; no main/effects."""
import json,re

MODES = ('parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write',
         'tls-stall-body','tls-stall-trailers','tls-dribble','relay')


NATIVE_FIELDS = frozenset(('directPid','directWaited','nativeStatus','stdoutComplete','stderrComplete',
                          'ownedWorkTerminated','descriptorsClosed','requestSha256','modeEvidence','archiveSha256'))


REASONS = frozenset(('NONE','CAP_CONSUMED','SCHEMA','PIN','MODE','LIMITS','PURPOSE','ROLE','LAUNCH',
    'INPUTS','CONTROL','ROOT_CUSTODY','EARLY_ENROLLMENT','STANDALONE_IDENTITY','PEER_CHANGED',
    'NATIVE_UNKNOWN','NATIVE_FAILED','MODE_EVIDENCE','RELAY_PROTOCOL','RELAY_DRAIN','LEDGER_UNKNOWN',
    'ADAPTER_PROTOCOL','UNMAPPED_CONTROLLER_FAILURE','CLEANUP_UNCONFIRMED'))


class Hold(Exception):
    pass


def need(value, reason):
    if value is not True:
        raise Hold(reason)


def reason(failure):
    if type(failure) is Hold and len(failure.args)==1 and failure.args[0] in REASONS:
        return failure.args[0]
    return 'UNMAPPED_CONTROLLER_FAILURE'


def hash_value(value):
    return type(value) is str and re.fullmatch('[0-9a-f]{64}',value) is not None


def native_projection(value):
    """Total closed typed facts; never return or invoke an arbitrary adapter value.

    Exact-dict items are copied only under exact-string known keys. Each scalar is
    independently checked, so malformed status/archive cannot erase confirmed wait
    facts. No raw buffer, unknown key, object, exception text or representation escapes.
    """
    out=dict(shapeValid=False,fieldTypesValid=False,reason='ABSENT' if value is None else 'SCHEMA',
        directPid=None,nativeStatus=None,directWaited=None,stdoutComplete=None,stderrComplete=None,
        ownedWorkTerminated=None,descriptorsClosed=None,requestSha256=None,archiveSha256=None)
    if type(value) is not dict:return out
    # Calling dict.items on an exact dict does not dispatch to adapter-defined methods.
    known={key:item for key,item in dict.items(value) if type(key) is str and key in NATIVE_FIELDS}
    out['shapeValid']=len(known)==len(value) and set(known)==NATIVE_FIELDS
    for key in ('directWaited','stdoutComplete','stderrComplete','ownedWorkTerminated','descriptorsClosed'):
        item=known.get(key)
        if type(item) is bool:out[key]=item
    item=known.get('directPid')
    if type(item) is int and 0<item<2147483648:out['directPid']=item
    item=known.get('nativeStatus')
    # Bounded representation covers actual OS return statuses and prevents arbitrary
    # upstream integers from making the closed JSON boundary itself fail serialization.
    if type(item) is int and -2147483648<=item<2147483648:out['nativeStatus']=item
    for key in ('requestSha256','archiveSha256'):
        item=known.get(key)
        if hash_value(item):out[key]=item
    mode=known.get('modeEvidence')
    out['fieldTypesValid']=all(out[key] is not None for key in (
        'directPid','nativeStatus','directWaited','stdoutComplete','stderrComplete',
        'ownedWorkTerminated','descriptorsClosed','requestSha256','archiveSha256')) and type(mode) is bytes and len(mode)<=16384
    out['reason']='SCHEMA' if not out['shapeValid'] else 'NONE' if out['fieldTypesValid'] else 'NATIVE_UNKNOWN'
    return out


def positive(value):
    return type(value) is int and value>0


def fields(value, names):
    need(type(value) is dict and set(value)==set(names),'SCHEMA')


def strict(raw, cap=1048576):
    need(type(raw) is bytes and 0<len(raw)<=cap,'SCHEMA')
    def pairs(items):
        out={}
        for key,value in items:
            need(key not in out,'SCHEMA');out[key]=value
        return out
    return json.loads(raw.decode('utf-8','strict'),object_pairs_hook=pairs,
        parse_constant=lambda unused: (_ for _ in ()).throw(Hold('SCHEMA')))


def mode_evidence(mode, raw, contract):
    """Interpret the same complete bounded stdout buffer; mode return alone is insufficient."""
    value=strict(raw,16384)
    if mode=='parser':
        fields(value,('case','status','originalChecks','addedChecks','checks','nativeBusinessRequests'))
        need(value==dict(case='parser',status='PASS',originalChecks=18,addedChecks=6,checks=24,nativeBusinessRequests=0)
             and all(type(value[k]) is int for k in ('originalChecks','addedChecks','checks','nativeBusinessRequests')),'MODE_EVIDENCE')
        return True
    if mode=='relay':
        fields(value,('case','status','nativeBusinessRequests'))
        need(value==dict(case='relay',status='ROOT_RECEIPT_REQUIRED',nativeBusinessRequests=0)
             and type(value['nativeBusinessRequests']) is int,'MODE_EVIDENCE')
        # This is solely the producer half; Invocation additionally requires the actual
        # qualified receiver/peer/COMMIT/drain result. Never convert this line alone to PASS.
        return True
    fields(value,('case','status','connects','accepted','requests','stage','serverFailure','controllerFailure',
        'serverListenerAcquired','serverPeerAcquired','serverListenerClose','serverPeerClose','cancellationRequested',
        'cancellationCount','productionCancellationSet','networkTerminated','serverTerminated','serverDrainElapsedNs',
        'networkAccounting','elapsedNs','closedProjection'))
    need(mode in MODES and mode.startswith('tls-') and value['case']==mode and value['status']=='PASS','MODE_EVIDENCE')
    for key in ('connects','accepted','requests','cancellationCount','serverDrainElapsedNs','elapsedNs'):
        need(type(value[key]) is int and value[key]>=0,'MODE_EVIDENCE')
    for key in ('serverListenerAcquired','serverPeerAcquired','cancellationRequested','productionCancellationSet','networkTerminated','serverTerminated'):
        need(type(value[key]) is bool,'MODE_EVIDENCE')
    need(value['connects']==value['accepted']==1 and value['networkTerminated'] is True and value['serverTerminated'] is True
         and value['serverListenerAcquired'] is True and value['serverPeerAcquired'] is True
         and value['serverListenerClose']==value['serverPeerClose']=='CLOSED' and value['controllerFailure']=='NONE'
         and value['serverFailure'] in ('NONE','SERVER_INTERRUPTED','SERVER_IO_OR_TLS_FAILURE')
         and value['serverDrainElapsedNs']<=5000000000 and value['elapsedNs']<20000000000,'MODE_EVIDENCE')
    need(value['cancellationCount']==(1 if value['cancellationRequested'] else 0)
         and value['productionCancellationSet']==value['cancellationRequested'],'MODE_EVIDENCE')
    accounting=value['networkAccounting'];fields(accounting,contract.network_not_started())
    for key in ('workerStarted','requestCompleted','deadlineExceeded','callerInterrupted'):need(type(accounting[key]) is bool,'MODE_EVIDENCE')
    for key in ('acquiredSockets','successfulSocketCloses','connectCalls','requestStarts'):
        need(type(accounting[key]) is int and accounting[key]>=0,'MODE_EVIDENCE')
    need(accounting['workerStarted'] is True and accounting['workerTermination']=='TERMINATED'
         and accounting['acquiredSockets']==accounting['successfulSocketCloses']==2 and accounting['connectCalls']==1
         and accounting['callerInterrupted'] is False and type(accounting['networkCompletionElapsedNs']) is int
         and 0<=accounting['networkCompletionElapsedNs']<=14000000000,'MODE_EVIDENCE')
    stages={'tls-good':'GOOD_RESPONSE_SENT','tls-oversize':'OVERSIZE_LENGTH_SENT','tls-stall-handshake':'STALL_HANDSHAKE',
        'tls-stall-write':'STALL_WRITE_FIXTURE','tls-stall-body':'STALL_BODY','tls-stall-trailers':'STALL_TRAILERS','tls-dribble':'DRIBBLE_BODY'}
    need(value['stage']==stages[mode],'MODE_EVIDENCE')
    if mode=='tls-stall-handshake':
        need(value['requests']==accounting['requestStarts']==0 and accounting['requestCompleted'] is False,'MODE_EVIDENCE')
        # TLS wrapper has already been acquired before the intentional handshake stall.
    elif mode=='tls-stall-write':
        need(value['requests']==0 and accounting['requestStarts']==1 and accounting['requestCompleted'] is False,'MODE_EVIDENCE')
    else:need(value['requests']==accounting['requestStarts']==1 and accounting['requestCompleted'] is True,'MODE_EVIDENCE')
    if mode=='tls-good':
        need(value['closedProjection']==dict(captureStatus='CAPTURED',publicOutcomeOrState='FAILED',errorCode='LOGIN_REQUIRED',codeQualified=True)
             and value['closedProjection']['codeQualified'] is True and accounting['networkCompletionElapsedNs']<=12000000000
             and accounting['deadlineExceeded'] is False and value['serverFailure']=='NONE','MODE_EVIDENCE')
    else:
        need(value['closedProjection']=={},'MODE_EVIDENCE')
        if mode!='tls-oversize':need(value['cancellationRequested'] is True or accounting['deadlineExceeded'] is True,'MODE_EVIDENCE')
    return True


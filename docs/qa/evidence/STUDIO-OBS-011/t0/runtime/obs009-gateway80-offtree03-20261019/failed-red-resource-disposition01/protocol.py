"""Pure qualified FAILED-resource policy. No filesystem/process/imported helper."""
import hashlib
import json
import re
SOURCE='f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277'
MODES=('negative','held-proof','archive','final','gate','postclose')
class Hold(Exception):pass
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
def authority(a,contract):
    need(a.get('authorizedBy')=='root' and a.get('authorized') is True,'ROOT_AUTHORITY')
    need(type(a.get('expectedWrapperExit'))is int and a['expectedWrapperExit']==1 and type(a.get('newNativeInvocations'))is int and a['newNativeInvocations']==0,'FAILED_ONLY')
    need(a.get('sourceWrites')==[] and a.get('cleanup') is False and a.get('normalRoute')=='HARD_HOLD' and a.get('credit') is False,'NO_SOURCE_NATIVE_CREDIT')
    need(packed(a.get('subject'))==packed(contract['subject']) and packed(a.get('retainedFailure'))==packed(contract['retainedFailure']),'EXACT_FAILED_SUBJECT')
    need(a.get('compileObligation')=='NONE_NODE_ONLY_UNCHANGED_SOURCE' and a.get('distinctFailedEntrypointAuthorized') is True,'NEW_ROOT_EXCEPTION')
    need(a.get('sourceDigest')==SOURCE and packed(a.get('limits'))==packed(contract['limits']),'SOURCE_LIMITS')
    need(type(a.get('rootInputPins'))is dict and all(type(k)is str and pin(v) for k,v in a['rootInputPins'].items()),'ROOT_INPUT_PINS')
    need(type(a.get('codePins'))is dict and set(a['codePins'])==set(contract['installedCode']) and all(pin(v) for v in a['codePins'].values()),'CODE_PINS')
    return a

def finite_join(rows,contract,clients,current,controllers,probe):
    old=contract['finiteUnion'];live=[]
    for who in old['historicalPidStartsRequiringAbsentOrReused']:
        if rows.get(who['pid'],{}).get('start')==who['start']:live.append(who)
    need(not live,'HISTORICAL_SAME_START_LIVE')
    need(old['startlessCandidate']['pid'] not in rows,'STARTLESS_NUMERIC_PRESENT_HOLD')
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
        priorClientsAbsentOrReused=True,currentCensusProbe=dict(pid=probe['pid'],start=probe['observedStart'],commandSha256=sha(' '.join(probe['command']).encode()),executableSha256=probe['executableSha256'],waitedExit=0),unexpectedDescendants=[],finiteNumericUnion=old['numericCountExcludingControllers'],globalQuiet=False,historicalRepair=False)

def equivalent(rows):
    return [{k:v for k,v in r.items() if k not in ('dev','ino','mtimeNs','ctimeNs')} for r in rows]
def freshness(now,readiness,permit):
    need(type(now)in(int,float) and type(readiness)in(int,float) and type(permit)in(int,float),'CLOCK_TYPE')
    need(0<=now-readiness<=60 and readiness<=permit<=now and now-permit<=60,'FRESHNESS_OR_CLOCK_REVERSE')

# BEGIN SINGLE OUTER FAILURE SINK (same exact definition embedded in guard)
class FailureSink:
    """One root/operator trace record; never an N fact or qualified observation."""
    def __init__(self,emit,pid=None,ppid=None):
        self.emit,self.pid,self.ppid=emit,pid,ppid;self.owner=None;self.sent=False;self.bootstrap_fds=[];self.resources=[];self.bounded_metadata_omitted=False
    def text(self,value,maximum):
        if value is None:return None
        if type(value)is str and len(value)<=maximum:return value
        self.bounded_metadata_omitted=True;return None
    def number(self,value,minimum,maximum):
        if value is None:return None
        if type(value)is int and minimum<=value<=maximum:return value
        self.bounded_metadata_omitted=True;return None
    def forward(self,error):
        if self.sent:return
        self.sent=True;owner=self.owner
        current=(getattr(owner,"client",None) or getattr(owner,"provisional_client",None)) if owner is not None else None
        known=[];utilities=getattr(owner,"utilities",[]) if owner is not None else []
        prequalified=getattr(owner,"prequalified",False) is True
        selected=[r for r in utilities if not prequalified or r.get("classification")!="WAITED_POPEN_CHILD" or r.get("terminal") is not True]
        # Launch bounds guarantee this is closed; no truncation of unknown children.
        if len(selected)>64:raise ValueError("FAILURE_SINK_CHILD_BOUND")
        for row in selected:
            command=row.get("command")
            if type(command)is not list or len(command)>16 or not all(type(x)is str and len(x)<=1024 for x in command):raise ValueError("FAILURE_SINK_ARGV_BOUND")
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
            if current.get("identityComplete") is True:client["fullFingerprint"]={key:self.text(current[key],64) for key in ("commHash","executableHash","executableFileHash")}
        resources=self.resources
        unresolved=sum(len(getattr(c,"chain",[]))+len(getattr(c,"leaves",[])) for c in resources)
        value=dict(kind="FAILED_RESOURCE_PROVISIONAL_OWNERSHIP",sink="ROOT_OPERATOR_TOOL_TRACE",status="HOLD",
            errorType=type(error).__name__[:128],qualified=False,NFact=False,credit=False,
            qualificationReached=prequalified,client=client,children=known,
            priorQualifiedUtilityRecordCount=len(utilities)-len(selected),
            unresolvedDescriptorCount=unresolved+len(self.bootstrap_fds),
            descriptorCompletion="UNKNOWN" if unresolved or self.bootstrap_fds else "CLOSED",
            childCompletion="UNKNOWN" if any(not r["waited"] for r in known) else "KNOWN_WAIT_RESULTS_ONLY",
            historicalRepair=False,outerObserverCompletionOwed=True,boundedMetadataOmitted=self.bounded_metadata_omitted)
        if len(json.dumps(value,ensure_ascii=True,separators=(",",":"),allow_nan=False).encode())>8388608:raise ValueError("FAILURE_SINK_BYTES_BOUND")
        self.emit(value)
# END SINGLE OUTER FAILURE SINK

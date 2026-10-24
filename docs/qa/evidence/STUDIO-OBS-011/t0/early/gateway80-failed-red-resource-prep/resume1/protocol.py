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
    return [{k:v for k,v in r.items() if k not in ('dev','ino')} for r in rows]
def freshness(now,readiness,permit):
    need(type(now)in(int,float) and type(readiness)in(int,float) and type(permit)in(int,float),'CLOCK_TYPE')
    need(0<=now-readiness<=60 and readiness<=permit<=now and now-permit<=60,'FRESHNESS_OR_CLOCK_REVERSE')

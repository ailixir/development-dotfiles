"""Independent abstract P1/T1 checks only. No production imports, SQL or browser."""
import copy
import datetime
import hashlib
import json
import xml.etree.ElementTree as ET
from pathlib import Path

HERE=Path(__file__).resolve().parent;BASE=HERE.parent;ROOT=BASE.parents[5]
read=lambda p:json.loads(Path(p).read_text())
canon=lambda v:json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'))
h=lambda v:hashlib.sha256(canon(v).encode()).hexdigest()
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
fixture=read(BASE/'fixtures.json');checks=[]
terminal={'FAILED','UNKNOWN_OUTCOME','CANCELLED','EXPIRED','SUCCEEDED','PUBLICATION_CONFLICT'}
instant=lambda text:datetime.datetime.fromisoformat(text.replace('Z','+00:00'))

def require(ok,why):
    if not ok:raise ValueError(why)

def pending(s):return s['plan']['initialIndex']>0 and s['plan']['switch']is None
def live(s,now):return s['state']not in terminal and instant(s['expiresAt'])>now and instant(s['owner']['leaseExpiresAt'])>now

def proof(s,q,marker,now):
    require(pending(s)and live(s,now)and s['continuation']=='REPLAYING_PREFIX','durable live prefix')
    require(not s['hasInflightAction']and not s['pendingDelivery']and not s.get('pendingObservationRefresh',False)and not s.get('activeModelAttempt',False),'no inflight work or delivery')
    require(s.get('sideEffectStance','CLARIFY_FIRST')=='CLARIFY_FIRST'and s['context']['policyHash']==s['frozenPolicyHash'],'current frozen confirm-first policy')
    require(set(marker)=={'clarificationId','status','prefixRequestDigest'}and marker['status']=='PENDING','closed pending marker')
    row=s['prefixRequests'][marker['prefixRequestDigest']];request=row['document']
    require(row['status']=='PREPARED'and h(request)==marker['prefixRequestDigest'],'immutable original prepared request')
    expected={'sessionId':s['sessionId'],'scopeHash':s['scopeHash'],'sourceRevision':s['sourceRevision'],'configurationRevision':s['configurationRevision'],'workerId':s['owner']['workerId'],'ownerFence':s['owner']['fence'],'contextId':s['context']['contextId'],'contextRevision':s['context']['contextRevision'],'authoredInputsHash':s['context']['authoredInputsHash'],'evidenceHash':s['progress']['evidenceHash'],'prefixProgramHash':s['plan']['programHash'],'coordinate':s['plan']['nextCoordinate']}
    require(all(request[k]==value for k,value in expected.items()),'current owner/context/source/evidence/request')
    require(q['schemaVersion']==3 and q['phase']=='observed'and q['reason']=='SIDE_EFFECT_CONFIRMATION'and q['promptCode']=='CONFIRM_ACTION','existing side-effect question only')
    require(q['sessionId']==s['sessionId']and q['scopeHash']==s['scopeHash']and q['clarificationId']==marker['clarificationId']and q['coordinate']==request['coordinate']and q['documentId']==s['progress']['documentId']and q['generation']==s['progress']['generation'],'question exact identity')
    require(now<instant(q['expiresAt'])<=instant(s['expiresAt']),'question hard deadline authority')
    require(len(q['choices'])==1 and q['choices'][0]['labelSource']=='AUTHORED'and q['choices'][0]['bindingId']is None and not({'role','region'}&set(q['choices'][0])),'one authored existing choice')

def transition(c):
    s=copy.deepcopy(c['initial']);now=instant(c['now']);op=c['operation'];before=copy.deepcopy(s)
    if op=='guard':
        # Fixture guard decisions are abstract inputs, not a fresh GuidedActionGuard execution.
        if c['decision']in('DENY','UNGROUNDED','DESTRUCTIVE'):
            s['state']='FAILED';s['continuation']='STOPPED';s['progress']['errorCode']='POLICY_DENIED';return'TERMINAL_POLICY_DENIED',s
        return'ACCEPT',s
    if op=='ask':
        require(s['state']=='REPLAYING_PREFIX','prefix before question')
        proof(s,c['question'],c['marker'],now)
        s['progress']['clarification']=copy.deepcopy(c['question']);s['progress']['sideEffectConfirmation']=copy.deepcopy(c['marker']);s['state']='AWAITING_CLARIFICATION'
    elif op=='answer':
        require(c['caller']==s['originalPrincipal']and s['state']=='AWAITING_CLARIFICATION','current original user and waiting state')
        q=s['progress']['clarification'];marker=s['progress']['sideEffectConfirmation'];proof(s,q,marker,now)
        require(all(c['answer'][k]==q[k]for k in('clarificationId','generation'))and c['answer']['choiceId']==q['choices'][0]['choiceId'],'exact current answer')
        marker['status']='CONFIRMED';del s['progress']['clarification'];s['state']='REPLAYING_PREFIX'
    elif op=='model':require(not pending(s),'both model paths fenced by durable pending')
    elif op=='admit':
        require(live(s,now)and s['state']=='REPLAYING_PREFIX','no wait/terminal admission')
        marker=s['progress']['sideEffectConfirmation'];require(marker['status']=='CONFIRMED','current stance confirmation')
        require(s['progress']['evidenceHash']!=s['prefixRequests'][marker['prefixRequestDigest']]['document']['evidenceHash'],'old prepared authority cannot admit')
        # Actual fresh preparation/guard/entitlement checks remain mandatory source integration.
    elif op=='poll':require(s['state']=='AWAITING_CLARIFICATION','wait no-work poll')
    elif op=='cancel':s['state']='CANCELLED';s['continuation']='STOPPED'
    elif op=='renew':
        proof(s,s['progress']['clarification'],s['progress']['sideEffectConfirmation'],now)
        s['owner']['leaseExpiresAt']=min(now+datetime.timedelta(seconds=30),instant(s['expiresAt'])).isoformat().replace('+00:00','Z')
    elif op=='refresh':
        require(s['state']=='REPLAYING_PREFIX'and pending(s)and s['progress']['sideEffectConfirmation']['status']=='CONFIRMED','only confirmed prefix refresh')
        s['progress']['generation']+=1;s['progress']['evidenceHash']=h({'old':s['progress']['evidenceHash'],'abstractAck':True})
    else:raise ValueError('unknown abstract operation')
    require(s['context']==before['context']and s['counters']==before['counters']and s['nativeInvocations']==before['nativeInvocations'],'same browser/clock/values/counters/no new invocation')
    return'ACCEPT',s

def order(t):return(t['startMs'],['prefixReplay','step','clarificationWait','action'].index(t['kind']),-1 if t['ordinal']is None else t['ordinal'],t['stepId'],''if t['admissionId']is None else t['admissionId'])
def timings(c):
    before=canon(c['items']);seen=set()
    for t in c['items']:
        require(set(t)=={'kind','stepId','admissionId','ordinal','startMs','endMs'}and t['kind']=='action'and isinstance(t['admissionId'],str),'six-field action wire')
        require(t['admissionId']not in seen,'duplicate admission always rejected');seen.add(t['admissionId'])
        a=c['ledger'].get(t['admissionId']);require(a is not None and a['dispatchCount']==1 and a['stepId']==t['stepId']and a['ordinal']==t['ordinal'],'exact dispatched ledger')
        require(type(t['startMs'])is int and 0<=t['startMs']<=600000,'integer original session bound')
        require(t['endMs']is None or type(t['endMs'])is int and t['startMs']<=t['endMs']<=600000,'actual end or null')
    require(all(order(c['items'][i-1])<order(c['items'][i])for i in range(1,len(c['items']))),'complete strict scalar order')
    groups={}
    for t in c['items']:groups.setdefault(t['stepId'],[]).append(t)
    derived=[]
    for step,items in groups.items():
        sorted_items=sorted(items,key=order);derived.append({'kind':'step','stepId':step,'admissionId':None,'ordinal':None,'startMs':sorted_items[0]['startMs'],'endMs':sorted_items[-1]['endMs']})
    require(before==canon(c['items']),'readings never mutated')
    return derived

def state_case(c):
    try:
        status,s=transition(c);checks.append({'kind':'state','name':c['name'],'ok':status==c['expected'],'actual':status,'expected':c['expected']})
    except (ValueError,KeyError,TypeError,IndexError)as error:checks.append({'kind':'state','name':c['name'],'ok':c['expected']=='REJECT','actual':'REJECT','expected':c['expected'],'reason':str(error)})
def timing_case(c):
    try:
        result=timings(c);checks.append({'kind':'timing','name':c['name'],'ok':c['expected']=='ACCEPT','actual':'ACCEPT','derivedSteps':result})
    except (ValueError,KeyError,TypeError,IndexError)as error:checks.append({'kind':'timing','name':c['name'],'ok':c['expected']=='REJECT','actual':'REJECT','reason':str(error)})
for c in fixture['stateCases']:state_case(c)
for c in fixture['timingCases']:timing_case(c)
ask=next(c for c in fixture['stateCases']if c['operation']=='ask');answer=next(c for c in fixture['stateCases']if c['operation']=='answer'and c['expected']=='ACCEPT')
for name,mutate in [('pending-delivery',lambda c:c['initial'].update(pendingDelivery=True)),('pending-observation-refresh',lambda c:c['initial'].update(pendingObservationRefresh=True)),('active-model-attempt',lambda c:c['initial'].update(activeModelAttempt=True)),('wrong-request-status',lambda c:next(iter(c['initial']['prefixRequests'].values())).update(status='ISSUED')),('context-version-changed',lambda c:c['initial']['context'].update(contextRevision=2)),('worker-changed',lambda c:c['initial']['owner'].update(workerId='another-worker')),('question-expired',lambda c:c.update(now=c['question']['expiresAt']))]:
    c=copy.deepcopy(ask);c.update(name='extra-ask-'+name,expected='REJECT');mutate(c);state_case(c)
for stance in('DENY','ALLOW'):
    c=copy.deepcopy(ask);c.update(name='ask-requires-actual-confirm-first-'+stance,expected='REJECT');c['initial']['sideEffectStance']=stance;state_case(c)
c=copy.deepcopy(ask);c.update(name='prior-non-side-effect-native-actions-do-not-imply-consent',expected='ACCEPT');c['initial']['nativeInvocations']=3;state_case(c)
c=copy.deepcopy(answer);c.update(name='human-wait-outlives-old-preparation-under-renewed-current-owner',now='2026-10-15T06:05:00Z');c['initial']['owner']['leaseExpiresAt']='2026-10-15T06:05:20Z';c['initial']['volatilePreparationExpiresAt']='2026-10-15T06:00:10Z';state_case(c)
tie=next(c for c in fixture['timingCases']if c['name']=='legal-distinct-admission-tie')
for name,mutate in [('unknown-admission',lambda c:c['items'][0].update(admissionId='unknown')),('negative-measured-time',lambda c:c['items'][0].update(startMs=-1)),('end-before-start',lambda c:c['items'][0].update(endMs=c['items'][0]['startMs']-1)),('extra-attempt-wire-field',lambda c:c['items'][0].update(attemptOrdinal=0)),('duplicate-admission-different-time',lambda c:c['items'][-1].update(admissionId=c['items'][0]['admissionId'],startMs=c['items'][0]['startMs']+1))]:
    c=copy.deepcopy(tie);c.update(name='extra-timing-'+name,expected='REJECT');mutate(c);timing_case(c)
timing_case({'name':'empty-readings-stay-empty-no-fabricated-step','items':[],'ledger':{},'expected':'ACCEPT'})
sample={'kind':'step','stepId':'s','admissionId':None,'ordinal':None,'startMs':10,'endMs':None}
checks.append({'kind':'timing-order','name':'derived-kind-null-fields-remain-before-action-on-equal-time','ok':order(sample)<order({**sample,'kind':'action','admissionId':'a','ordinal':0})})
manifest=read(BASE/'manifest.json');require(sha(BASE/'manifest.json')=='0bf2a5a9ea32f79b27563809b68ba6e2de9f0ccbf2633f54302e2f3bd031e311','delegated exact manifest')
files=[{'file':f,'expected':v,'observed':sha(BASE/f),'ok':sha(BASE/f)==v}for f,v in manifest['files'].items()]
preserved=[]
for path,info in manifest['preservedManifests'].items():
    p=ROOT/path;require(sha(p)==info['sha256'],'previous manifest exact');m=read(p)
    for f,v in m['files'].items():
        source=ROOT/f if f.startswith('docs/')else p.parent/f;preserved.append({'file':str(source.relative_to(ROOT)),'ok':sha(source)==v})
receipt=read(BASE/'completion-receipt.json');sources=[{'file':f,'captured':v,'observed':sha(ROOT/f),'unchanged':sha(ROOT/f)==v}for f,v in receipt['sourceSnapshots'].items()]
old=ROOT/receipt['actualBaseline']['path'];require(sha(old)==receipt['actualBaseline']['sha256'],'actual historical migration receipt exact');migration=read(old)
require(migration['actualCaseCounts']=={'total':48,'passed':41,'failed':7,'errors':0,'skipped':0},'old actual scope preserved')
xml_path=ROOT/'docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/backend-migration48-attempt03-xml/TEST-com.citi.put.checks.studio.guided.GuidedReplayingPrefixMigrationIT.xml';xml=ET.parse(xml_path).getroot();xmlcounts={k:int(xml.attrib[k])for k in('tests','failures','errors','skipped')};require(xmlcounts=={'tests':48,'failures':7,'errors':0,'skipped':0},'actual raw XML counts')
result={'classification':'INDEPENDENT_ABSTRACT_STATE_AND_TIMING_DESIGN_ONLY','createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'manifestSha256':sha(BASE/'manifest.json'),'boundFiles':files,'preservedHistoricalFiles':preserved,'diagnosticSources':sources,'historicalMigration':{'receipt':str(old.relative_to(ROOT)),'sha256':sha(old),'xmlSha256':sha(xml_path),'actualXmlCounts':xmlcounts,'scope':'Old a4e0 V21 only; not proof of amendment.'},'checks':checks,'errors':[c for c in checks if not c['ok']]+[c for c in files+preserved if not c['ok']],'applicationTestsExecuted':0,'databaseCommandsExecuted':0,'browserCommandsExecuted':0,'buildCommandsExecuted':0}
result['status']='FAIL'if result['errors']else'PASS';(HERE/'independent-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':result['status'],'cases':len(checks),'boundFiles':len(files),'preservedFiles':len(preserved),'sourceDrift':[c['file']for c in sources if not c['unchanged']],'errors':result['errors']},indent=2));raise SystemExit(bool(result['errors']))

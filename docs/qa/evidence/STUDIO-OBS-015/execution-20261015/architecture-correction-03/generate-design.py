from pathlib import Path
import copy,json,hashlib
P=Path(__file__).resolve().parent
h=lambda x:hashlib.sha256(json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
def dump(n,x):(P/n).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
session='session-current';step='00000000-0000-4000-8000-000000000002'
request={'schemaVersion':3,'sessionId':session,'workerId':'worker-current','ownerFence':7,'scopeHash':'a'*64,'contextId':'same-recorded-context','contextRevision':1,'authoredInputsHash':'b'*64,'sourceRevision':'3','configurationRevision':'4','prefixProgramHash':'c'*64,'coordinate':{'stepId':step,'ordinal':0},'evidenceHash':'d'*64}
s={'sessionId':session,'state':'REPLAYING_PREFIX','continuation':'REPLAYING_PREFIX','originalPrincipal':'author-current','scopeHash':'a'*64,'sourceRevision':'3','configurationRevision':'4','frozenPolicyHash':'e'*64,'sideEffectStance':'CLARIFY_FIRST','plan':{'initialIndex':3,'switch':None,'programHash':'c'*64,'nextCoordinate':request['coordinate']},'owner':{'workerId':'worker-current','fence':7,'leaseExpiresAt':'2026-10-15T06:00:30Z'},'expiresAt':'2026-10-15T06:10:00Z','context':{'contextId':'same-recorded-context','contextRevision':1,'authoredInputsHash':'b'*64,'browserIdentity':'browser-once','recordingIdentity':'recording-once','clockOrigin':'one-origin','policyHash':'e'*64},'progress':{'documentId':'doc-current','generation':8,'evidenceHash':'d'*64,'stepIndex':1},'prefixRequests':{h(request):{'document':request,'status':'PREPARED'}},'counters':{'actions':0,'modelProposals':0,'modelInputTokens':0,'modelOutputTokens':0},'nativeInvocations':0,'hasInflightAction':False,'pendingDelivery':False}
q={'schemaVersion':3,'phase':'observed','clarificationId':'question-current','sessionId':session,'scopeHash':s['scopeHash'],'coordinate':request['coordinate'],'documentId':'doc-current','generation':8,'reason':'SIDE_EFFECT_CONFIRMATION','promptCode':'CONFIRM_ACTION','expiresAt':s['expiresAt'],'choices':[{'choiceId':'choice-current','safeLabel':'Click Save','labelSource':'AUTHORED','nodeId':'save-current','bindingId':None}]}
marker={'clarificationId':q['clarificationId'],'status':'PENDING','prefixRequestDigest':h(request)}
a={'schemaVersion':3,'clarificationId':q['clarificationId'],'choiceId':'choice-current','generation':8}
dump('interfaces.schema.json',{'$schema':'http://json-schema.org/draft-07/schema#','$id':'https://checks.citi.example/design/studio-obs-015/correction03-private-marker.schema.json','classification':'DESIGN PRIVATE JSON PROGRESS ONLY; no public or runner wire extension','type':'object','additionalProperties':False,'properties':{'clarificationId':{'type':'string','minLength':1,'maxLength':256},'status':{'enum':['PENDING','CONFIRMED']},'prefixRequestDigest':{'type':'string','pattern':'^[a-f0-9]{64}$'}},'required':['clarificationId','status','prefixRequestDigest']})
stateCases=[]
def case(name,initial=None,decision='CONFIRM',operation='ask',answer=None,caller='author-current',expected='ACCEPT'):
 stateCases.append({'name':name,'initial':copy.deepcopy(initial or s),'decision':decision,'operation':operation,'question':q,'marker':marker,'answer':answer or a,'caller':caller,'now':'2026-10-15T06:00:01Z','expected':expected})
case('default-prefix-asks-current-question-and-model0')
allow=copy.deepcopy(s);allow['sideEffectStance']='ALLOW';case('explicit-allow-prefix-skips-question',allow,decision='ALLOW',operation='guard')
deny=copy.deepcopy(s);deny['sideEffectStance']='DENY';case('deny-prefix-stops-with-policy-refusal',deny,decision='DENY',operation='guard',expected='TERMINAL_POLICY_DENIED')
case('ungrounded-current-target-stops-even-old-base-was-authorized',decision='UNGROUNDED',operation='guard',expected='TERMINAL_POLICY_DENIED')
consented=copy.deepcopy(s);consented['progress']['sideEffectConfirmation']={'clarificationId':'earlier-current-session-question','status':'CONFIRMED','prefixRequestDigest':h(request)};case('destructive-current-target-stops-even-session-confirmed',consented,decision='DESTRUCTIVE',operation='guard',expected='TERMINAL_POLICY_DENIED')
waiting=copy.deepcopy(s);waiting['state']='AWAITING_CLARIFICATION';waiting['progress']['clarification']=q;waiting['progress']['sideEffectConfirmation']=marker
case('accept-current-answer-resumes-prefix-with-refresh-required',waiting,operation='answer')
case('pending-prefix-never-reserves-model-while-awaiting',waiting,operation='model',expected='REJECT')
case('pending-prefix-never-admits-action-while-awaiting',waiting,operation='admit',expected='REJECT')
case('pending-prefix-coordinator-returns-no-work',waiting,operation='poll')
for name,mutate in [('wrong-question',lambda x:x.update({'clarificationId':'old-question'})),('wrong-choice',lambda x:x.update({'choiceId':'old-choice'})),('stale-generation',lambda x:x.update({'generation':7}))]:
 bad=copy.deepcopy(a);mutate(bad);case(name,waiting,operation='answer',answer=bad,expected='REJECT')
case('wrong-user-cannot-confirm',waiting,operation='answer',caller='different-author',expected='REJECT')
for name,mutate in [('changed-document',lambda x:x['progress'].update({'documentId':'other-doc'})),('changed-owner-fence',lambda x:x['owner'].update({'fence':8})),('lost-live-lease',lambda x:x['owner'].update({'leaseExpiresAt':'2026-10-15T06:00:00Z'})),('changed-source',lambda x:x.update({'sourceRevision':'5'})),('wrong-policy-hash',lambda x:x['context'].update({'policyHash':'f'*64})),('changed-context',lambda x:x['context'].update({'contextId':'other-context'})),('wrong-prefix-request',lambda x:x['progress']['sideEffectConfirmation'].update({'prefixRequestDigest':'f'*64})),('hidden-inflight-action',lambda x:x.update({'hasInflightAction':True})),('generic-model-question-cannot-escape-prefix',lambda x:x['progress']['clarification'].update({'reason':'AMBIGUOUS_TARGET'})),('forged-marker-extra-field',lambda x:x['progress']['sideEffectConfirmation'].update({'confirmedByModel':True}))]:
 bad=copy.deepcopy(waiting);mutate(bad);case(name,bad,operation='answer',expected='REJECT')
for state in ['CANCELLED','EXPIRED','UNKNOWN_OUTCOME']:
 bad=copy.deepcopy(waiting);bad['state']=state;case('terminal-'+state.lower()+'-cannot-resume',bad,operation='answer',expected='REJECT')
case('cancel-during-wait-closes-without-native-or-model',waiting,operation='cancel')
case('same-owner-renewal-retains-question-context-and-clock',waiting,operation='renew')
confirmed=copy.deepcopy(waiting);confirmed['state']='REPLAYING_PREFIX';confirmed['progress'].pop('clarification');confirmed['progress']['sideEffectConfirmation']['status']='CONFIRMED'
case('old-preconfirmation-preparation-cannot-admit',confirmed,operation='admit',expected='REJECT')
case('postconfirmation-refresh-invalidates-old-proof-same-browser',confirmed,operation='refresh')
fresh=copy.deepcopy(confirmed);fresh['progress'].update({'generation':9,'evidenceHash':'9'*64});case('fresh-postconfirmation-proposal-can-pass-guard',fresh,operation='admit')
# Current session marker only; a base-side consent value is never copied into progress.
baseconsent=copy.deepcopy(s);baseconsent['baseHistoricalConfirmation']='CONFIRMED';case('base-confirmation-is-not-current-session-consent',baseconsent)
timings=[{'kind':'action','stepId':step,'ordinal':0,'admissionId':'attempt-A','startMs':100,'endMs':100},{'kind':'action','stepId':step,'ordinal':0,'admissionId':'attempt-B','startMs':100,'endMs':101}]
ledger={t['admissionId']:{'stepId':step,'ordinal':0,'dispatchCount':1} for t in timings}
timingCases=[{'name':'legal-distinct-admission-tie','items':timings,'ledger':ledger,'expected':'ACCEPT'},{'name':'duplicate-admission-still-rejected','items':[timings[0],timings[0]],'ledger':ledger,'expected':'REJECT'},{'name':'reversed-total-order-still-rejected','items':list(reversed(timings)),'ledger':ledger,'expected':'REJECT'}]
for name,patch in [('wrong-ledger-coordinate',{'stepId':'foreign-step'}),('undispatched-admission',{'dispatchCount':0})]:
 bad=copy.deepcopy(ledger);bad['attempt-B'].update(patch);timingCases.append({'name':name,'items':timings,'ledger':bad,'expected':'REJECT'})
nulltie=copy.deepcopy(timings);nulltie[1]['endMs']=None;timingCases.append({'name':'null-end-preserved-on-legal-tie','items':nulltie,'ledger':ledger,'expected':'ACCEPT'})
scalar=copy.deepcopy(timings);scalar[0]['admissionId']='\ue000';scalar[1]['admissionId']='\U00010000';timingCases.append({'name':'admission-tie-break-is-codepoint-not-utf16-locale','items':scalar,'ledger':{t['admissionId']:{'stepId':step,'ordinal':0,'dispatchCount':1} for t in scalar},'expected':'ACCEPT'})
dump('fixtures.json',{'classification':'ABSTRACT STATE/TIMING DESIGN PROOFS ONLY; no real guard invocation, callback auth, SQL, clock or recording execution','stateCases':stateCases,'timingCases':timingCases,'oldTimingCounterexample':{'items':timings,'equalOldKeys':True,'distinctAdmissions':True,'ledgerDispatchCounts':[1,1]},'guardCompositionBoundary':'Actual shared GuidedActionGuard must produce these abstract decisions from the fresh observation/proposal/frozen policy. Synthetic cases do not replace its real grounding/destructive/form-membership integration tests.','timingObservationLimit':'These are legal synthetic ledger/readings, not observed current runner output. Current runtime stamps only when native dispatch begins, so an unmeasured pre-native refusal MUST NOT be assigned a fabricated timestamp just to exercise this case.'})
print('Generated',len(stateCases),'state cases and',len(timingCases),'timing cases')

from pathlib import Path
import copy,json,hashlib
P=Path(__file__).resolve().parent
ROOT=P.parents[5]
C=ROOT/'docs/specs/studio-observed-authoring/contracts/v3'
BASE='https://checks.citi.example/contracts/observed/v3/'
SID='https://checks.citi.example/design/studio-obs-015/final-interfaces.schema.json'
def dump(n,o): (P/n).write_text(json.dumps(o,indent=2,ensure_ascii=False)+'\n')
def canon(o): return json.dumps(o,sort_keys=True,ensure_ascii=False,separators=(',',':'))
def h(o):return hashlib.sha256(canon(o).encode()).hexdigest()
def obj(p,req=None):return {'type':'object','additionalProperties':False,'properties':p,'required':list(p) if req is None else req}
def arr(s,maxn,minn=0,unique=False):return {'type':'array','items':s,'minItems':minn,'maxItems':maxn,**({'uniqueItems':True} if unique else {})}
def ref(n):return {'$ref':'#/definitions/'+n}
def ext(n):return {'$ref':BASE+n}
def nullable(v):return {'oneOf':[v,{'type':'null'}]}
S={'type':'string','minLength':1,'maxLength':256}; U={'type':'string','pattern':'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'}; H={'type':'string','pattern':'^[a-f0-9]{64}$'}; R={'type':'string','pattern':'^(0|[1-9][0-9]{0,18})$'}; I={'type':'integer','minimum':1,'maximum':2147483647}; A={'type':'string','minLength':1,'maxLength':64}; SEC={'type':'string','pattern':'^[A-Za-z0-9_.-]{1,64}$','not':{'enum':['.','..']}}
D={}
D['Coordinate']=obj({'stepId':U,'ordinal':{'type':'integer','minimum':0,'maximum':7}})
D['PlainDeclaration']=obj({'referenceId':A,'kind':{'const':'plain'},'valueHash':H})
D['SecretDeclaration']=obj({'referenceId':A,'kind':{'const':'secretRef'},'secretId':SEC})
D['Declaration']={'oneOf':[ref('PlainDeclaration'),ref('SecretDeclaration')]}
D['RevisionReferences']=obj({'variables':arr(A,200,unique=True),'secrets':arr(SEC,64,unique=True),'authoringIdentityVersion':{'const':1},'authoredDeclarations':arr(ref('Declaration'),500)})
D['ReusedFrom']=obj({'revisionId':U,'stepId':U})
D['SnapshotMap']={'type':'object','maxProperties':100,'propertyNames':U,'additionalProperties':H}
D['ReuseMap']={'type':'object','maxProperties':100,'propertyNames':U,'additionalProperties':ref('ReusedFrom')}
D['RelearnedFrom']=obj({'stepId':U,'driftSwitchStepId':U},['stepId'])
D['IncrementalMetadata']=obj({'baseRevisionId':U,'initialFirstLearnStepId':U,'effectiveFirstLearnStepId':U,'retainedPrefixAdmissionIds':arr(S,200,unique=True),'driftReceiptHash':nullable(H)})
D['PrefixAction']=obj({'coordinate':ref('Coordinate'),'origin':nullable({'type':'string','format':'uri','maxLength':256}),'locator':ext('learned-plan.schema.json#/definitions/observedAction/properties/locator'),'operation':ext('action.schema.json#/properties/operation'),'operationHash':H,'guard':ext('replay-operation.schema.json#/definitions/Guard')})
D['PrefixProgram']=obj({'schemaVersion':{'const':3},'baseRevisionId':U,'baseRevisionDigest':H,'sourceStepIds':arr(U,99,unique=True),'actions':arr(ref('PrefixAction'),200)})
D['RelearnPlan']=obj({'schemaVersion':{'const':3},'sessionId':S,'testId':U,'csiId':{'type':'string','minLength':1,'maxLength':20},'baseRevisionId':U,'initialFirstLearnStepId':U,'initialFirstLearnIndex':{'type':'integer','minimum':0,'maximum':99},'prefixProgramHash':H})
common={'schemaVersion':{'const':3},'sessionId':S,'workerId':S,'ownerFence':I,'scopeHash':H,'contextId':S,'contextRevision':{'type':'integer','minimum':1,'maximum':201},'authoredInputsHash':H,'sourceRevision':R,'configurationRevision':R}
D['PrefixRequestIdentity']=obj({**common,'prefixProgramHash':H,'coordinate':ref('Coordinate'),'evidenceHash':H})
D['PrefixPrepare']=obj({'kind':{'const':'prefix'},'request':ref('PrefixRequestIdentity'),'requestDigest':H})
receipt={**D['PrefixRequestIdentity']['properties'],'requestDigest':H,'operationHash':H,'attemptOrdinal':{'const':0},'nativeInvocationStarted':{'const':False},'reason':{'enum':['TARGET_DRIFT','LOCATOR_AMBIGUOUS','STALE_GENERATION']},'receiptHash':H}
D['PreAdmissionDrift']=obj({**receipt,'phase':{'const':'PRE_ADMISSION'},'admissionId':{'type':'null'},'preparationId':{'type':'null'}})
D['AdmittedDrift']=obj({**receipt,'phase':{'const':'ADMITTED_PRE_INVOCATION'},'admissionId':S,'preparationId':S})
D['DriftReceipt']={'oneOf':[ref('PreAdmissionDrift'),ref('AdmittedDrift')]}
D['PrefixPrepareResult']={'oneOf':[obj({'kind':{'const':'PREPARED'},'requestDigest':H,'proposal':ext('action.schema.json'),'preparation':ext('bridge.schema.json#/definitions/preparation')}),obj({'kind':{'const':'WAIT'},'requestDigest':H,'evidenceHash':H}),obj({'kind':{'const':'DRIFT'},'requestDigest':H,'receipt':ref('PreAdmissionDrift')})]}
D['PrefixDriftCallback']=obj({'kind':{'const':'prefixDrift'},'receipt':ref('DriftReceipt'),'ledger':nullable(ext('ledger.schema.json'))})
D['MaterializationVersion']=obj({**common,'inputCount':{'type':'integer','minimum':0,'maximum':200},'previousInputsHash':nullable(H),'birthMaterializationRevision':I})
D['MaterializationEntry']=obj({'sessionId':S,'inputOrdinal':{'type':'integer','minimum':0,'maximum':199},'inputId':S,'introducedContextRevision':{'type':'integer','minimum':1,'maximum':201},'document':ext('authored-inputs.schema.json#/properties/inputs/items')})
D['ContextDelivery']=obj({'schemaVersion':{'const':3},'sessionId':S,'contextRevision':{'type':'integer','minimum':2,'maximum':201},'authoredInputsHash':H,'materializationRevision':I,'contextHash':H,'deliveryId':U})
D['ContextAcknowledgement']=obj({**common,'materializationRevision':I,'contextHash':H,'deliveryId':U})
D['Switch']=obj({'schemaVersion':{'const':3},'sessionId':S,'baseRevisionId':U,'initialFirstLearnStepId':U,'effectiveFirstLearnStepId':U,'effectiveFirstLearnIndex':{'type':'integer','minimum':0,'maximum':99},'nextSemanticOrdinal':{'type':'integer','minimum':0,'maximum':7},'completedPrefixCount':{'type':'integer','minimum':0,'maximum':99},'reason':{'enum':['BOUNDARY','DRIFT','EMPTY_PREFIX']},'driftReceiptHash':nullable(H),'retainedPrefixAdmissionIds':arr(S,200,unique=True),'retainedPrefixAdmissionsHash':H})
D['FirstSuffixAcceptance']=obj({'sessionId':S,'previousPlanRevision':{'type':'integer','minimum':0,'maximum':9007199254740990},'planRevision':{'type':'integer','minimum':1,'maximum':9007199254740991},'retainedPrefixAdmissionIds':arr(S,200,unique=True)})
D['LearningWindow']=obj({'firstLearnStepId':U,'learnableStepIds':arr(U,100,1,True),'nextSemanticOrdinal':{'type':'integer','minimum':0,'maximum':7},'completedCoordinates':arr(ref('Coordinate'),200,unique=True),'availableBindingIds':arr(S,32,unique=True)})
D['StepInput']=obj({'domain':{'const':'studio.step-input'},'version':{'const':1},'stepId':U,'text':{'type':'string','minLength':1,'maxLength':4000},'context':{'type':'object'},'references':arr(ref('Declaration'),500)})
D['TestConfig']=obj({'domain':{'const':'studio.test-config'},'version':{'const':1},'environment':S,'browser':{'const':'chromium'},'viewport':obj({'width':{'type':'integer','minimum':320,'maximum':3840},'height':{'type':'integer','minimum':240,'maximum':2160}}),'timeoutSeconds':{'type':'integer','minimum':1,'maximum':120},'waitStrategy':{'enum':['none','load','domcontentloaded','networkidle']},'globalContextHash':H,'globalReferences':arr(ref('Declaration'),500)})
D['StepChain']=obj({'domain':{'const':'studio.step-chain'},'version':{'const':1},'stepId':U,'stepInputHash':H,'previous':H})
D['StepSnapshot']=obj({'domain':{'const':'studio.step-snapshot'},'version':{'const':1},'stepId':U,'inputChain':H,'learnedStepHash':H})
D['LearnedContent']=obj({'actions':{'type':'array','maxItems':8,'items':{'type':'object'}},'producedBindings':{'type':'array','maxItems':32,'items':{'type':'object'}},'consumedBindings':{'type':'array','maxItems':200,'items':{'type':'object'}}})
D['PublishedBinding']=copy.deepcopy(json.loads((C/'binding.schema.json').read_text()));D['PublishedBinding'].pop('$id',None);D['PublishedBinding'].pop('$schema',None);D['PublishedBinding']['properties']['consumers']['minItems']=0
D['NativeFenceEvent']=obj({'schemaVersion':{'const':3},'sessionId':S,'contextId':S,'ownerFence':I,'admissionId':S,'operationHash':H,'state':{'enum':['INVOKING','REFUSED_BEFORE_INVOCATION']},'receiptHash':nullable(H)})
D['FinalLedger']=copy.deepcopy(json.loads((C/'ledger.schema.json').read_text()));D['FinalLedger'].pop('$id',None);D['FinalLedger'].pop('$schema',None);D['FinalLedger']['properties']['attemptOrdinal']={'type':'integer','minimum':0,'maximum':1};D['FinalLedger']['required'].append('attemptOrdinal')
D['InputEvidenceMetadata']=copy.deepcopy(json.loads((C/'authored-inputs.schema.json').read_text())['properties']['inputs']['items'])
for branch in D['InputEvidenceMetadata']['oneOf']:
 branch['properties'].pop('value',None);branch['required']=[x for x in branch['required'] if x!='value']
D['InputEvidenceEntry']=obj({'inputOrdinal':{'type':'integer','minimum':0,'maximum':199},'inputId':S,'introducedContextRevision':{'type':'integer','minimum':1,'maximum':201},'inputHash':H,'metadata':ref('InputEvidenceMetadata')})
D['MaterializationEvidence']=obj({'versions':arr(ref('MaterializationVersion'),201,1),'entries':arr(ref('InputEvidenceEntry'),200)})
D['EffectiveActionFact']=obj({'obligationId':S,'preparationId':S,'ledger':ref('FinalLedger')})
D['FinalPreparationFact']=copy.deepcopy(json.loads((C/'replay-validation.schema.json').read_text())['definitions']['PreparationFact']);D['FinalPreparationFact']['properties']['materializationRevision']=I;D['FinalPreparationFact']['required'].append('materializationRevision')
D['ExcludedAttemptFact']=obj({'action':ref('EffectiveActionFact'),'preparation':ref('FinalPreparationFact'),'obligationAssociation':ext('replay-validation.schema.json#/definitions/ValidationBasis/properties/obligationAssociations/items')})
D['IncrementalEvidence']=obj({'plan':ref('RelearnPlan'),'program':ref('PrefixProgram'),'switch':ref('Switch'),'prefixRequests':arr(ref('PrefixRequestIdentity'),400),'driftReceipt':nullable(ref('DriftReceipt')),'firstSuffixAcceptance':ref('FirstSuffixAcceptance'),'excludedAttempts':arr(ref('ExcludedAttemptFact'),1)})
D['FinalValidationBasis']=copy.deepcopy(json.loads((C/'replay-validation.schema.json').read_text())['definitions']['ValidationBasis']);D['FinalValidationBasis']['properties']['actions']['items']=ref('EffectiveActionFact');D['FinalValidationBasis']['properties']['preparations']['items']=ref('FinalPreparationFact');D['FinalValidationBasis']['properties']['materializationEvidence']=ref('MaterializationEvidence');D['FinalValidationBasis']['properties']['incrementalEvidence']=nullable(ref('IncrementalEvidence'));D['FinalValidationBasis']['required']+=['materializationEvidence','incrementalEvidence']
D['PublicationEvidencePreimage']=obj({'version':{'const':1},'basisHash':H,'runAuthorizationHash':H,'translationHash':H,'bootstrapHash':H,'sourceManifestHash':H})
D['SnapshotMap']['minProperties']=1
D['MaterializationVersion']['allOf']=[{'if':{'properties':{'contextRevision':{'const':1}}},'then':{'properties':{'previousInputsHash':{'type':'null'}}},'else':{'properties':{'previousInputsHash':H}}}]
D['ContextAcknowledgement']['properties']['contextRevision']={'type':'integer','minimum':2,'maximum':201}
D['NativeFenceEvent']['allOf']=[{'if':{'properties':{'state':{'const':'INVOKING'}}},'then':{'properties':{'receiptHash':{'type':'null'}}},'else':{'properties':{'receiptHash':H}}}]
D['Switch']['allOf']=[{'if':{'properties':{'reason':{'const':'DRIFT'}}},'then':{'properties':{'driftReceiptHash':H}},'else':{'properties':{'driftReceiptHash':{'type':'null'},'nextSemanticOrdinal':{'const':0}}}},{'if':{'properties':{'reason':{'const':'EMPTY_PREFIX'}}},'then':{'properties':{'effectiveFirstLearnIndex':{'const':0},'completedPrefixCount':{'const':0},'retainedPrefixAdmissionIds':{'maxItems':0}}}}]
D['PrefixDriftCallback']['allOf']=[{'if':{'properties':{'receipt':{'properties':{'phase':{'const':'PRE_ADMISSION'}}}}},'then':{'properties':{'ledger':{'type':'null'}}},'else':{'properties':{'ledger':ref('FinalLedger')}}}]
schema={'$schema':'http://json-schema.org/draft-07/schema#','$id':SID,'title':'STUDIO-OBS-015 final new interface definitions; design artifact, C-int integrates in the one v3 generation','definitions':D}
dump('interfaces.schema.json',schema)
# All new shapes and canonical algorithms are backed by explicit complete fixture values.
fx=[];vectors=[]
def add(name,definition,value,valid=True):fx.append({'name':name,'definition':definition,'value':value,'valid':valid})
def vector(name,value):vectors.append({'name':name,'input':value,'canonical':canon(value),'canonicalUtf8Hex':canon(value).encode().hex(),'sha256':h(value)});return h(value)
uid=lambda n:f'00000000-0000-4000-8000-{n:012d}'
ctx={'entries':[],'evidenceReferences':[]};refs={'variables':['ACCOUNT'],'secrets':['LOGIN_PASSWORD'],'authoringIdentityVersion':1,'authoredDeclarations':[{'referenceId':'ACCOUNT','kind':'plain','valueHash':h('  Café 🧪 e\u0301  ')},{'referenceId':'LOGIN_PASSWORD','kind':'secretRef','secretId':'LOGIN_PASSWORD'},{'referenceId':'vault://studio/customer-password','kind':'secretRef','secretId':'LOGIN_PASSWORD'}]}
add('complete-authored-declarations','RevisionReferences',refs);vector('complete-authored-declarations',refs)
refs_unicode=[{'referenceId':'\ue000','kind':'plain','valueHash':h('BMP')},{'referenceId':'\U00010000','kind':'plain','valueHash':h('astral')}];refs_unicode.sort(key=lambda x:x['referenceId'].encode());vector('utf8-reference-order-BMP-before-astral',refs_unicode)
config={'domain':'studio.test-config','version':1,'environment':'test','browser':'chromium','viewport':{'width':1280,'height':720},'timeoutSeconds':30,'waitStrategy':'domcontentloaded','globalContextHash':h(ctx),'globalReferences':[]};add('config','TestConfig',config);vector('test-config',config)
fixture=json.loads((C/'publication-fixtures.json').read_text());old=fixture['artifact']['learnedPlan'];program={'schemaVersion':3,'baseRevisionId':uid(901),'baseRevisionDigest':'a'*64,'sourceStepIds':old['sourceSteps'][:2],'actions':[]}
for i,a in enumerate(old['actions'][:2]):program['actions'].append({k:v for k,v in a.items() if k!='admissionId'}|{'guard':fixture['artifact']['guards'][i]})
add('prefix-program','PrefixProgram',program);program_hash=vector('prefix-program',program)
plan={'schemaVersion':3,'sessionId':'session-new','testId':uid(900),'csiId':'CSI-1','baseRevisionId':uid(901),'initialFirstLearnStepId':uid(3),'initialFirstLearnIndex':2,'prefixProgramHash':program_hash};add('relearn-plan','RelearnPlan',plan);vector('relearn-plan',plan)
input1={'inputId':'input-destination','sourceStepId':uid(1),'kind':'destination','intendedSlot':'navigate.destination','value':'https://orders.example.test/start','provenance':{'referenceKind':'sourceSpan','sourceRevision':'2','stepId':uid(1),'startUtf16':3,'endUtf16':36,'kind':'destination','intendedSlot':'navigate.destination'}}
input2={'inputId':'input-label-new','sourceStepId':uid(3),'kind':'nonsecretText','intendedSlot':'fill.value','value':'new tail','provenance':{'referenceKind':'sourceSpan','sourceRevision':'2','stepId':uid(3),'startUtf16':5,'endUtf16':13,'kind':'nonsecretText','intendedSlot':'fill.value'}}
inputsec={'inputId':'input-secret-stable','sourceStepId':uid(2),'kind':'secretRef','intendedSlot':'fill.value','secretId':'LOGIN_PASSWORD','provenance':{'referenceKind':'configuration','configurationRevision':'1','stepId':uid(2),'referenceId':'cfg-secret','kind':'secretRef','intendedSlot':'fill.value','referenceName':'LOGIN_PASSWORD'}}
base_inputs={'schemaVersion':3,'sessionId':'session-new','scopeHash':'b'*64,'sourceRevision':'2','configurationRevision':'1','inputs':[input1,inputsec]};new_inputs={**base_inputs,'inputs':[input1,inputsec,input2]};hash1=vector('materialization-full-v1',base_inputs);hash2=vector('materialization-full-v2',new_inputs)
common_value={'schemaVersion':3,'sessionId':'session-new','workerId':'worker-1','ownerFence':1,'scopeHash':'b'*64,'contextId':'recorded-context','contextRevision':1,'authoredInputsHash':hash1,'sourceRevision':'2','configurationRevision':'1'}
v1={**common_value,'inputCount':2,'previousInputsHash':None,'birthMaterializationRevision':1};v2={**v1,'contextRevision':2,'authoredInputsHash':hash2,'inputCount':3,'previousInputsHash':hash1,'birthMaterializationRevision':6};add('version1','MaterializationVersion',v1);add('version2','MaterializationVersion',v2);vector('materialization-header-v1',v1);vector('materialization-header-v2',v2)
for ordinal,doc in enumerate(new_inputs['inputs']):add('entry-'+str(ordinal),'MaterializationEntry',{'sessionId':'session-new','inputOrdinal':ordinal,'inputId':doc['inputId'],'introducedContextRevision':1 if ordinal<2 else 2,'document':doc})
request={**common_value,'prefixProgramHash':program_hash,'coordinate':{'stepId':uid(2),'ordinal':0},'evidenceHash':'c'*64};request_hash=vector('prefix-request-identity',request);add('prefix-request','PrefixRequestIdentity',request);add('prefix-prepare','PrefixPrepare',{'kind':'prefix','request':request,'requestDigest':request_hash})
pre={**request,'requestDigest':request_hash,'operationHash':program['actions'][1]['operationHash'],'attemptOrdinal':0,'nativeInvocationStarted':False,'reason':'TARGET_DRIFT','phase':'PRE_ADMISSION','admissionId':None,'preparationId':None};pre['receiptHash']=h(pre);add('pre-admission-drift','DriftReceipt',pre);vector('pre-admission-drift-body',{k:v for k,v in pre.items() if k!='receiptHash'})
admitted={**pre,'phase':'ADMITTED_PRE_INVOCATION','admissionId':'admission-spent','preparationId':'preparation-spent'};admitted['receiptHash']=h({k:v for k,v in admitted.items() if k!='receiptHash'});add('admitted-drift','DriftReceipt',admitted);vector('admitted-drift-body',{k:v for k,v in admitted.items() if k!='receiptHash'})
for name,patch in [('native-started',{'nativeInvocationStarted':True}),('policy-is-not-drift',{'reason':'POLICY_REFUSED'}),('third-attempt',{'attemptOrdinal':2}),('pre-with-admission',{'phase':'PRE_ADMISSION'})]:add(name,'DriftReceipt',{**admitted,**patch},False)
add('prepare-wait','PrefixPrepareResult',{'kind':'WAIT','requestDigest':request_hash,'evidenceHash':'c'*64});add('prepare-drift','PrefixPrepareResult',{'kind':'DRIFT','requestDigest':request_hash,'receipt':pre});add('pre-drift-callback','PrefixDriftCallback',{'kind':'prefixDrift','receipt':pre,'ledger':None})
switch={'schemaVersion':3,'sessionId':'session-new','baseRevisionId':uid(901),'initialFirstLearnStepId':uid(3),'effectiveFirstLearnStepId':uid(2),'effectiveFirstLearnIndex':1,'nextSemanticOrdinal':0,'completedPrefixCount':1,'reason':'DRIFT','driftReceiptHash':admitted['receiptHash'],'retainedPrefixAdmissionIds':['admission-prefix-0'],'retainedPrefixAdmissionsHash':h(['admission-prefix-0'])};add('drift-switch','Switch',switch);vector('drift-switch',switch)
add('relearned-from-drift-j','RelearnedFrom',{'stepId':uid(2),'driftSwitchStepId':uid(2)})
inc={'baseRevisionId':uid(901),'initialFirstLearnStepId':uid(3),'effectiveFirstLearnStepId':uid(2),'retainedPrefixAdmissionIds':['admission-prefix-0'],'driftReceiptHash':admitted['receiptHash']};add('incremental-metadata','IncrementalMetadata',inc);vector('incremental-metadata',inc)
add('suffix-acceptance','FirstSuffixAcceptance',{'sessionId':'session-new','previousPlanRevision':1,'planRevision':2,'retainedPrefixAdmissionIds':['admission-prefix-0']})
delivery={'schemaVersion':3,'sessionId':'session-new','contextRevision':2,'authoredInputsHash':hash2,'materializationRevision':6,'contextHash':'d'*64,'deliveryId':uid(902)};add('context-delivery','ContextDelivery',delivery);add('context-ack','ContextAcknowledgement',{**common_value,'contextRevision':2,'authoredInputsHash':hash2,'materializationRevision':6,'contextHash':'d'*64,'deliveryId':uid(902)})
add('learning-window','LearningWindow',{'firstLearnStepId':uid(2),'learnableStepIds':[uid(2),uid(3)],'nextSemanticOrdinal':0,'completedCoordinates':[{'stepId':uid(1),'ordinal':0}],'availableBindingIds':[]})
# Final learned content projection, using complete valid historical graph metadata.
def content(actions,bindings,step):
 aa=[{k:v for k,v in a.items() if k!='admissionId'} for a in actions if a['coordinate']['stepId']==step];aa.sort(key=lambda a:a['coordinate']['ordinal'])
 prod=[];cons=[]
 for b in bindings:
  if b['producer']['stepId']==step:
   x=copy.deepcopy(b);x.pop('consumers');x['provenance'].pop('sessionId');x['provenance'].pop('producerAdmissionId');prod.append(x)
  for e in b['consumers']:
   if e['coordinate']['stepId']==step:cons.append({k:v for k,v in e.items() if k not in ['producerAdmissionId','consumerAdmissionId']})
 prod.sort(key=lambda b:(b['producer']['ordinal'],b['bindingId'].encode()));cons.sort(key=lambda e:(e['coordinate']['ordinal'],e['argumentSlot'].encode(),e['bindingId'].encode()))
 return {'actions':aa,'producedBindings':prod,'consumedBindings':cons}
oldcontent=content(old['actions'],old['bindings'],uid(2));newbindings=copy.deepcopy(old['bindings']);newbindings[0]['consumers']=[];sameproducer=content(old['actions'],newbindings,uid(2));assert oldcontent==sameproducer
add('retained-producer-with-zero-consumers','PublishedBinding',newbindings[0]);add('native-fence-refused','NativeFenceEvent',{'schemaVersion':3,'sessionId':'session-new','contextId':'recorded-context','ownerFence':1,'admissionId':'admission-spent','operationHash':admitted['operationHash'],'state':'REFUSED_BEFORE_INVOCATION','receiptHash':admitted['receiptHash']});vector('producer-before-consumer-deletion',oldcontent);vector('producer-after-last-consumer-deletion',sameproducer);vector('consumer-before-deletion',content(old['actions'],old['bindings'],uid(3)));vector('consumer-after-edge-removal',content(old['actions'],newbindings,uid(3)))
# Ten-step causal chain: stable learned content, exact edit4 propagates only 4..10.
chain_cases={}
for changed,label in [(False,'base'),(True,'edit4')]:
 prev=h(config);rows=[]
 for n in range(1,11):
  sid=uid(n);ip={'domain':'studio.step-input','version':1,'stepId':sid,'text':f'Step {n}'+(' edited' if changed and n==4 else ''),'context':ctx,'references':[]};chain={'domain':'studio.step-chain','version':1,'stepId':sid,'stepInputHash':h(ip),'previous':prev};op={'coordinate':{'stepId':sid,'ordinal':0},'origin':'https://orders.example.test','locator':{'kind':'testId','value':'button-'+str(n),'exact':True},'operation':{'kind':'click'}};learned={'actions':[{**op,'operationHash':h(op)}],'producedBindings':[],'consumedBindings':[]};snap={'domain':'studio.step-snapshot','version':1,'stepId':sid,'inputChain':h(chain),'learnedStepHash':h(learned)};rows.append({'stepId':sid,'stepInput':ip,'chain':chain,'learnedContent':learned,'snapshot':snap,'snapshotHash':h(snap)});prev=h(chain)
  if n==1 and not changed:
   for nm,de,val in [('step-input','StepInput',ip),('step-chain','StepChain',chain),('learned-content','LearnedContent',learned),('step-snapshot','StepSnapshot',snap)]:add(nm,de,val);vector(nm,val)
 chain_cases[label]=rows
map0={r['stepId']:r['snapshotHash'] for r in chain_cases['base']};add('snapshot-map','SnapshotMap',map0);add('reuse-map','ReuseMap',{uid(i):{'revisionId':uid(901),'stepId':uid(i)} for i in range(1,4)})
add('invalid-snapshot-short-hash','SnapshotMap',{uid(1):'abc'},False)
add('invalid-version-overflow','MaterializationVersion',{**v2,'contextRevision':202},False)
add('dot-secret-id-forbidden','Declaration',{'referenceId':'x','kind':'secretRef','secretId':'.'},False)
add('unsupported-browser','TestConfig',{**config,'browser':'firefox'},False)
add('too-small-viewport','TestConfig',{**config,'viewport':{'width':1,'height':1}},False)
add('secret-value-forbidden','Declaration',{'referenceId':'x','kind':'secretRef','secretId':'LOGIN_PASSWORD','value':'must-not-exist'},False)
vector('exact-controls-no-normalization',{'text':'é e\u0301 🧪\u0001\n'})
incremental_evidence={'plan':plan,'program':program,'switch':{**switch,'driftReceiptHash':pre['receiptHash']},'prefixRequests':[request],'driftReceipt':pre,'firstSuffixAcceptance':{'sessionId':'session-new','previousPlanRevision':1,'planRevision':2,'retainedPrefixAdmissionIds':['admission-prefix-0']},'excludedAttempts':[]};add('complete-pre-admission-incremental-evidence','IncrementalEvidence',incremental_evidence);vector('incremental-evidence-pre-admission',incremental_evidence)
# Complete ordinary first-learn basis extension from the repository's canonical fixture.
fullbasis=copy.deepcopy(fixture['basis'])
for af in fullbasis['actions']:af['ledger']['attemptOrdinal']=0
for pf in fullbasis['preparations']:pf['materializationRevision']=1
private=[]
for ix in fullbasis['inputs']:
 value=next(x['value'] for x in fixture['execute']['inputs'] if x['inputId']==ix['inputId'])
 private.append({'inputId':ix['inputId'],'sourceStepId':ix['stepId'],'kind':ix['kind'],'intendedSlot':ix['intendedSlot'],'provenance':ix['provenance'],'value':value})
private_envelope={'schemaVersion':3,'sessionId':fullbasis['sessionId'],'scopeHash':h(fullbasis['scope']),'sourceRevision':fullbasis['sourceRevision'],'configurationRevision':fullbasis['configurationRevision'],'inputs':private}
header={'schemaVersion':3,'sessionId':fullbasis['sessionId'],'workerId':fullbasis['preparations'][0]['proof']['workerId'],'ownerFence':fullbasis['bootstrap']['ownerFence'],'scopeHash':h(fullbasis['scope']),'contextId':fullbasis['bootstrap']['contextId'],'contextRevision':1,'authoredInputsHash':h(private_envelope),'sourceRevision':fullbasis['sourceRevision'],'configurationRevision':fullbasis['configurationRevision'],'inputCount':len(private),'previousInputsHash':None,'birthMaterializationRevision':1}
# Repair every commitment affected by private-input reconstruction, before hashing the basis.
old_inputs_hash=fullbasis['authoredInputsHash']
def replace_hash(node,oldhash,newhash):
 if isinstance(node,dict):return {k:replace_hash(v,oldhash,newhash) for k,v in node.items()}
 if isinstance(node,list):return [replace_hash(v,oldhash,newhash) for v in node]
 return newhash if node==oldhash else node
fullbasis=replace_hash(fullbasis,old_inputs_hash,h(private_envelope))
for preparation in fullbasis['preparations']:
 old_digest=preparation['proof']['requestDigest'];new_digest=h(preparation['proposal'])
 fullbasis=replace_hash(fullbasis,old_digest,new_digest)
for action in fullbasis['actions']:
 prep=next(p for p in fullbasis['preparations'] if p['preparationId']==action['preparationId'])
 action['ledger']['admission']['policyDecisionHash']=h({'scopeHash':h(fullbasis['scope']),'preparation':prep['proof'],'requestDigest':h(prep['proposal'])})
fullbasis['materializationEvidence']={'versions':[header],'entries':[{'inputOrdinal':i,'inputId':item['inputId'],'introducedContextRevision':1,'inputHash':h(item),'metadata':{k:v for k,v in item.items() if k!='value'}} for i,item in enumerate(private)]};fullbasis['incrementalEvidence']=None
add('complete-first-learn-validation-basis-extension','FinalValidationBasis',fullbasis);vector('complete-extended-validation-basis',fullbasis)
evidence_preimage={'version':1,'basisHash':h(fullbasis),'runAuthorizationHash':h(fullbasis['runAuthorization']),'translationHash':fullbasis['translationHash'],'bootstrapHash':h(fullbasis['bootstrap']),'sourceManifestHash':fullbasis['sourceManifestHash']};add('publication-evidence-preimage','PublicationEvidencePreimage',evidence_preimage);vector('publication-evidence-preimage',evidence_preimage)
admission_tuples=[{k:a['ledger'][k] for k in ['coordinate','admission','operationHash','scopeHash']} for a in fullbasis['actions']]
vector('effective-admission-provenance-array',admission_tuples)
# Complete same-session incremental BOUNDARY fixture; all existing effective proof joins remain exact.
incbasis=copy.deepcopy(fullbasis)
incprogram={'schemaVersion':3,'baseRevisionId':uid(901),'baseRevisionDigest':h(fixture['artifact']),'sourceStepIds':old['sourceSteps'][:2],'actions':copy.deepcopy(program['actions'])}
incplan={'schemaVersion':3,'sessionId':fullbasis['sessionId'],'testId':fullbasis['testId'],'csiId':fullbasis['csiId'],'baseRevisionId':uid(901),'initialFirstLearnStepId':uid(3),'initialFirstLearnIndex':2,'prefixProgramHash':h(incprogram)}
retained=[a['ledger']['admission']['admissionId'] for a in fullbasis['actions'][:2]]
incswitch={'schemaVersion':3,'sessionId':fullbasis['sessionId'],'baseRevisionId':uid(901),'initialFirstLearnStepId':uid(3),'effectiveFirstLearnStepId':uid(3),'effectiveFirstLearnIndex':2,'nextSemanticOrdinal':0,'completedPrefixCount':2,'reason':'BOUNDARY','driftReceiptHash':None,'retainedPrefixAdmissionIds':retained,'retainedPrefixAdmissionsHash':h(retained)}
requests=[]
for af in fullbasis['actions'][:2]:
 prep=next(p for p in fullbasis['preparations'] if p['preparationId']==af['preparationId'])
 requests.append({k:header[k] for k in common}|{'prefixProgramHash':h(incprogram),'coordinate':af['ledger']['coordinate'],'evidenceHash':prep['proof']['evidenceHash']})
incbasis['incrementalEvidence']={'plan':incplan,'program':incprogram,'switch':incswitch,'prefixRequests':requests,'driftReceipt':None,'firstSuffixAcceptance':{'sessionId':fullbasis['sessionId'],'previousPlanRevision':1,'planRevision':2,'retainedPrefixAdmissionIds':retained},'excludedAttempts':[]}
add('complete-incremental-boundary-validation-basis','FinalValidationBasis',incbasis);vector('complete-incremental-boundary-validation-basis',incbasis)
incpreimage={**evidence_preimage,'basisHash':h(incbasis)};vector('incremental-publication-evidence-preimage',incpreimage)
# Structural negatives are independently schema-tested; semantic hash/join mutations below are separately checked.
for name,mutate in [('missing-materialization-evidence',lambda b:b.pop('materializationEvidence')),('missing-incremental-evidence',lambda b:b.pop('incrementalEvidence')),('extra-extended-basis-field',lambda b:b.update({'uncommittedExtension':True})),('raw-private-value-in-evidence',lambda b:b['materializationEvidence']['entries'][0]['metadata'].update({'value':'not-public'})),('second-excluded-attempt',lambda b:b['incrementalEvidence'].update({'excludedAttempts':[{},{}]}))]:
 bad=copy.deepcopy(incbasis);mutate(bad);add(name,'FinalValidationBasis',bad,False)
semantic_fixtures=[]
for name,mutate in [('wrong-private-input-hash',lambda b:b['materializationEvidence']['entries'][0].update({'inputHash':'f'*64})),('header-hash-not-reconstructed',lambda b:b['materializationEvidence']['versions'][0].update({'authoredInputsHash':'f'*64})),('program-hash-not-pinned',lambda b:b['incrementalEvidence']['plan'].update({'prefixProgramHash':'f'*64})),('retained-admissions-not-exact',lambda b:b['incrementalEvidence']['switch'].update({'retainedPrefixAdmissionIds':[]})),('foreign-prefix-session',lambda b:b['incrementalEvidence']['prefixRequests'][0].update({'sessionId':'foreign-session'})),('wrong-proposal-digest',lambda b:b['actions'][0]['ledger'].update({'requestDigest':'f'*64}))]:
 bad=copy.deepcopy(incbasis);mutate(bad);semantic_fixtures.append({'name':name,'basis':bad,'valid':False})
dump('fixtures.json',{'schema':SID,'classification':'Design fixtures; schema/hash checks only, no application proof','runtimeGolden':False,'knownScopeLimit':'Complete reconstructed private input and extended-basis joins/hash assertions are design checks only; no application execution, authenticated live callback or joined runtime claim.','privateInputReconstruction':{'envelope':private_envelope,'versions':[header]},'semanticCases':semantic_fixtures,'schemaCases':fx,'canonicalVectors':vectors,'tenStepChain':chain_cases,'mappingCases':[{'name':'exact-uri-alias','variables':[{'name':'vault://studio/customer-password','kind':'secretRef','secretId':'LOGIN_PASSWORD'}],'reference':{'kind':'secretRef','referenceId':'vault://studio/customer-password'},'expected':{'referenceId':'vault://studio/customer-password','kind':'secretRef','secretId':'LOGIN_PASSWORD'}},{'name':'no-uri-suffix-guess','variables':[{'name':'customer-password','kind':'secretRef','secretId':'LOGIN_PASSWORD'}],'reference':{'kind':'secretRef','referenceId':'vault://studio/customer-password'},'expectedError':'AUTHORING_REFERENCE_MISSING'},{'name':'plain-text-reference-not-context-only','variables':[{'name':'ACCOUNT','kind':'plain','value':'alpha'}],'text':'Fill <var ACCOUNT>','expectedValueHash':h('alpha')},{'name':'duplicate-alias-refused','variables':[{'name':'alias','kind':'secretRef','secretId':'ONE'},{'name':'alias','kind':'secretRef','secretId':'TWO'}],'expectedError':'INVALID_AUTHORING'}],'semanticNegatives':['same-test older revision in reusedFrom instead of immediate base','noncontiguous reuse map','reuse at or beyond effective drift boundary','no-invocation admitted proof missing exact version/preparation/worker assignment','old prepared command consumed after append ACK','zero-consumer binding lacks retained successful prefix producer','any excluded consumed failure has no authenticated receipt','secret late usage joins latest rather than actual materialization version']})
print('Generated final schema and complete design fixtures')

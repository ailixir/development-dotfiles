from pathlib import Path
import copy,json,hashlib,re
P=Path(__file__).resolve().parent; ROOT=P.parents[5]; C=ROOT/'docs/specs/studio-observed-authoring/contracts/v3'
SID='https://checks.citi.example/design/studio-obs-015/correction01.schema.json'; BASE='https://checks.citi.example/contracts/observed/v3/'
def canonical(x):return json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(',',':'))
def h(x):return hashlib.sha256(canonical(x).encode()).hexdigest()
def dump(n,x):(P/n).write_text(json.dumps(x,indent=2,ensure_ascii=False)+'\n')
def obj(p,required=None):return {'type':'object','additionalProperties':False,'properties':p,'required':list(p) if required is None else required}
def arr(x,n=None,minn=0):return {'type':'array','items':x,'minItems':minn,**({'maxItems':n} if n is not None else {})}
def ref(n):return {'$ref':'#/definitions/'+n}
def ext(n):return {'$ref':BASE+n}
def null(x):return {'oneOf':[x,{'type':'null'}]}
U={'type':'string','pattern':'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'}; H={'type':'string','pattern':'^[a-f0-9]{64}$'}; S={'type':'string'}
D={}
D['ContextText']=obj({'kind':{'const':'text'},'value':S})
D['LiteralInput']=obj({'kind':{'const':'literal'},'value':S})
D['VariableReference']=obj({'kind':{'const':'variableRef'},'referenceId':{'type':'string','minLength':1}})
D['SecretReference']=obj({'kind':{'const':'secretRef'},'referenceId':{'type':'string','minLength':1}})
D['TargetHint']=obj({'kind':{'const':'targetHint'},'strategy':{'enum':['role','label','testId','text']},'value':{'type':'string','minLength':1},'scope':null(S),'exact':null({'type':'boolean'})})
D['DefaultVariableValue']=copy.deepcopy(D['VariableReference']);D['DefaultLiteralValue']=copy.deepcopy(D['LiteralInput'])
D['ContextualDefault']=obj({'kind':{'const':'default'},'name':{'type':'string','minLength':1},'value':{'oneOf':[ref('DefaultLiteralValue'),ref('DefaultVariableValue')]}})
D['AuthoringEvidenceReference']=obj({'id':U,'revision':{'type':'integer','minimum':1,'maximum':9007199254740991},'source':{'const':'supplied'},'csiId':{'type':'string','maxLength':20},'environment':{'type':'string','maxLength':50},'route':{'type':'string','minLength':1},'state':{'type':'string','minLength':1},'stepId':U,'capturedAt':{'type':'string','format':'date-time'},'completeness':{'enum':['complete','partial','unknown']},'hash':H})
D['GlobalContext']=obj({'entries':arr({'oneOf':[ref('ContextText'),ref('TargetHint'),ref('ContextualDefault')]}),'evidenceReferences':arr(ref('AuthoringEvidenceReference'))})
D['StepContext']=obj({'entries':arr({'oneOf':[ref(x) for x in ['ContextText','LiteralInput','VariableReference','SecretReference','TargetHint','ContextualDefault']]}),'evidenceReferences':arr(ref('AuthoringEvidenceReference'))})
D['NormalizedAuthoring']=obj({'authoringSchemaVersion':{'const':2},'globalContext':ref('GlobalContext'),'steps':arr(obj({'id':U,'text':{'type':'string','minLength':1,'maxLength':4000},'context':ref('StepContext')}),100,1)})
D['AuthoringSnapshotIdentity']=obj({'authoringIdentityVersion':{'const':1},'authoring':ref('NormalizedAuthoring'),'authoredDeclarations':arr(ext('revision.schema.json#/definitions/Declaration'),500)})
D['PinnedBase']=obj({'revisionId':U,'revisionDigest':H})
D['BaseSnapshotProof']=obj({'revision':ext('revision.schema.json'),'authoringIdentity':ref('AuthoringSnapshotIdentity'),'configuration':ext('replay-profile.schema.json#/definitions/Configuration'),'artifact':ext('replay-artifact.schema.json')})
D['SnapshotEvidence']=obj({'schemaVersion':{'const':3},'current':ref('AuthoringSnapshotIdentity'),'pinnedBase':null(ref('PinnedBase')),'baseProof':null(ref('BaseSnapshotProof'))})
D['CorrectedValidationBasis']=copy.deepcopy(json.load(open(C/'replay-validation.schema.json'))['definitions']['ValidationBasis']);D['CorrectedValidationBasis']['properties']['snapshotEvidence']=ref('SnapshotEvidence');D['CorrectedValidationBasis']['required'].append('snapshotEvidence')
dump('interfaces.schema.json',{'$schema':'http://json-schema.org/draft-07/schema#','$id':SID,'title':'015 correction01 internal pure-validation snapshot facts; one authoring generation unchanged','definitions':D})
# Pure schema/hash illustration only: no Java/runner imports, application build, database or browser.
fixture=json.load(open(C/'publication-fixtures.json')); ordinary=copy.deepcopy(fixture['basis']);source=ordinary['sourceSteps'];uid=lambda n:f'00000000-0000-4000-8000-{n:012d}'
empty={'entries':[],'evidenceReferences':[]}
def identity(tail):
 a={'authoringSchemaVersion':2,'globalContext':copy.deepcopy(empty),'steps':[{'id':s['stepId'],'text':s['source'],'context':copy.deepcopy(empty)} for s in source]}
 a['steps'][2]['context']['entries']=[{'kind':'variableRef','referenceId':'saved-label'},{'kind':'text','value':tail}]
 return {'authoringIdentityVersion':1,'authoring':a,'authoredDeclarations':[{'referenceId':'saved-label','kind':'plain','valueHash':h('')}]}
current=identity('Current authored context'); prior=identity('Previous authored context')
def referenced(identity,context,text=None):
 lookup={d['referenceId']:d for d in identity['authoredDeclarations']}; direct={d['secretId']:{**d,'referenceId':d['secretId']} for d in identity['authoredDeclarations'] if d['kind']=='secretRef'};use={}
 for e in context['entries']:
  x=e['value'] if e['kind']=='default' else e
  if x['kind'] in ['variableRef','secretRef']:
   d=lookup[x['referenceId']];assert d['kind']==('plain' if x['kind']=='variableRef' else 'secretRef');use[d['referenceId']]=d
 for kind,key in re.findall(r'<(var|secret)\s+([A-Za-z0-9_.-]{1,64})>',text or ''):
  d=lookup[key] if kind=='var' else direct[key];use[d['referenceId']]=d
 return [use[k] for k in sorted(use,key=lambda x:x.encode())]
def learned(plan,sid):
 aa=[{k:v for k,v in a.items() if k!='admissionId'} for a in plan['actions'] if a['coordinate']['stepId']==sid];aa.sort(key=lambda x:x['coordinate']['ordinal']);pp=[];cc=[]
 for b in plan['bindings']:
  if b['producer']['stepId']==sid:
   x=copy.deepcopy(b);x.pop('consumers');x['provenance'].pop('sessionId');x['provenance'].pop('producerAdmissionId');pp.append(x)
  for e in b['consumers']:
   if e['coordinate']['stepId']==sid:cc.append({k:v for k,v in e.items() if k not in ['producerAdmissionId','consumerAdmissionId']})
 pp.sort(key=lambda x:(x['producer']['ordinal'],x['bindingId'].encode()));cc.sort(key=lambda x:(x['coordinate']['ordinal'],x['argumentSlot'].encode(),x['bindingId'].encode()));return {'actions':aa,'producedBindings':pp,'consumedBindings':cc}
def snapshots(identity,configuration,plan):
 a=identity['authoring'];config={'domain':'studio.test-config','version':1,**configuration,'globalContextHash':h(a['globalContext']),'globalReferences':referenced(identity,a['globalContext'])};prev=h(config);rows=[]
 for s in a['steps']:
  inp={'domain':'studio.step-input','version':1,'stepId':s['id'],'text':s['text'],'context':s['context'],'references':referenced(identity,s['context'],s['text'])};chain={'domain':'studio.step-chain','version':1,'stepId':s['id'],'stepInputHash':h(inp),'previous':prev};prev=h(chain);content=learned(plan,s['id']);snapshot={'domain':'studio.step-snapshot','version':1,'stepId':s['id'],'inputChain':prev,'learnedStepHash':h(content)};rows.append({'stepInput':inp,'stepChain':chain,'learnedContent':content,'stepSnapshot':snapshot,'snapshotHash':h(snapshot)})
 return {r['stepSnapshot']['stepId']:r['snapshotHash'] for r in rows},{'testConfig':config,'rows':rows}
def pub_preimage(b):return {'version':1,'basisHash':h(b),'runAuthorizationHash':h(b['runAuthorization']),'translationHash':b['translationHash'],'bootstrapHash':h(b['bootstrap']),'sourceManifestHash':b['sourceManifestHash']}
def artifact(b,identity,template=None):
 a=copy.deepcopy(template or fixture['artifact']);plan=a['learnedPlan'];plan['planId']='plan-'+h({'sessionId':b['sessionId']});plan['authoredInputsHash']=b['authoredInputsHash'];plan['stepSnapshotHashes'],vector=snapshots(identity,b['configuration'],plan)
 x=b['incrementalEvidence'];plan['reusedFrom']={} if x is None else {s['stepId']:{'revisionId':x['plan']['baseRevisionId'],'stepId':s['stepId']} for s in b['sourceSteps'][:x['switch']['completedPrefixCount']]}
 plan['incremental']=None if x is None else {'baseRevisionId':x['plan']['baseRevisionId'],'initialFirstLearnStepId':x['plan']['initialFirstLearnStepId'],'effectiveFirstLearnStepId':x['switch']['effectiveFirstLearnStepId'],'retainedPrefixAdmissionIds':x['switch']['retainedPrefixAdmissionIds'],'driftReceiptHash':x['switch']['driftReceiptHash']}
 a['learnedPlanHash']=h(plan);policy=a['replayPolicy'];policy['learnedPlanHash']=h(plan);policy['runAuthorizationHash']=h(b['runAuthorization']);policy['admissionProvenanceHash']=h([{k:af['ledger'][k] for k in ['coordinate','admission','operationHash','scopeHash']} for af in b['actions']]);policy['publicationEvidenceHash']=h(pub_preimage(b));return a,vector
# Historical base has its own session/admissions, coherent proof and current materialization hashes.
def replace(x,m):
 if isinstance(x,dict):return {k:replace(v,m) for k,v in x.items()}
 if isinstance(x,list):return [replace(v,m) for v in x]
 return m.get(x,x) if isinstance(x,str) else x
rename={'session-1':'session-base',**{'admission-'+str(i):'base-admission-'+str(i) for i in range(5)}}
basebasis=replace(copy.deepcopy(ordinary),rename);baseTemplate=replace(copy.deepcopy(fixture['artifact']),rename)
private=replace(copy.deepcopy(fixture['incrementalContracts']['privateInputReconstruction']['envelope']),rename);oldhash=basebasis['authoredInputsHash'];basebasis=replace(basebasis,{oldhash:h(private)})
for ob in list(basebasis['observations']):
 old=ob['observationHash'];new=h(ob['observation']);basebasis=replace(basebasis,{old:new})
for pf in list(basebasis['preparations']):
 old=pf['proof']['evidenceHash'];new=h(pf['executionEvidence']);basebasis=replace(basebasis,{old:new})
for pf in list(basebasis['preparations']):
 old=pf['proof']['requestDigest'];new=h(pf['proposal']);basebasis=replace(basebasis,{old:new})
for af in basebasis['actions']:
 pf=next(p for p in basebasis['preparations'] if p['preparationId']==af['preparationId']);af['ledger']['admission']['policyDecisionHash']=h({'scopeHash':h(basebasis['scope']),'preparation':pf['proof'],'requestDigest':h(pf['proposal'])})
basebasis['snapshotEvidence']={'schemaVersion':3,'current':prior,'pinnedBase':None,'baseProof':None}
baseartifact,basevector=artifact(basebasis,prior,baseTemplate)
identityFields={'version':1,**{k:basebasis[k] for k in ['testId','csiId','sourceRevision','configurationRevision','sourceHash','configurationHash','authoringHash']},'learnedPlanHash':h(baseartifact['learnedPlan']),'artifactHash':h(baseartifact),'referencePolicyHash':h(baseartifact['replayPolicy']),'operationEquivalenceHash':h({'operations':[o for s in baseartifact['steps'] for o in s['operations']],'guards':baseartifact['guards'],'inputRecipes':baseartifact['inputRecipes'],'bindings':baseartifact['replayPolicy']['bindings'],'transfers':baseartifact['replayPolicy']['transfers']}),'admissionProvenanceHash':baseartifact['replayPolicy']['admissionProvenanceHash'],'publicationEvidenceHash':baseartifact['replayPolicy']['publicationEvidenceHash'],'runAuthorizationHash':h(basebasis['runAuthorization']),'profileHash':h(baseartifact['profile'])}
revision={'schemaVersion':3,'id':uid(901),'revisionDigest':h(identityFields),'identity':identityFields,'stepSnapshotHashes':baseartifact['learnedPlan']['stepSnapshotHashes'],'reusedFrom':baseartifact['learnedPlan']['reusedFrom']}
baseproof={'revision':revision,'authoringIdentity':prior,'configuration':basebasis['configuration'],'artifact':baseartifact};pin={'revisionId':revision['id'],'revisionDigest':revision['revisionDigest']}
ordinary['snapshotEvidence']={'schemaVersion':3,'current':current,'pinnedBase':None,'baseProof':None}
boundary=copy.deepcopy(next(c['basis'] for c in fixture['incrementalContracts']['basisCases'] if c['name']=='boundary'));x=boundary['incrementalEvidence'];x['program']['baseRevisionDigest']=revision['revisionDigest'];newph=h(x['program']);x['plan']['prefixProgramHash']=newph
for request in x['prefixRequests']:request['prefixProgramHash']=newph
boundary['snapshotEvidence']={'schemaVersion':3,'current':current,'pinnedBase':pin,'baseProof':baseproof}
emptybasis=copy.deepcopy(next(c['basis'] for c in fixture['incrementalContracts']['basisCases'] if c['name']=='emptyPrefix'));emptybasis['incrementalEvidence']['program']['baseRevisionDigest']=pin['revisionDigest'];emptybasis['incrementalEvidence']['plan']['prefixProgramHash']=h(emptybasis['incrementalEvidence']['program']);emptybasis['snapshotEvidence']={'schemaVersion':3,'current':current,'pinnedBase':pin,'baseProof':None}
positives=[]
for name,b in [('ordinary',ordinary),('boundary',boundary),('empty-prefix-incomplete-base',emptybasis),('base-historical-ordinary',basebasis)]:
 a,v=artifact(b,b['snapshotEvidence']['current'],baseTemplate if name=='base-historical-ordinary' else None);positives.append({'name':name,'basis':b,'expectedArtifact':a,'snapshotComputation':v,'publicationEvidencePreimage':pub_preimage(b),'publicationEvidenceHash':h(pub_preimage(b))})
# Exact counterexample: the old basis fields are equal but new canonical snapshots must differ.
oldfields=copy.deepcopy(ordinary);oldfields.pop('snapshotEvidence');different=copy.deepcopy(current);different['authoring']['steps'][1]['context']['entries']=[{'kind':'text','value':'A distinct unused authored hint'}]
m1,v1=snapshots(current,ordinary['configuration'],fixture['artifact']['learnedPlan']);m2,v2=snapshots(different,ordinary['configuration'],fixture['artifact']['learnedPlan'])
negative=[]
def neg(name,change):
 b=copy.deepcopy(boundary);change(b);negative.append({'name':name,'basis':b,'expected':'REJECT'})
neg('missing-snapshot-evidence',lambda b:b.pop('snapshotEvidence'))
neg('null-base-for-nonempty-original-prefix',lambda b:b['snapshotEvidence'].update({'baseProof':None}))
neg('foreign-base-id',lambda b:b['snapshotEvidence']['baseProof']['revision'].update({'id':uid(902)}))
neg('foreign-test-base-identity',lambda b:b['snapshotEvidence']['baseProof']['revision']['identity'].update({'testId':uid(999)}))
neg('forged-base-revision-digest',lambda b:b['snapshotEvidence']['pinnedBase'].update({'revisionDigest':'f'*64}))
neg('forged-base-artifact-hash',lambda b:b['snapshotEvidence']['baseProof']['revision']['identity'].update({'artifactHash':'f'*64}))
neg('claimed-map-not-recomputed',lambda b:b['snapshotEvidence']['baseProof']['revision']['stepSnapshotHashes'].update({uid(1):'f'*64}))
neg('changed-base-context-retains-old-snapshot',lambda b:b['snapshotEvidence']['baseProof']['authoringIdentity']['authoring']['steps'][0]['context']['entries'].append({'kind':'text','value':'Tampered'}))
neg('source-text-does-not-match-basis',lambda b:b['snapshotEvidence']['current']['authoring']['steps'][0].update({'text':'Other source'}))
neg('duplicate-reference-declaration',lambda b:b['snapshotEvidence']['current']['authoredDeclarations'].append(copy.deepcopy(b['snapshotEvidence']['current']['authoredDeclarations'][0])))
neg('missing-referenced-plain-identity',lambda b:b['snapshotEvidence']['current'].update({'authoredDeclarations':[]}))
neg('private-resolved-value-in-declaration',lambda b:b['snapshotEvidence']['current']['authoredDeclarations'][0].update({'value':'must-not-be-in-basis'}))
neg('noncontiguous-original-prefix-program',lambda b:b['incrementalEvidence']['program']['sourceStepIds'].reverse())
neg('program-action-not-from-base',lambda b:b['incrementalEvidence']['program']['actions'][0]['operation'].update({'destinationInputId':'different-input'}))
neg('current-prefix-context-cannot-be-reused',lambda b:b['snapshotEvidence']['current']['authoring']['steps'][0]['context']['entries'].append({'kind':'text','value':'Prefix changed'}))
neg('base-authoring-identity-version-absent',lambda b:b['snapshotEvidence']['baseProof']['authoringIdentity'].pop('authoringIdentityVersion'))
dump('fixtures.json',{'classification':'CORRECTION_DESIGN_ONLY_NOT_RUNTIME_GOLDEN','schema':SID,'applicationTestsRun':0,'positives':positives,'semanticNegatives':negative,'underdeterminationCounterexample':{'oldBasis':oldfields,'identityA':current,'identityB':different,'snapshotMapA':m1,'snapshotMapB':m2,'equalBeforeCorrection':True,'equalSnapshotPositions':[i+1 for i,s in enumerate(source) if m1[s['stepId']]==m2[s['stepId']]],'differentSnapshotPositions':[i+1 for i,s in enumerate(source) if m1[s['stepId']]!=m2[s['stepId']]]},'privateInputHelper':{'classification':'LOCAL_SYNTHETIC_ONLY_NEVER_INCLUDE_IN_VALIDATION_BASIS','historicalBasePrivateEnvelope':private},'basePublicationAuthority':'Synthetic historical row and its full canonical identity/artifact are coherent design facts, not live publication/authentication proof. Past basis evidence commitment included without recursively embedding past bases.'})
# Deterministic artifact generation assertions (not application tests).
assert positives[1]['expectedArtifact']['learnedPlan']['stepSnapshotHashes'][uid(1)]==revision['stepSnapshotHashes'][uid(1)]
assert positives[1]['expectedArtifact']['learnedPlan']['stepSnapshotHashes'][uid(2)]==revision['stepSnapshotHashes'][uid(2)]
assert positives[1]['expectedArtifact']['learnedPlan']['stepSnapshotHashes'][uid(3)]!=revision['stepSnapshotHashes'][uid(3)]
assert h(baseartifact)==revision['identity']['artifactHash'] and h(revision['identity'])==revision['revisionDigest']
assert len(canonical(boundary).encode())<6291456
print(json.dumps({'status':'GENERATED_COHERENT_SYNTHETIC_DESIGN','completeBasisFixtures':len(positives),'semanticNegativeCases':len(negative),'boundaryEqualPositions':[1,2],'boundaryChangedPositions':[3],'counterexampleEqual':[1],'counterexampleChanged':[2,3],'basisBytes':len(canonical(boundary).encode()),'baseRevisionDigest':revision['revisionDigest'],'notRun':['application tests','database','browser','Gradle','runner build']},indent=2))

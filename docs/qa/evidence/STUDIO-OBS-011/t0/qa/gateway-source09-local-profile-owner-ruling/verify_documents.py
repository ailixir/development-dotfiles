"""Finite named technical-policy document validation. No subject/model code executed."""
from pathlib import Path
import hashlib,json,stat
A=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway-source09-local-profile-owner-ruling')
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-proof-prep/resume9')
O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/gateway-source09-local-profile-owner-ruling')
checks=[];pins=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(name,ok):
 if not ok:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def pin(r,prefix=None):
 p=Path(r['path']) if prefix is None else prefix/r['path'];check('PUBLIC_ONLY_'+str(p),'/runtime/' not in str(p) and '/.gradle/' not in str(p) and not str(p).endswith('preexisting-baseline.json'))
 b=p.read_bytes();s=p.stat();check('SHA_'+str(p),h(b)==r['sha256']);check('BYTES_'+str(p),len(b)==r['bytes']);check('MODE_'+str(p),stat.S_IMODE(s.st_mode)==(int(r['mode'],8) if type(r['mode'])is str else r['mode']));pins.append({'path':str(p),'sha256':h(b),'bytes':len(b),'mode':stat.S_IMODE(s.st_mode)});return b
araw=(A/'manifest.json').read_bytes();check('ARIA_EXACT_POLICY_SEAL',h(araw)=='308c8593ed14da145df1e2c0fe8a0f1ad3add38a43db67a68d311477b8f6f12a');am=json.loads(araw);check('ARIA10_PAYLOADS',am['payloadCount']==len(am['files'])==10)
for r in am['files']:pin(r,A)
ap=json.loads((A/'pins.json').read_bytes());check('ARIA93_PIN_RECORDS',len(ap['pins'])==93)
for r in ap['pins']:pin(r)
subject='1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7';protocol='GATEWAY_LOCAL_RUNNER_REPORT_SAMPLED_OBSERVATIONS_V1'
check('SOURCE09_EXACT',h((S/'manifest.json').read_bytes())==subject)
a=json.loads((A/'owner-ruling-Aria.json').read_bytes());q=json.loads((O/'owner-ruling-Quinn.json').read_bytes());template=json.loads((S/'control-templates.json').read_bytes())['ownerRuling'];schema=json.loads((S/'document-factories.schema.json').read_bytes())
check('EXACT_ARIA_OWNER_RECORD',h((A/'owner-ruling-Aria.json').read_bytes())=='537c325bbddd03bf35e19590f4a75d61524748ecad0d80af440d047876944a97')
check('EXACT_ARIA_RULING_TEXT',h((A/'ruling.md').read_bytes())=='bdaf4d98f8b5c16fb57b35c39dd556610beac9fc7fd3b8c129f547ba32c94c50')
check('ARIALIMITS9',len(a['conditions'])==9 and json.loads((A/'limitations.json').read_bytes())['conditions']==a['conditions'])
common=['protocol','claimSet','guarantees','historicalIdentityUncertainty','unsupportedEvidence','credit','C8','cleanupAuthorized','sourceWrites','purpose']
for name in common:check('EXACT_COMMON_CLAIM_'+name,q[name]==template[name]==a[name])
check('OWNER_QUINN_ONLY',q['owner']=='Quinn' and (O/'owner-ruling-Quinn.json').name=='owner-ruling-'+q['owner']+'.json')
check('PROFILE_TECHNICAL_FLAGS',q['profileAuthorized'] is True and q['strongInitialSubjectReplacedOnlyForThisLocalProfile'] is True and q['technicalPolicyDecisionOnly'] is True)
check('EXACT_PURPOSE',q['purpose']=='OWNER_LOCAL_PROFILE_RULING')
check('EXACT_OWNER_SOURCE_PROTOCOL',q['packetManifestSha256']==a['packetManifestSha256']==subject and q['protocol']==protocol)
check('ALL10_LITERAL_FALSE',len(q['guarantees'])==10 and all(v is False for v in q['guarantees'].values()))
check('SIX_NULL_REASON',len(q['unsupportedEvidence'])==6 and all(v=={'value':None,'reason':'NOT_PROVED_BY_LOCAL_RUNNER_PROFILE'} for v in q['unsupportedEvidence'].values()))
check('HISTORY_TRUE',q['historicalIdentityUncertainty'] is True)
check('NO_OPERATION_INSTALL_EVIDENCE',q['actualOperationalAuthority'] is False and q['runtimeInstallationAuthorized'] is False and q['actualEvidenceAccepted'] is False and q['actualUnitAuthorized'] is False)
check('ROOT_DECISION_OWED',q['independentRootDecision']=='OWED_NOT_IMPLIED')
check('EXACT_SCHEMA_REQUIRED_FIELDS',set(schema['roleRequiredFields']['OWNER_LOCAL_PROFILE_RULING'])<=set(q))
check('EXACT_CODE_REVIEW_ROLES',set(q['independentCodeReviewPins'])=={'Aria','Quinn'} and q['independentCodeReviewPins']==a['independentCodeReviewPins'])
for role,ref in q['independentCodeReviewPins'].items():
 p=Path(ref['path']);check('REVIEW_ABSOLUTE_'+role,p.is_absolute());b=p.read_bytes();check('REVIEW_RAW_PIN_'+role,h(b)==ref['sha256']);r=json.loads(b)
 check('REVIEW_SUBJECT_ROLE_PROTOCOL_'+role,r['reviewer']==role and r['subjectManifestSha256']==subject and r['protocol']==protocol)
 check('REVIEW_ACTUAL_EMPTY_FINDINGS_'+role,type(r['mandatoryFindings'])is list and r['mandatoryFindings']==[])
rootpath=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume2-gateway-runner-source09-exact-source-root-adoption.json');rb=rootpath.read_bytes();check('SOURCE_ROOT_ADOPTION_PIN',h(rb)==q['sourceRootAdoptionSha256']=='f9ef85f3a06e7a1531f84e2f6d92a65a4a650d83a83169c89b022d049b903365');root=json.loads(rb)
check('ROOT_SOURCE_ONLY_NOT_PROFILE',root['sourceOnly'] is True and root['actualGateAmendment'] is False and root['actualHeavyNativeNamespaceSourceWindowCleanupCreditAuthority'] is False)
check('NINE_COMPLETE_CONDITIONS',len(q['conditions'])==9 and all(type(v)is str and len(v)>100 for v in q['conditions']))
check('BIND_EXACT_ARIA_POLICY',q['ariaOwnerDecisionPin']['sha256']==h((A/'owner-ruling-Aria.json').read_bytes()) and Path(q['ariaOwnerDecisionPin']['path']).is_absolute())
f=json.loads((O/'findings.json').read_bytes());check('FINDINGS_COMPLETE_CONDITIONS',f['conditions']==q['conditions'] and f['mandatoryFindings']==[] and f['allAriaNineConditionsAndPriorCodeReviewLimitsAdopted'] is True)
check('PRIOR_SOURCE_PROOF_REUSED',am['subjectTestsReplayed']==0 and am['actualTargetActions']==0)
# Compare required predicate fields by static source text only; no subject validator invocation.
runtime=(S/'runtime.py').read_text()
for term in ["purpose == 'OWNER_LOCAL_PROFILE_RULING'","value.get('profileAuthorized') is True","value.get('strongInitialSubjectReplacedOnlyForThisLocalProfile') is True","code_review_refs(value.get('independentCodeReviewPins'))","review.get('mandatoryFindings') == []"]:
 check('STATIC_RUNTIME_OWNER_FIELD_'+term,term in runtime)
(O/'pins.json').write_text(json.dumps({'kind':'FINITE_PUBLIC_NAMED_POLICY_INPUT_PINS','subjectManifestSha256':subject,'ariaOwnerManifestSha256':h(araw),'pins':pins,'sourceOrModelFunctionsExecuted':0,'runtimePrivateCacheBaselineReads':False},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'FINITE_POLICY_DOCUMENT_CHECKS_NOT_CODE_QA','count':len(checks),'checks':checks,'allExpected':True,'ariaPolicyPayloads':10,'ariaNamedPinRecords':93,'sourceProofsReplayed':0,'subjectOrModelTests':0,'actualActions':0,'targetValidatorExecuted':False,'newProviderApiResearch':0,'newBookkeepingFailures':[],'budgetCeilingUsd':500,'aggregateSpend':'UNKNOWN'},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'allExpected':True,'ariaPolicyPayloads':10,'namedInputPinRecords':93,'subjectOrModelTests':0,'actualActions':0}))

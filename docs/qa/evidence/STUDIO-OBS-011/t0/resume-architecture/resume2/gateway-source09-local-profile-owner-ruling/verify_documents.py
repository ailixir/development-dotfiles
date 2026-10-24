"""Finite public-document checks only; never evaluates/imports subject code."""
from pathlib import Path
import ast, hashlib, json, stat

T=Path('docs/qa/evidence/STUDIO-OBS-011/t0')
S=T/'early/gateway80-proof-prep/resume9'
O=T/'resume-architecture/resume2/gateway-source09-local-profile-owner-ruling'
checks=[];pins=[];h=lambda b:hashlib.sha256(b).hexdigest()
def check(name,ok):
 if not ok:raise ValueError(name)
 checks.append({'id':name,'passed':True})
def read(path,expected=None,size=None,mode=0o644):
 check('APPROVED_PUBLIC_PATH_'+str(path),str(path).startswith(str(T)+'/') and '/runtime/' not in str(path) and not str(path).endswith('preexisting-baseline.json'))
 raw=path.read_bytes();info=path.stat()
 if expected is not None:check('EXACT_SHA_'+str(path),h(raw)==expected)
 if size is not None:check('EXACT_BYTES_'+str(path),len(raw)==size)
 check('MODE_'+str(path),stat.S_IMODE(info.st_mode)==mode)
 pins.append({'path':str(path),'sha256':h(raw),'bytes':len(raw),'mode':mode})
 return raw
def packet(path,expected):
 raw=read(path,expected);value=json.loads(raw)
 for row in value['files']:
  mode=row['mode'];mode=(int(mode,8) if mode.startswith('0') and not mode.startswith('0o') else int(mode,0)) if type(mode) is str else mode
  read(path.parent/row['path'],row['sha256'],row['bytes'],mode)
 return value
subject='1c94f710c3229ae8b732151e92b4a63ef3619f22fcd80561e1091be6532dfbc7'
protocol='GATEWAY_LOCAL_RUNNER_REPORT_SAMPLED_OBSERVATIONS_V1'
source=packet(S/'manifest.json',subject)
aria=packet(T/'resume-architecture/resume2/gateway-runner-resume9-exact-review/manifest.json','8489b969f73ccd2429a84fb982f1cb9fe24b9d741c9a049cd6ad5e9d16182d15')
quinn=packet(T/'qa/gateway-runner-resume9-exact-review/manifest.json','fef6a0b862bcdc1920dd99b6a4901b5959f53dddb23977d9bb4120df71228b8d')
design=packet(T/'resume-architecture/resume2/gateway-next-execution-evidence-design/manifest.json','3bbc86a625a2e362508ab81c8cf15c8a09ca55a0abd15e1e49e502ea4f91e007')
designqa=packet(T/'qa/gateway-next-execution-evidence-design-review/manifest.json','2f148fc323164547b59e7b945436b3fd221a0d826dbfd192e2f4ca7ccd4eb5b4')
read(T/'resume2-gateway-runner-resume8-preparation-root-scope.json','7332aaedaef306b619db342eeb743e30cb74b490d41fb6f1c8dc85186501f0bd')
adoption=json.loads(read(T/'resume2-gateway-runner-source09-exact-source-root-adoption.json','f9ef85f3a06e7a1531f84e2f6d92a65a4a650d83a83169c89b022d049b903365'))
check('SOURCE50_REVIEW15_12',len(source['files'])==50 and len(aria['files'])==15 and len(quinn['files'])==12)
check('ROOT_SOURCE_ONLY_ADOPTION',adoption['subjectManifestSha256']==subject and adoption['mandatoryFindings']==[] and adoption['sourceOnly'] is True and adoption['actualGateAmendment'] is False and adoption['actualHeavyNativeNamespaceSourceWindowCleanupCreditAuthority'] is False)
record=json.loads((O/'owner-ruling-Aria.json').read_bytes());template=json.loads((S/'control-templates.json').read_bytes())['ownerRuling']
changed={'owner','profileAuthorized','packetManifestSha256','independentCodeReviewPins','strongInitialSubjectReplacedOnlyForThisLocalProfile'}
for key,value in template.items():
 check('ALL_TEMPLATE_FIELDS_'+key,key in record)
 if key not in changed:check('UNCHANGED_TEMPLATE_CLAIM_'+key,record[key]==value)
check('EXACT_NAMED_ARIA_POLICY',record['owner']=='Aria' and record['purpose']=='OWNER_LOCAL_PROFILE_RULING' and record['packetManifestSha256']==subject and record['profileAuthorized'] is True and record['strongInitialSubjectReplacedOnlyForThisLocalProfile'] is True)
check('TEN_STRONGER_FALSE',len(record['guarantees'])==10 and all(x is False for x in record['guarantees'].values()))
check('SIX_UNSUPPORTED_NULL_WITH_REASON',len(record['unsupportedEvidence'])==6 and all(x=={'value':None,'reason':'NOT_PROVED_BY_LOCAL_RUNNER_PROFILE'} for x in record['unsupportedEvidence'].values()))
check('NO_ACTUAL_AUTHORITY',record['decisionType']=='NAMED_TECHNICAL_CLAIM_POLICY_ONLY' and record['actualOperationalAuthority'] is False and record['runtimeInstallationAuthorized'] is False and record['actualEvidenceAccepted'] is False)
check('NO_OTHER_UNIT_FACTS',not any(k in record for k in ('directoryRoots','holdFileSha256','candidateBaselineSha256','phaseReceiptPins','reportPins','actualWrapperExit','actualPostcloseExit','issuedAtEpoch','readinessSha256','actualFinalStatus')))
check('EXACT_PUBLIC_REVIEW_ROLES',set(record['independentCodeReviewPins'])=={'Aria','Quinn'})
base='/Users/brunobuger/orca/workspaces/put-checks/ui-studio/'
expected={
 'Aria':('resume-architecture/resume2/gateway-runner-resume9-exact-review/review-record.json','fdd2aba1a23838d4826c343036d7617f063d7c398985c1b88dcf26adf44ccc62'),
 'Quinn':('qa/gateway-runner-resume9-exact-review/review-record.json','9c81e6ff18406cf98fa2d94f4b2a1272da24475b487fd4d3eb2e2d840b906dca')}
for role,(relative,sha) in expected.items():
 ref=record['independentCodeReviewPins'][role]
 check('EXACT_ABSOLUTE_REVIEW_REF_'+role,ref=={'path':base+str(T/relative),'sha256':sha})
 raw=read(T/relative,sha);review=json.loads(raw)
 check('EXACT_CLEAN_SOURCE_REVIEW_'+role,review['reviewer']==role and review['subjectManifestSha256']==subject and review['protocol']==protocol and review['mandatoryFindings']==[])
 check('FULL_REVIEW_CONDITIONS_BOUND_'+role,len(review['limits'])==7 and (adoption['adoptedArchitectureConditions'] if role=='Aria' else adoption['adoptedQaConditions'])==review['limits'])
rt=(S/'runtime.py').read_text();tree=ast.parse(rt)
functions={n.name:ast.get_source_segment(rt,n) for n in tree.body if isinstance(n,ast.FunctionDef)}
for name in ('validate_claim','validate_document','owner_ruling','validate_pending_owner_inputs'):check('EXACT_SOURCE_POLICY_READ_'+name,name in functions)
for text in ("purpose == 'OWNER_LOCAL_PROFILE_RULING'","value.get('profileAuthorized') is True","value.get('strongInitialSubjectReplacedOnlyForThisLocalProfile') is True","code_review_refs(value.get('independentCodeReviewPins'))"):
 check('OWNER_FIELD_CONTRACT_'+text,text in functions['validate_document'])
check('RUNTIME_REQUIRES_ALL_NAMED_OWNERS',"set(pins) == {'Aria', 'Quinn', 'root'}" in functions['owner_ruling'])
check('RUNTIME_REQUIRES_PREVIOUS_ACTUAL_CLOSURE',"previous_closure(ctx, release['previousFailedUnitClosure'])" in functions['owner_ruling'])
check('POLICY_DOES_NOT_CREATE_STRONG_PROOF',record['guarantees']==source['guarantees']==design['guarantees'])
claim=json.loads((S/'scope.json').read_bytes());d=json.loads((T/'resume-architecture/resume2/gateway-next-execution-evidence-design/design.json').read_bytes())
check('UNCHANGED_LITERAL_NATIVE_VECTORS',claim['phases']==d['businessProfileUnchanged']['phases'])
check('ORACLE95_48',source['profileOracle']['totalCases']==95 and source['profileOracle']['redSelectedIntendedFailures']==48 and source['profileOracle']['redFiltered']==47 and source['profileOracle']['greenPass']==95 and source['profileOracle']['greenFailErrorSkipTodo']==0)
limitations=json.loads((O/'limitations.json').read_bytes())
check('ALL_NINE_POLICY_CONDITIONS',len(record['conditions'])==9 and record['conditions']==limitations['conditions'])
check('OTHER_OWNERS_OWED',limitations['independentQuinnDecision']==limitations['independentRootDecision']=='OWED')
check('NO_TEST_REPLAY_OR_ACTUALS',limitations['testsReplayed']==limitations['actualTargetActions']==0)
check('NO_GENERIC_APPROVAL_INVENTED',limitations['allExistingCodeReviewConditionsAdopted'] is True and limitations['actualUnitAuthority'] is False)
(O/'pins.json').write_text(json.dumps({'kind':'PUBLIC_DOCUMENT_POLICY_INPUT_PINS','pins':pins,'subjectManifestSha256':subject,'oldProtectedBaselineBodyReadStatHash':False,'currentOperationalResourceReads':0},indent=2)+'\n')
(O/'checks.json').write_text(json.dumps({'kind':'ARIA_NAMED_TECHNICAL_POLICY_DOCUMENT_CHECKS','checks':len(checks),'results':checks,'pins':len(pins),'subjectFunctionsExecuted':0,'subjectOrModelTestsReplayed':0,'actualTargetActions':0,'runtimeOrNamespaceAuthority':False},indent=2)+'\n')
print(json.dumps({'checks':len(checks),'pinRecords':len(pins),'allPassed':True,'subjectTestsReplayed':0,'actualTargetActions':0}))

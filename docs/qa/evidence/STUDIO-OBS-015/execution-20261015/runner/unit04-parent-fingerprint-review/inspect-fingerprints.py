from pathlib import Path
import json,hashlib,re,copy,datetime
B=Path('docs/qa/evidence/STUDIO-OBS-015/execution-20261015');O=B/'runner/unit04-parent-fingerprint-review';E=B/'contracts/current-vector-preservation-implementation'
P=Path('docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json');OLD=E/'before'/P
current=json.loads(P.read_text());old=json.loads(OLD.read_text());inventory=json.loads((E/'mutation-rebase-inventory.json').read_text());qpath=B/'backend/remaining-facet-review05/unit03-29-negative-tier-routing.json';qa=json.loads(qpath.read_text());helper=Path('studio-runner/test/helpers/incrementalNegativeBoundaries.ts');text=helper.read_text();start=text.index('[\n',text.index('export const negativeBoundaries'));end=text.index('\n];',start)+2;declared=json.loads(text[start:end])
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canonical(x):
 if x is None:return 'null'
 if x is True:return 'true'
 if x is False:return 'false'
 if isinstance(x,str):
  x.encode('utf-8',errors='strict');return json.dumps(x,ensure_ascii=False,separators=(',',':'))
 if isinstance(x,int):assert abs(x)<=9007199254740991;return str(x)
 if isinstance(x,list):return '['+','.join(canonical(y)for y in x)+']'
 if isinstance(x,dict):
  assert all(all(32<=ord(c)<=126 for c in k)for k in x)
  return '{'+','.join(canonical(k)+':'+canonical(x[k])for k in sorted(x))+'}'
 raise AssertionError(('unsupported canonical type',type(x)))
def H(x):return hashlib.sha256(canonical(x).encode('utf-8')).hexdigest()
def rows(doc,section):return doc['snapshotCorrection']['positives']+doc['snapshotCorrection']['negatives']if section=='snapshot'else doc['graphTimingConformance']['graphCases']if section=='graph'else doc['incrementalContracts']['basisCases']
def get(doc,p):
 x=doc
 for key in p.split('/')[1:]:
  key=key.replace('~1','/').replace('~0','~')
  if isinstance(x,list):
   if not key.isdigit()or int(key)>=len(x):return False,None
   x=x[int(key)]
  elif isinstance(x,dict)and key in x:x=x[key]
  else:return False,None
 return True,x
def view(row):return {k:copy.deepcopy(row[k])for k in ['basis','authority','expectedArtifact']if k in row}
def mask(v,p):
 ks=p.split('/')[1:];x=v
 for k in ks[:-1]:x=x[int(k)]if isinstance(x,list)else x[k.replace('~1','/').replace('~0','~')]
 k=ks[-1].replace('~1','/').replace('~0','~')
 if isinstance(x,list):x[int(k)]={'MASKED_EXACT_DECLARED_DELTA':True}
 else:x.pop(k,None)
def diffs(a,b,p=''):
 if type(a)!=type(b):return [p]
 if isinstance(a,dict):
  out=[]
  for k in sorted(set(a)|set(b)):
   q=p+'/'+k;out += [q]if k not in a or k not in b else diffs(a[k],b[k],q)
  return out
 if isinstance(a,list):
  out=[]
  for i in range(max(len(a),len(b))):
   q=p+'/'+str(i);out += [q]if i>=len(a)or i>=len(b)else diffs(a[i],b[i],q)
  return out
 return []if a==b else[p]
assert sha(P)=='86e42679bda53a932905f444daf68b276868fb08c87fa9df20166674fa5ed9f2'
run=json.loads((B/'execution/runner-unit-feedback-attempt04-vitest.json').read_text());failed=[a for r in run['testResults']if r['name'].endswith('/observedIncrementalValidation.test.ts')for a in r['assertionResults']if a['status']=='failed'];assert len(failed)==12
corrections=[];full=[];parentEvolution={}
for d in declared:
 section=d['section'];par=next(x for x in rows(current,section)if x['name']==d['parent']);bad=next(x for x in rows(current,section)if x['name']==d['name']);historicalParent=next(x for x in rows(old,section)if x['name']==d['parent']);historicalBad=next(x for x in rows(old,section)if x['name']==d['name']);prior=next(x for x in qa['rows']if x['name']==d['name']);sourceDescriptor=next(x for x in inventory if x['name']==d['name']and x['section']==section)
 assert sourceDescriptor['mutations']==d['mutations']==prior['originalMutationDescriptor']
 fixed=copy.deepcopy(d);changes=[];values=[]
 for mut in fixed['mutations']:
  p=mut['pointer'];po,pv=get(par,p);bo,bv=get(bad,p);ho,hv=get(historicalParent,p);hbo,hbv=get(historicalBad,p)
  assert(H(hv)if ho else None)==mut['oldHash'],(d['name'],p,'historical old mismatch')
  oldHash=H(pv)if po else None;newHash=H(bv)if bo else None
  if mut['oldHash']!=oldHash or mut['newHash']!=newHash:changes.append({'pointer':p,'historicalDescriptor':copy.deepcopy(mut),'currentOldHash':oldHash,'currentNewHash':newHash})
  mut.update(oldHash=oldHash,newHash=newHash)
  assert bo!=mut['remove'],(d['name'],p,'presence mismatch')
  metadata=p=='/expectedArtifact'and mut['remove']
  values.append({'pointer':p,'role':'FIXTURE_EXPECTATION_MARKER_NOT_OFFERED_VALIDATION_INPUT'if metadata else'MALICIOUS_VALIDATION_INPUT_OR_DECLARED_EXTERNAL_AUTHORITY','beforePresent':po,'afterPresent':bo,'currentBeforeValue':{'sourceFile':str(P),'section':section,'parentName':d['parent'],'pointer':p,'canonicalSha256':oldHash}if metadata else pv,'currentAfterValue':None if metadata else bv,'historicalBeforeCanonicalSha256':H(hv)if ho else None,'historicalAfterCanonicalSha256':H(hbv)if hbo else None,'currentBeforeCanonicalSha256':oldHash,'currentAfterCanonicalSha256':newHash,'maliciousInputValuePreservedFromArchivedOriginal':(bv==hbv and bo==hbo)if not d['name'].startswith('publication-preimage-')else'POST_REBASE_FORMULA_CHECKED_SEPARATELY'})
 left,right=view(par),view(bad)
 for m in fixed['mutations']:mask(left,m['pointer']);mask(right,m['pointer'])
 assert left==right,(d['name'],'undeclared current delta')
 full.append(fixed)
 if changes:
  assert any(a['fullName'].endswith(d['name'])for a in failed),d['name']
  corrections.append({'name':d['name'],'section':section,'parent':d['parent'],'route':d['route'],'sourceFiles':{'current':str(P),'currentSha256':sha(P),'historicalBefore':str(OLD),'historicalBeforeSha256':sha(OLD)},'hashChanges':changes,'exactPointerValuesAndRoles':values,'currentDeclaredPointersAreExhaustive':True,'exactOnlyDeclaredDeltaAfterMasking':True,'parentSelectionCorrect':True,'correctedCurrentDescriptor':fixed,'negativeValidationStatus':'NOT_RERUN; ORIGINAL_UNIT04_CASE_FAILED_PREIMAGE_GUARD','actualCurrentPositiveParentEvidence':'At unit04 exact unchanged test source executes deriveObservedArtifact(parent).artifact equality and validateObservedRequest(parent).ok:true before assertExactNegativeMutation. The captured failure is at helper original-preimage guard, so these parent preconditions had already passed. This credits only the positive parent preconditions, never the failing negative case.'})
 key=(section,d['parent'])
 if key not in parentEvolution:parentEvolution[key]={'section':section,'parent':d['parent'],'historicalBasisHash':H(historicalParent['basis']),'currentBasisHash':H(par['basis']),'historicalArtifactHash':H(historicalParent['expectedArtifact']),'currentArtifactHash':H(par['expectedArtifact']),'parentChanges':diffs(view(historicalParent),view(par))}
assert len(corrections)==12
formula=[]
def preimage(b):return {'version':1,'basisHash':H(b),'runAuthorizationHash':H(b['runAuthorization']),'translationHash':b['translationHash'],'bootstrapHash':H(b['bootstrap']),'sourceManifestHash':b['sourceManifestHash']}
for name in ['publication-preimage-must-commit-raw-failed-edge','publication-preimage-envelope-cannot-change']:
 d=next(d for d in declared if d['name']==name);par=next(x for x in rows(current,'graph')if x['name']==d['parent']);bad=next(x for x in rows(current,'graph')if x['name']==name);oldBad=next(x for x in rows(old,'graph')if x['name']==name);oldParent=next(x for x in rows(old,'graph')if x['name']==d['parent'])
 assert par['expectedArtifact']['replayPolicy']['publicationEvidenceHash']==H(preimage(par['basis']))
 p=preimage(bad['basis'])
 if name.endswith('raw-failed-edge'):
  redacted=copy.deepcopy(bad['basis']);assert redacted['consumerEdges'];redacted['consumerEdges']=[];p['basisHash']=H(redacted)
 else:p['version']=2
 currentExpectedMaliciousValue=H(p);actual=bad['expectedArtifact']['replayPolicy']['publicationEvidenceHash'];assert currentExpectedMaliciousValue==actual
 formula.append({'name':name,'parent':d['parent'],'sameCurrentBasisAsParent':bad['basis']==par['basis'],'currentCorrectPublicationPreimage':preimage(par['basis']),'currentCorrectPublicationEvidenceHashValue':par['expectedArtifact']['replayPolicy']['publicationEvidenceHash'],'currentMaliciousPreimage':p,'currentMaliciousPublicationEvidenceHashValue':actual,'currentMaliciousValueCanonicalSha256':H(actual),'archivedMaliciousValue':oldBad['expectedArtifact']['replayPolicy']['publicationEvidenceHash'],'archivedMaliciousValueCanonicalSha256':H(oldBad['expectedArtifact']['replayPolicy']['publicationEvidenceHash']),'historicalLedgerNewHash':next(x for x in d['mutations']if x['pointer'].endswith('publicationEvidenceHash'))['newHash'],'maliciousFormulaUnchanged':'Hash entire current basis with raw failed consumer edge omitted ONLY from hypothetical hash preimage'if name.endswith('raw-failed-edge')else'Use same current whole-basis publication preimage but illegal envelope version2','canonicalSourceContradiction':False})
assert all(x['exactOnlyDeclaredDeltaAfterMasking']for x in corrections)
(O/'current-12-corrections.json').write_text(json.dumps({'artifact':'CURRENT independent rebase correction; prior descriptors preserved historical','canonicalImplementation':'Independent Python canonical-v1 ASCII sorted keys, safe integers, original well-formed Unicode strings; not importing/running application oracle','currentCanonicalFixtureSha256':sha(P),'cause':'C-int install.rebase computed historical before/after hashes while applying old mutations to current resealed parents; two graph malicious hashes then recomputed after inventory capture. Prior Quinn review copied this historical descriptor without current per-pointer fingerprint verification.','wrongCurrentParentSelections':0,'canonicalSourceContradictions':0,'rows':corrections},indent=2,ensure_ascii=False)+'\n')
(O/'current-29-boundary-descriptors.json').write_text(json.dumps({'artifact':'Current29 derived descriptors, exact original names/routes/parents/pointers preserved','historicalOriginal':str(qpath),'historicalOriginalSha256':sha(qpath),'currentFixture':str(P),'currentFixtureSha256':sha(P),'scope':'Test metadata only; no implementation or real private-authority credit','rows':full},indent=2)+'\n')
(O/'publication-2-formula-checks.json').write_text(json.dumps({'artifact':'Two independent intended malicious publication-preimage checks','sourceInstallerAfterInventoryRecomputation':'contracts/current-vector-preservation-implementation/install.cjs:24','rows':formula},indent=2,ensure_ascii=False)+'\n')
(O/'parent-evolution.json').write_text(json.dumps({'artifact':'Historical before vs current coherent positive parent differences','parents':list(parentEvolution.values()),'scope':'Source-data integrity only; actual parent validity is separately recorded in unit04 predecessor assertions / prior C-int pure receipts.'},indent=2)+'\n')
print(json.dumps({'rowsCorrected':len(corrections),'boundaryRowsRetained':len(full),'hashCommitmentsChanged':sum(len(r['hashChanges'])for r in corrections),'graphFormulaRows':len(formula),'parents':[(r['section'],r['parent'])for r in parentEvolution.values()]},indent=2))
# Confirm that old descriptor new hashes also name archived malicious values, not current values.
for d in declared:
 historicalBad=next(x for x in rows(old,d['section'])if x['name']==d['name'])
 for mu in d['mutations']:
  exists,value=get(historicalBad,mu['pointer']);assert(H(value)if exists else None)==mu['newHash'],(d['name'],mu['pointer'],'historical new mismatch')
before=json.loads((B/'execution/runner-unit-feedback-attempt04-before.json').read_text());beforefiles={r['path']:r['sha256']for r in before['files']}
observedPaths=[str(P),str(helper),'studio-runner/test/observedIncrementalValidation.test.ts']
for p in observedPaths:assert sha(p)==beforefiles[p],(p,'not actual unit04 source')
result=json.loads((B/'execution/runner-unit-feedback-attempt04-results.json').read_text());assert result['sourceStable']and result['distStable'];assert result['logSha256']==sha(B/'execution/runner-unit-feedback-attempt04.log');assert result['vitestReportSha256']==sha(B/'execution/runner-unit-feedback-attempt04-vitest.json')
repairs=[]
for i,(oldD,newD)in enumerate(zip(declared,full)):
 assert oldD['name']==newD['name']and oldD['parent']==newD['parent']and oldD['route']==newD['route']
 for j,(om,nm)in enumerate(zip(oldD['mutations'],newD['mutations'])):
  assert om['pointer']==nm['pointer']and om['remove']==nm['remove']
  for field in ['oldHash','newHash']:
   if om[field]!=nm[field]:repairs.append({'permanentHelper':'studio-runner/test/helpers/incrementalNegativeBoundaries.ts','boundaryIndex0':i,'name':oldD['name'],'mutationIndex0':j,'pointer':om['pointer'],'field':field,'beforeLiteral':om[field],'afterCurrentLiteral':nm[field],'justification':'Exact current canonical parent/delta independently proved from unchanged fixture; historical literal remains archived.'})
assert len(repairs)==14
minimal={'artifact':'Exact minimal helper metadata repair recommendation','decision':'REPAIR_RUNNER_TEST_HELPER_DERIVED_FINGERPRINTS_ONLY','owner':'Runner015, under separate root exact source release','changeCount':14,'oldHashChanges':sum(r['field']=='oldHash'for r in repairs),'newHashChanges':sum(r['field']=='newHash'for r in repairs),'repairs':repairs,'preservation':['All29 original negative names/sections/coherent parent names/routes/mutation pointers/remove flags retained.','All actual malicious private/basis/authority field values unchanged; two candidate malicious publication values already present in canonical current fixture keep their independently checked original formula.','Retain exact current old/new pointer guards, exact removal absence and full remainder deep equality; do not remove or relax guards.','Ten /expectedArtifact removal entries are fixture expectation metadata; keep deleted metadata and fingerprint it correctly, but do not create an offered candidate from it on private-authority paths.','Do not import QA artifacts at runtime: copy only reviewed current constant metadata into existing permanent helper, with a concise historical/current source comment.','All15 actual backend private/authenticated companions remain UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE.'],'prohibitedAlternative':['Editing canonical vectors/generated/pins to satisfy stale descriptor.','Selecting a different positive parent solely to preserve historical hashes.','Updating hashes from live mutated test values at test runtime or deriving expected fingerprints from the row under test.','Deleting/filer-skipping original cases or swallowing guard mismatches.','Claiming negative boundary passed after unit04: guard failed before malicious boundary; must rerun actual tests.'],'requiredPostRepairEvidence':['Whole TypeScript/scoped lint under owner release.','Fresh root captured full default runner unit/coverage window, all1926 cases accounted with29 historical skips and no new skips/unhandled/load failures; original24 failures retained until new evidence.','Other12 prefixPrepare selector failures are separate current code/test repair scope; this metadata correction does not solve or credit them.'],'sourceReleaseGrantedByReview':False,'testsExecutedByReview':0,'storyGateVerdict':None,'lifecycleTransition':None}
(O/'minimal-runner-helper-repair.json').write_text(json.dumps(minimal,indent=2)+'\n')
inputPaths=[P,OLD,helper,Path('studio-runner/test/observedIncrementalValidation.test.ts'),qpath,E/'install.cjs',E/'mutation-rebase-inventory.json',E/'source-maps.json',E/'mutation-fidelity.json',E/'implementation-receipt.json',E/'evidence-manifest.json',E/'current-vectors.stdout.log',E/'oracle.stdout.log',B/'runner/checkpoint-r0-negative-boundaries01.json',B/'execution/runner-unit-feedback-attempt04-results.json',B/'execution/runner-unit-feedback-attempt04-vitest.json',B/'execution/runner-unit-feedback-attempt04.log',B/'execution/runner-unit-feedback-attempt04-before.json',B/'execution/runner-unit-feedback-attempt04-after.json',Path('tools/check-studio-observed-contracts.cjs'),B/'backend/remaining-facet-review05/build-review.py',B/'backend/remaining-facet-review05/manifest.json',B/'architecture-remaining-uncertainties05/qa-design/manifest.json']
assert sha(B/'backend/remaining-facet-review05/manifest.json')=='958d4bc12a54db1bb4285f2ee1622c06a292ceb9fb4dc08124fc0da64562d5ea'
assert sha(B/'architecture-remaining-uncertainties05/qa-design/manifest.json')=='8297062c213e27d714af9d858659c161fd3d3a036ffc6ccbf1d0dc78393de9a1'
(O/'inspected-inputs.json').write_text(json.dumps({'artifact':'Per-file inspected input hashes','files':[{'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size}for p in inputPaths],'capturedUnit04SourceIdentityConfirmed':observedPaths,'beforeDigest':before['digest'],'scope':'No whole-tree stability or post-repair run claim'},indent=2)+'\n')
report={'artifact':'Independent Quinn exact unit04 parent fingerprint verification','createdUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'decision':'CURRENT_DERIVED_DESCRIPTOR_STALE_CANONICAL_AND_PARENT_SELECTION_CORRECT','wrongParentSelections':0,'canonicalContradictions':0,'currentFixtureSha256':sha(P),'failedCasesDiagnosed':12,'correctedCurrentBoundaryRows':29,'constantFingerprintLiteralsRequiringRepair':14,'expectationMetadataRemovalCases':10,'postRebaseMaliciousPublicationFormulaCases':2,'historicalDescriptorOldAndNewValuesMatchArchivedSource':True,'currentExactOnlyDeclaredDeltasVerified':True,'actualPositiveParentPreconditionsPassedBeforeUnit04Guard':True,'negativeBoundaryRunStatus':'12FAILED_BEFORE_MALICIOUS_VALIDATION; NOT_FIXED_OR_RERUN_HERE','earlierQuinnDerivedMetadataError':'review05 exactOriginalMutationDescriptors copied historical C-int mutation ledger hashes without current per-pointer rebase validation. This new CURRENT correction supersedes that derived current interpretation, not the immutable historical artifact or its29 routes.','privateBackendCompanions':'All15 remain unfulfilled by synthetic runner oracle','sourceImplementationByReview':0,'applicationTestsExecutedByReview':0,'commandsBuildNativeGradleDbFormatGenerationInstallByReview':0,'storyGateVerdict':None,'lifecycleTransition':None}
(O/'review.json').write_text(json.dumps(report,indent=2)+'\n')
print('minimal constants',len(repairs),'prior manifests intact')

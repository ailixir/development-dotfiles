"""Independent partial-component source review. Only inspected pure text functions
are extracted; no verifier main, cached binary, native, runtime or private I/O.
"""
from pathlib import Path
from collections import Counter
import ast,hashlib,json,re,uuid
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';B=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011';O=T/'qa/gst-semantic-port-components-review'
C=T/'early/gs-t-draft/unit05-cut-reference-semantic-port';S=T/'early/gs-t-draft/unit05-session-fixture-source-audit';F=T/'early/gs-t-draft/unit05-session-semantic-port';X=T/'early/gst-clarification-provenance-extension-proposal'
read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();h=lambda s:hashlib.sha256(s.encode()).hexdigest()
ctx=read(B/'gst-semantic-port-components-review-context.json');assert len(ctx['pins'])==10
for row in ctx['pins']:assert sha(R/row['path'])==row['sha256']
member_count=0
for root in [C,S,F,X]:
    for row in read(root/'manifest.json')['files']:
        assert sha(root/row['path'])==row['sha256'] and (root/row['path']).stat().st_size==row['bytes'];member_count+=1
ci=read(C/'inputs.json');si=read(S/'inputs.json');bindings=read(C/'bindings.json');mapping=read(C/'setup-input-assertion-map.json');carry=read(C/'preservation.json');w=read(C/'source-witness.json')
for row in ci['taskPins']+[ci['pureHelper'],ci['predecessorPreservation']]+si['taskPins']+si['sourcePins']+[si['taskContext'],si['pureHelper']]:assert sha(R/row['path'])==row['sha256']
# This source has already been inspected. Never load globals/main (file/binary checks).
tree=ast.parse((C/'verify.py').read_text());pure={'re':re}
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in {'masked','method_span','methods','assertions','apply_strict'}];assert len(nodes)==5
exec(compile(ast.Module(body=nodes,type_ignores=[]),'<inspected-pure-text-functions-only>','exec'),pure)
rel=Path(ci['primaryFile']);before_path=R/ci['unit05ArchiveRoot']/rel.name;after_path=C/'repo'/rel
before=before_path.read_text();after=after_path.read_text()
assert sha(before_path)=='7856020f0fb27e9bca9c1d1f235bd9a0c2eecd3bf135b7c16c6c7aa4ad4f269d'
assert sha(after_path)=='e35d078a682bbd4535f89d31d2aa56ac33ae73a0b4ec8f5bb2bceafdf2457a02'
insert=mapping['setupInsertion']['insertedLocalExact'];anchor=mapping['setupInsertion']['beforeAnchorExact']
old='summary.get("source_reference_id").equals("ref-PASS")';new='summary.get("source_reference_id").equals(expectedReference)'
assert before.count(anchor)==before.count(old)==after.count(insert)==after.count(new)==1
assert before.replace(anchor,insert+anchor).replace(old,new)==after
assert after.replace(insert,'',1).replace(new,old,1)==before
assert pure['apply_strict'](before,(C/'delta-from-unit05.patch').read_text())==after
assert pure['apply_strict'](after,(C/'restore-unit05.patch').read_text())==before
assert 'UUID.nameUUIDFromBytes(' in insert and '(STEP_ID + ":secret:" + "PASS" + ":fill.value")' in insert and '.getBytes(StandardCharsets.UTF_8)' in insert
assert not any(x in insert for x in ['summary','manifest','classifier','sourceSecretReference','query','action(','selected','ledger'])
a,b=pure['method_span'](after,'runGuidedControllerCut');helper=after[a:b]
assert helper.index(insert)<helper.index(anchor)<helper.index('var summary = rows.getFirst();')
bm,am=pure['methods'](before),pure['methods'](after);assert len(bm)==len(am)==31 and bm==am
ba,aa=pure['assertions'](before),pure['assertions'](after);assert len(ba)==len(aa)==541
idx=mapping['assertionMap']['ordinal1Based']-1;assert idx==314
assert [i for i,(x,y) in enumerate(zip(ba,aa)) if x!=y]==[idx]
assert ba[idx]==mapping['assertionMap']['oldFullExpression'] and aa[idx]==mapping['assertionMap']['newFullExpression'] and ba[idx].replace(old,new)==aa[idx]
for conjunct in mapping['assertionMap']['unchangedOtherThreeConjuncts']:assert conjunct in ba[idx] and conjunct in aa[idx]
assert mapping['allTransportAssertionOccurrences']==[{'ordinal1Based':i+1,'oldExpressionSha256':h(x),'newExpressionSha256':h(y),'disposition':'ONE_EXPLICIT_EXPECTED_OPERAND_MAP' if i==idx else 'EXACT'} for i,(x,y) in enumerate(zip(ba,aa))]
for row in mapping['annotatedCallerMap']:
    a,b=pure['method_span'](before,row['annotatedMethod']);assert before[a:b]==row['originalAndSuccessorBody'] and h(before[a:b])==row['bodySha256']
c=w['classifier'];p=R/c['path'];assert sha(p)==c['sha256']
assert '\n'.join(p.read_text().splitlines()[c['firstLine']-1:c['lastLine']])+'\n'==c['text']
f=w['publicFixture'];p=R/f['path'];assert sha(p)==f['sha256'];docs=read(p)['documents']
assert docs['secretReference']['stepId']==f['stepId'] and docs['secretAction']['coordinate']==f['secretActionCoordinate']
material=f['stepId']+':secret:PASS:fill.value';raw=bytearray(hashlib.md5(material.encode('utf-8')).digest());raw[6]=(raw[6]&15)|48;raw[8]=(raw[8]&63)|128
expected='cfg-'+str(uuid.UUID(bytes=bytes(raw)));assert material==w['calculationInputUtf8'] and expected==w['independentlyCalculatedExpectedReference']=='cfg-0d0b8087-472c-3972-b1ba-7eec3eb4518e'
archive=w['ordinaryInputArchiveWitness'];p=R/archive['path'];assert sha(p)==archive['sha256']
for e in archive['excerpts']:assert '\n'.join(p.read_text().splitlines()[e['firstLine']-1:e['lastLine']])+'\n'==e['text']

# Preservation arithmetic uses unchanged bindings for the other two files, not a full candidate.
baseline=unit=additive=methods=0
for row in bindings:
    original=R/ci['originalRoot']/row['file'];unit05=R/ci['unit05ArchiveRoot']/Path(row['file']).name
    assert sha(original)==row['originalS011Sha256'] and sha(unit05)==row['unit05ArchiveSha256']
    original_expr=Counter(pure['assertions'](original.read_text()));unit_expr=Counter(pure['assertions'](unit05.read_text()))
    assert not(original_expr-unit_expr)
    baseline+=sum(original_expr.values());unit+=sum(unit_expr.values());additive+=sum((unit_expr-original_expr).values());methods+=len(pure['methods'](unit05.read_text()))
    if Path(row['file'])==rel:
        assert row['successorSha256']==sha(after_path) and row['copiedOrEditedHere'] is True and original_expr[ba[idx]]==1
        mapped=original_expr.copy();mapped[ba[idx]]-=1;mapped[aa[idx]]+=1
        assert not(mapped-Counter(aa)) and Counter(aa)-mapped==unit_expr-original_expr
    else:assert row['successorSha256']==row['unit05ArchiveSha256'] and row['copiedOrEditedHere'] is False
assert (methods,baseline,unit,additive)==(80,751,813,62)
prior=read(R/ci['predecessorPreservation']['path']);assert carry['fullExpectedCases']==prior['fullExpectedCases'] and len(carry['fullExpectedCases'])==99
assert len(carry['modeVariants'])==9
sentinels=[x for x in carry['fullExpectedCases'] if x['class'].rsplit('.',1)[-1] not in [Path(x['file']).stem for x in bindings]];assert len(sentinels)==11

# Exact independently partial trusted-policy Session component, no clarification implementation.
session_before=(R/si['baseSessionPath']).read_text();session_after=(S/'GuidedSessionIT.java').read_text()
assert sha(S/'GuidedSessionIT.java')=='18dd014435195df240db8221720b5d2cfec8d991df2c42a4ab00a63d7e9bb457'
assert pure['methods'](session_before)==pure['methods'](session_after) and len(pure['methods'](session_after))==44
assert pure['assertions'](session_before)==pure['assertions'](session_after) and len(pure['assertions'](session_after))==234
assert pure['apply_strict'](session_before,(S/'delta-from-unit05.patch').read_text())==session_after
assert pure['apply_strict'](session_after,(S/'restore-unit05.patch').read_text())==session_before
a,b=pure['method_span'](session_after,'installFixtureGovernance');stripped=session_after[:a]+session_after[b+2:]
stripped=stripped.replace('  /** Same governed policies and CSI limits; trusted pins cover both raced applications. */\n','')
c,d=pure['method_span'](session_before,'newService');old_factory=session_before[c:d]
c,d=pure['method_span'](stripped,'newService');assert stripped[:c]+old_factory+stripped[d:]==session_before
assert 'new GuidedCsiBudget(jdbc, new GuidedCsiBudgetProperties(1000, 5242880, 640000))' in session_after
assert 'translationQuestion' not in session_after and 'studio_guided_clarification_contexts' not in session_after
fixture=(R/'backend/src/test/java/com/citi/put/checks/studio/support/ObservedPublicationFixture.java').read_text()
assert 'ensurePolicy(jdbc, csiId, applicationId, environmentId, origins, applicationPolicy, stance);' in fixture
assert 'ArrayNode all = (ArrayNode) C.parse(POLICIES_JSON);' in fixture and 'all.add(policy.deepCopy());' in fixture
# Source-only equivalence of old orders trusted entries, plus the previously missing other scope.
def trusted(app,env,pid):return {'version':1,'policyId':pid,'policyVersion':'1','applicationId':app,'environment':env,'entryPolicyId':'entry-'+app,'allowedOrigins':['https://orders.example.test'],'applicationPolicy':{'policyRuleId':'app','allowStructuralDiscovery':True,'readGrants':[]},'rules':[]}
old_orders=[trusted('orders',env,'policy-orders-'+env) for env in ['fixture','other']]
new_three=[trusted(app,env,'policy-'+app+'-'+env) for app in ['orders','other'] for env in (['fixture','other'] if app=='orders' else ['fixture'])]
assert new_three[:2]==old_orders and {(x['applicationId'],x['environment']) for x in new_three}=={('orders','fixture'),('orders','other'),('other','fixture')}
assert 'policiesJsonWith(\n                trusted.toArray(JsonNode[]::new))' in session_after and 'fixture.catalogJson()' in session_after
conflict=read(F/'manifest.json');extension=read(X/'proposal.json')
assert conflict['implementedSemanticCandidate'] is conflict['executionReleased'] is False and extension['actualSourceOrNativeReleased'] is False
root=read(T/'resume2-gst-unit05-closed-and-semantic-port-root-adoption.json');assert root['sharedSourceWriterOrNativeOrRetryReleased'] is False and root['mandatoryPreservation']['unit05Expressions']==813
out={'disposition':'TWO_PARTIAL_SOURCE_COMPONENTS_SUPPORTED_NO_REQUIRED_CORRECTION','dispatchPinsVerified':10,'manifestMembersVerified':member_count,'transportComponentManifestSha256':sha(C/'manifest.json'),'transportPreviewSha256':sha(after_path),'transportStrictForwardReverseAndOnlyTwoSplices':True,'transportKnownInputExpectedComputedBeforeTerminalQuery':True,'expectedReference':expected,'sutOrManifestSummaryRowDerivedExpected':False,'transportAnnotatedBodiesExact':31,'transportExpressions':541,'otherTransportExpressionsExact':540,'mappedOperandCount':1,'baselineExpressions':751,'otherBaselineExpressionsExact':750,'unit05Expressions':813,'otherUnit05ExpressionsExact':812,'additiveChecksRetained':62,'orderedMethodsCarriedWithOtherBindings':80,'cases':99,'modes':9,'sentinels':11,'sessionPartialSha256':sha(S/'GuidedSessionIT.java'),'sessionAnnotatedBodiesExact':44,'sessionExpressionsExact':234,'sessionStrictReversal':True,'existingOrdersPoliciesAndDefaultPoliciesPreserved':True,'realGovernedLifecycleAndLimitsPreserved':True,'newMeaningConflictStillUnresolved':True,'extensionPrototypeReviewedOrApproved':False,'completeSessionOrThreeFileCandidate':False,'formatCompileSqlRuntimeReadinessRemedyOrCreditProved':False,'sourceOrderNativeRetryOrLifecycleReleased':False,'rawXmlLogTempJournalThreadBinaryBusinessOrLocatorAccess':False,'helperMainRuntimeProcessLockSignalNetworkOrGitAction':False,'budgetCeilingUsd':500,'aggregateSpendAvailable':False}
(O/'audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))

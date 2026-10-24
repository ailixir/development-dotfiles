"""Finite public-document/AST and declarative field checks; no target execution."""
import ast
import hashlib
import json
from pathlib import Path
import re
import stat

B=Path('docs/qa/evidence/STUDIO-OBS-011/t0')
S=B/'early/gateway80-failed-red-resource-prep/resume4'
O=B/'resume-architecture/resume2/gateway-failed-resource-typed-python-role-design'
checks=[]
def check(name, value):
    checks.append({'id':name,'passed':bool(value)})
    if not value:raise AssertionError(name)
def load(path):return json.loads(path.read_bytes())
def sha(raw):return hashlib.sha256(raw).hexdigest()

provenance=load(O/'provenance.json')
for packet in provenance['completeSealedPackets']:
    manifest=packet['manifest'];directory=Path(manifest['path']).parent
    raw=Path(manifest['path']).read_bytes()
    check('MANIFEST-'+str(directory),sha(raw)==manifest['sha256'] and len(raw)==manifest['bytes'])
    rows=packet['completePayloads']
    check('COUNT-'+str(directory),len(rows)==packet['payloadCount'] and len({r['path'] for r in rows})==len(rows))
    for row in rows:
        p=directory/row['path'];raw=p.read_bytes()
        check('PAYLOAD-'+str(p),sha(raw)==row['sha256'] and len(raw)==row['bytes'] and stat.S_IMODE(p.stat().st_mode)==row['mode'])
        if p.suffix=='.json':json.loads(raw)
        if directory==S and p.suffix=='.py':
            ast.parse(raw)
            check('SOURCE04-AST-'+p.name,True)
    check('MEMBERSHIP-'+str(directory),{str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()}=={r['path'] for r in rows}|{'manifest.json'})
for pin in provenance['publicRootMetadataPins']+[provenance['savedTask'],provenance['savedContext']]:
    p=Path(pin['path']);raw=p.read_bytes()
    check('PUBLIC-ROOT-PIN-'+p.name,sha(raw)==pin['sha256'] and len(raw)==pin['bytes'] and stat.S_IMODE(p.stat().st_mode)==pin['mode'])
K=load(S/'contract.json');role=load(O/'role-contract.json');mapping=load(O/'dependency-map.json');actors=load(O/'actor-union.json');ns=load(O/'namespace-plan.json');plan=load(O/'adaptation-plan.json');controls=load(O/'future-controls.template.json');owners=load(O/'owner-decisions.template.json');schema=load(O/'schemas.json')
check('CURRENT-SOURCE04-UNSATISFIED',role['currentSource04']=='UNCHANGED_HOLD' and role['legacyReportedCanonicalPredicateSatisfied'] is False and role['legacyPredicateEquivalent'] is False)
check('PROPOSAL-NOT-OWNER-DECISION',role['designRouteSelected'] is True and role['policySelected'] is False and role['actualAuthority'] is False)
check('REPORTED44-SHA',role['selfTextConstraints']['reported']['expectedUtf8Bytes']==44 and role['selfTextConstraints']['reported']['expectedTextSha256']=='6ca8f35c51bc4625b88aba368e0e3e6b52bd4f043902a68ceae684135a43d0f2')
check('ORIG124-SHA',role['selfTextConstraints']['origArgv0']['expectedUtf8Bytes']==124 and role['selfTextConstraints']['origArgv0']['expectedTextSha256']=='246e02e7d1db128f0eb0625c3692aad64a4bc811387aa4a58d4914b479242165')
check('REPORTED-NO-PHYSICAL-PATH',role['selfTextConstraints']['reported']['physicalPath'] is None)
physical=role['physicalPythonRoles'];app=K['expectedPythonRoles']['process'];binary=K['expectedPythonRoles']['launch']
check('PHYSICAL-BIN-APP-EXACT',physical=={'requestedLaunchBIN':binary,'sampledProcessAPP':app,'origArgv0CanonicalAPP':app})
check('ORIG-LITERAL-APP-RETAINED',role['selfTextConstraints']['origArgv0']['independentLiteralEqualityRequired']==app['path'])
check('ORIG-KNOWN-PUBLIC-LITERAL-DIGEST',sha(app['path'].encode())==role['selfTextConstraints']['origArgv0']['expectedTextSha256'] and len(app['path'].encode())==124)
expected={r['path']:r['sha256'] for r in [binary,app,*K['expectedObservationExecutables'].values(),*K['binaryAncestors'].values()]}
check('EXACT-SEVEN-NOT-EIGHT',len(expected)==7 and expected==role['sevenPhysicalExpectedHashesAncestryOnly'])
check('NO-GUESSED-MODES-OR-WITNESSES',role['actualPhysicalModes'] is None and role['actualWitnesses'] is None and controls['physicalBinaryHashes'] is None and controls['physicalBinaryModes'] is None and controls['physicalBinaryWitnesses'] is None)
for key in ['physicalSevenFactoryBeforeAnyMutation','noCallerBinaryMaps','psStartCommArgvBeforeAfter','twoLsofTxtAppAndFileChecks','allSevenFileModeHashBeforeAfter','parentLaunchIsActorAttestation','digestAndCountBothRequired','origArgv0LiteralAppEqualityRequired']:
    check('REQUIRED-'+key,role['runtimeRequirements'][key] is True)
check('SELF-BOUND-BEFORE-ENCODE',role['runtimeRequirements']['maximumCharactersBeforeEncoding']==4096 and role['runtimeRequirements']['maximumUtf8BytesBeforeEncodingOrHash']==4096 and role['runtimeRequirements']['rejectEmptyNulSurrogate'] is True)
check('NO-SELF-PHYSICAL-CLAIM',role['runtimeRequirements']['reportedDigestIsPhysicalIdentity'] is False and role['runtimeRequirements']['metadataHelperQualifiesClient'] is False and role['runtimeRequirements']['parentFingerprintClaimed'] is False)
check('RAW-INPUT-PROHIBITIONS',set(['executable','path','Path','resolve','open','stat','read','cwd','environment','authorization-map-key','alias','raw-output','exception-output'])<=set(role['rawSelfTextUsesForbidden']))
for site in mapping['sourceProductionLexicalSites']:
    line=(S/site['file']).read_text().splitlines()[site['line']-1]
    check('MAPPED-ROLE-SITE-'+site['file']+':'+str(site['line']),sha(line.encode())==site['lineSha256'] and (site['expression'] is None or line==site['expression']))
check('WHOLE-118-13-INTERPRETATION',mapping['all118ExistingInterpretationSites']==load(S/'interpretation-map.json') and mapping['all118ExistingInterpretationSites']['reachedInterpretationSiteCount']==118 and mapping['all118ExistingInterpretationSites']['inputClassCount']==13)
check('WHOLE-API-REGISTRY',mapping['allExistingApiMap']==load(S/'api-map.json') and mapping['allExistingRegistry']==load(S/'source-reason-registry.json'))
check('ALL18-DEPENDENCY-CATEGORIES',len(mapping['explicitDependencyCategories'])==18 and mapping['lexicalSiteCount']==len(mapping['sourceProductionLexicalSites'])==41)
old=set(K['finiteUnion']['numericIds']);known=actors['knownPostBaseActors'];pids={r['pid'] for r in known}
check('EXACT-11-KNOWN-ACTORS',len(known)==11 and pids=={83174,87046,92696,98057,25986,26057,76659,31100,9355,78232,11779})
check('ACTUAL-SET-UNION-2266',len(old)==2255 and actors['effectiveKnownMetadataUnionCount']==len(old|pids)==2266 and actors['intersectionWithOld2255']==sorted(old&pids)==[])
check('SET-UNION-DIGEST',sha(json.dumps(sorted(old|pids),separators=(',',':')).encode())==actors['effectiveKnownMetadataUnionSha256'])
check('OLD-SEVEN-PAIRS-NUMERIC3',actors['oldBase']['sevenHistoricalPidStartJoins']==K['finiteUnion']['historicalPidStartsRequiringAbsentOrReused'] and len(actors['oldBase']['sevenHistoricalPidStartJoins'])==7 and actors['oldBase']['numericOnlyAbsent']==[73492,86096,96486])
check('OLD-GAPS-UNCHANGED',actors['oldBase']['oldUtilityStartGaps']==2245 and actors['oldBase']['oldIncompleteClientFingerprints']==4)
byid={r['pid']:r for r in known}
for who in known:
    check('TYPED-ACTOR-'+str(who['pid']),who['fullFingerprint'] is None and who['qualified'] is False and who['requiredDisposition']=='NUMERIC_ABSENCE_EVERY_APPLICABLE_COMPLETE_TABLE_AND_BOTH_FINITE_JOINS')
check('FAILED-CLIENT-OUTER1-NOT-SETUP0',byid[25986]['actualStatus']==1 and byid[25986]['directWaitClaimed'] is False and byid[25986]['start']=='Mon Oct 19 18:01:01 2026')
check('UTILITY-WAIT0-PARENT-NULL',byid[26057]['actualStatus']==0 and byid[26057]['directWaitClaimed'] is True and byid[26057]['ppid'] is None)
for number in [9355,78232,11779]:
    check('EXTERNAL-PARENT-TOOL-NOT-WAIT-'+str(number),byid[number]['ppid']==17932 and byid[number]['actualStatus']==0 and byid[number]['directWaitClaimed'] is False and byid[number]['start'] is None)
check('N01-EXACT7',ns['priorN01']==K['priorNamespaces'][0] and len(ns['priorN01']['members'])==7 and ns['priorN01IndexSha256']==K['priorFailureIndexSha256'])
index=provenance['exactActualN02MetadataIndex']
check('N02-EXACT8',ns['priorN02']['members']==index['members'] and len(index['members'])==8 and sum(r['bytes'] for r in index['members'])==671798)
check('N02-AUTH-SETUP-PINS',{r['path']:r['sha256'] for r in index['members']}['root-authorization.json']=='d81ab9688986609f3d3ab9c323743da11a3f1fb7b248b26cc1750aaf9b1781dd' and {r['path']:r['sha256'] for r in index['members']}['root-setup-ownership.json']=='7cc83a4de79cc29d67cd49dab0d2ab427c2f4fc33ce2204cfecc9892ba11243d')
check('N02-TYPES-MODES-UID',all(r['kind']=='REGULAR' and r['mode']==384 and r['uid']==501 and r['nlink']==1 for r in index['members']))
check('ORIGINAL2263-BOTH-PRIORS',len(K['frozenEvidence']['oldMembers'])==2263 and ns['directEntryCounts']['beforeN03']==2265 and ns['directEntryCounts']['afterExclusiveN03Only']==2266 and ns['directEntryCounts']['newN03ActuallyExists'] is False)
check('N03-PROSPECTIVE-NO-FACT',ns['newN03Files']['physicalIdentity'] is None and ns['currentNamespacesReadByDesign'] is False and ns['future']['actualNameAvailabilityObserved'] is False)
check('CONSISTENT-FUTURE-NAMES',ns['future']==plan['future']==controls['future'] and ns['future']['namespace'].endswith('/failed-red-resource-disposition03') and ns['future']['variablesPrefix']=='GATEWAY_FR04_' and 'code05-exact-review' in ns['future']['architectureReviewDirectory'] and 'code05-exact-review' in ns['future']['qaReviewDirectory'])
for owner in owners['records']:
    check('INERT-OWNER-'+owner['owner'],owner['owner'] in ['Aria','Quinn','root'] and owner['decision']=='NOT_ISSUED' and owner['authorized'] is False and owner['acceptNarrowResourceOnlyProofSubjectCorrection'] is False and owner['legacyReportedCanonicalPredicateSatisfied'] is False and owner['code05ManifestSha256'] is None and owner['actualRuntimeAuthorized'] is False)
check('THREE-DISTINCT-OWNERS',{r['owner'] for r in owners['records']}=={'Aria','Quinn','root'})
check('INERT-CONTROL',all(controls[k] is False for k in ['authorized','policyAuthorized','installationAuthorized','phaseAuthority','cleanup','credit']) and controls['newDirectoryPins']=={} and all(v is None for v in controls['newCodePins'].values()) and len(controls['newCodePins'])==6)
check('FIRST3-BEFORE-MUTATION',all(r['beforeMutation'] is True for r in plan['components'][:3]) and len(plan['components'])==10)
check('NO-IMPLEMENTATION-PROBE-LAUNCH',plan['sourceImplementationPresent'] is False and plan['newImplementationActualSelection'] is False and plan['newProbeSelected'] is False and plan['newLaunchOrEnvironmentMechanismSelected'] is False)
check('CLOSURE-ALL-PHASES-OWED',all(n in plan['stateOrder'] for n in ['NEGATIVE1_MISSING_READINESS_NO_CLOSE','SAME_HELD0_ROOT_ADMISSION','ARCHIVE_ONCE0_ACTUAL_QA_ROOT','FINAL_ONCE0_SEPARATE_COMPLETION_INSPECTION','DISTINCT_READINESS_BOUND60S_PREPOST_PERMIT_GATE0','GUARDED_ACTUAL_WRAPPER1','OUTER_POSTCLOSE0_COMPLETION_ACTUAL_QA_ROOT']))
check('CAPS-EXACT',plan['retainedCapsAndBudgets']==K['limits'])
for name, obj in schema['schemas'].items():
    check('CLOSED-SCHEMA-'+name,obj['type']=='object' and obj['additionalProperties'] is False and set(obj['required'])==set(obj['properties']))
check('CLIENT-LEGACY-FALSE-SCHEMA',schema['schemas']['qualifiedTypedClient']['properties']['legacyReportedCanonicalPredicateSatisfied']=={'const':False})
spec=load(O/'check-spec.json')
for row in spec['cases']:
    # Pure synthetic declarative conjunction, never target/provider execution.
    modeled=all(type(v)is bool and v is True for v in row['syntheticTypedFields'].values())
    check('DECLARATIVE-PAIR-'+row['case'],modeled is row['expectedModelConjunction'] and row['actualAuthority'] is False)
check('EXACT12-DECLARATIVE-CASES',len(spec['cases'])==12 and spec['runtimeFunctionsExecuted'] is False)
check('SOURCE-F9-ANCESTRY-ONLY',controls['sourceDigestAncestry']==K['protectedInputs']['sourceDigest'] and controls['normalRoute']=='HARD_HOLD' and controls['newNativeInvocations']==0 and controls['expectedWrapperExit']==1)
check('COMPLETE-CONDITIONS-BOUND',load(O/'conditions.json')['fingerprintDesignAndQaRootAdoptionComplete']==load(B/'resume2-gateway-self-text05-design-qa-root-adoption.json') and load(O/'conditions.json')['priorSource04FullDesignRootConditions']==load(S/'design-qa-root-adoption.json'))
print(json.dumps({'kind':'BOUNDED_TYPED_ROLE_SOURCE_DESIGN_FINITE_CHECKS','passed':len(checks),'failed':0,'checks':checks,'declarativeCases':12,'targetRuntimeFunctionsExecuted':0,'actualRuntimeActions':0,'newCodeImplementation':False,'oldSuitesReplayed':False,'sameSource04PublicPacketUnchanged':True},indent=2))

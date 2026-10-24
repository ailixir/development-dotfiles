"""Read CLOSED default public artifacts only. Export explicit closed facts, never payloads."""
from pathlib import Path
import collections, datetime, hashlib, json, re, stat, xml.etree.ElementTree as ET
R=Path.cwd();T=R/'docs/qa/evidence/STUDIO-OBS-011/t0';OUT=Path(__file__).parent
H=lambda b:hashlib.sha256(b).hexdigest();load=lambda p:json.loads(p.read_text())
diag=load(T/'resume2-fullcheck03-closed-default-public-diagnostic.json')
receipt=load(T/'early/fullcheck-harness/resume3/runs/obs011-t0-fresh-check03/receipt.json')
started=datetime.datetime.fromisoformat(receipt['collectorStartedAtUtc'].replace('Z','+00:00')).timestamp()*1e9
assert receipt['label']=='obs011-t0-fresh-check03' and receipt['collectorInvocations']==1 and receipt['sourceWrites']==0
sources={'backend/build.gradle.kts':'fee7af874cc0875d8dd299f8f9e1a0739ae79347ba0b0de665c81931045cbe74','backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java':'b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475'}
for p,h in sources.items():assert H((R/p).read_bytes())==h
native=(R/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-fresh-check03.log').read_text()
markers={s:[i+1 for i,line in enumerate(native.splitlines()) if line.strip()==s] for s in ['> Task :test FAILED','> Task :retainOriginalGuidedCohort','> Task :guidedIncrementalTest']}
assert all(len(v)==1 for v in markers.values()) and list(markers.values())[0][0]<list(markers.values())[1][0]<list(markers.values())[2][0]
facts=[]
def read_closed(path,role):
 before=path.stat();raw=path.read_bytes();after=path.stat()
 assert (before.st_mtime_ns,before.st_size,stat.S_IMODE(before.st_mode))==(after.st_mtime_ns,after.st_size,stat.S_IMODE(after.st_mode))
 assert before.st_mtime_ns>started
 facts.append({'role':role,'sha256':H(raw),'bytes':len(raw),'mtimeNs':before.st_mtime_ns,'mode':oct(stat.S_IMODE(before.st_mode)),'stableAcrossRead':True,'freshAfterCollectorStart':True})
 return raw
xmlpath=R/diag['publicXmlFact']['path'];xmlbytes=read_closed(xmlpath,'closed-default-Replay-public-XML')
assert H(xmlbytes)==diag['publicXmlFact']['sha256'] and xmlpath.stat().st_mtime_ns==diag['publicXmlFact']['mtimeNs']
xml=ET.fromstring(xmlbytes);method='actualCoreGuidedSameSecretIdStaysWithinPersistedScope';case=next(c for c in xml.findall('testcase') if c.get('name')==method+'()');failure=case.find('failure')
assert failure.get('type')=='org.opentest4j.AssertionFailedError'
message=failure.get('message','');allowedStates={'FINALIZING','FAILED','EXPIRED','UNKNOWN_OUTCOME','CANCELLED'}
statepairs=re.findall(r'(expected|but was):\s*"([A-Z_]+)"',message)
assert statepairs==[('expected','FINALIZING'),('but was','FAILED')]
frames=[{'file':f,'line':int(n)} for f,n in re.findall(r'(GuidedPublicationReplayIT\.java):(\d+)',failure.text or '')]
assert [x['line'] for x in frames]==[32322,20361,24056,20329]
cohorts=[p for p in (R/'backend/build/guided-cohorts/test').rglob('cohort.json') if p.stat().st_mtime_ns>started]
assert len(cohorts)==1
cp=cohorts[0];cohort=json.loads(read_closed(cp,'closed-default-cohort'))
assert cohort['lane']=='test' and cohort['profile']=='original4000' and cohort['runId']==cp.parent.parent.name and cohort['cohortId']==cp.parent.name
inv=next(i for i in cohort['invocations'] if i['method']==method)
assert inv['invocationOrdinal']==12 and inv['variant']=='singleton' and inv['variantOrdinal']==0 and inv['passed'] is False and inv['afterEachComplete'] is True
assert len(cohort['invocations'])==len(xml.findall('testcase'))==46
assert collections.Counter(i['method']+'()' for i in cohort['invocations'])==collections.Counter(c.get('name') for c in xml.findall('testcase'))
byname={c.get('name'):c for c in xml.findall('testcase')}
assert all(i['passed']==(byname[i['method']+'()'].find('failure') is None and byname[i['method']+'()'].find('error') is None) for i in cohort['invocations'])
metadata={}
for prefix in ['model-budget-evidence','responses','privacy']:
 for boundary in ['after-each','final']:
  if prefix=='privacy' and boundary=='after-each':continue
  suffix='.json' if prefix=='privacy' else '-'+boundary+'.json'
  ps=list(cp.parent.glob(prefix+'-test-12-'+method+'-singleton'+suffix))
  assert len(ps)==1,(prefix,boundary,len(ps))
  d=json.loads(read_closed(ps[0],prefix+'-'+boundary));metadata[(prefix,boundary)]=d
  assert d['invocationOrdinal']==12 and d['variantOrdinal']==0
budget=metadata[('model-budget-evidence','after-each')];response=metadata[('responses','after-each')]
assert budget==metadata[('model-budget-evidence','final')]
finalresponses=metadata[('responses','final')]['calls']
assert len(response['calls'])==len(finalresponses)
assert all(a=={k:v for k,v in b.items() if k not in ['attemptDispositionRead','attemptApplied']} for a,b in zip(response['calls'],finalresponses))
assert all(b['attemptDispositionRead'] and b['attemptApplied'] for b in finalresponses)
assert budget['complete'] and response['diagnosticFailures']==0 and len(budget['sessions'])==4
sessions=budget['sessions'];assert [s['sessionOrdinal'] for s in sessions]==[15,16,17,18]
sessionfacts=[]
for s in sessions:
 n=s['sessionOrdinal'];calls=[c for c in response['calls'] if c['sessionOrdinal']==n]
 assert [c['attemptOrdinal'] for c in calls]==list(range(1,len(calls)+1))
 assert len(calls)==len(s['attempts'])==len(s['beforeGatewaySend'])
 assert all(c['modelEvaluated'] and c['bodyServed'] and c['terminalRecorded'] and c['joined'] for c in calls)
 assert all(c['invocationOrdinal']==12 and c['variantOrdinal']==0 for c in calls)
 assert all(a['wireFound'] for a in s['attempts'])
 sessionfacts.append({'sessionOrdinal':n,'attempts':len(calls),'modelKinds':dict(collections.Counter(c['kind'] for c in calls)),'actualCounters':s['actualCounters'],'sessionLimits':s['sessionLimits'],'sourcePlanObligations':calls[0]['obligations'],'sourcePlanReferences':calls[0]['sourceReferences'],'allCallsEvaluatedBodyServedTerminalRecorded':True,'allAttemptWiresFound':True,'allFinalDispositionReadApplied':True})
assert [s['attempts'] for s in sessionfacts]==[7,7,7,1]
assert [c['kind'] for c in response['calls'] if c['sessionOrdinal']==18]==['SOURCE_PLAN']
privacy=metadata[('privacy','final')];assert privacy['sessionOrdinals']==[15,16,17,18]
# The time window is a bounded chronology aid, not a session-identity join or exact assertion time.
prev=list(cp.parent.glob('responses-test-11-*-after-each.json'));assert len(prev)==1
prevbytes=read_closed(prev[0],'previous-invocation-after-each-response');prevdata=json.loads(prevbytes);assert prevdata['invocationOrdinal']==11
left=datetime.datetime.fromtimestamp(prev[0].stat().st_mtime,datetime.timezone.utc)
right=datetime.datetime.fromtimestamp(next(cp.parent.glob('responses-test-12-'+method+'-singleton-after-each.json')).stat().st_mtime,datetime.timezone.utc)
logs=[]
for line in xml.find('system-out').text.splitlines():
 try:d=json.loads(line)
 except ValueError:continue
 try:t=datetime.datetime.fromisoformat(d.get('timestamp','').replace('Z','+00:00'))
 except ValueError:continue
 if left<=t<=right:logs.append((d,line,t))
audits=[d for d,line,t in logs if d.get('logger')=='com.citi.put.checks.audit.studio']
admitted=[d for d in audits if d.get('eventType')=='GUIDED_ACTION_ADMITTED']
ids={};auditfacts=[]
for d in admitted:
 ordinal=ids.setdefault(d['sessionId'],len(ids)+1)
 assert d['outcome']=='ADMITTED' and d['obligationKind'] in ['navigate','fill','click','assert']
 auditfacts.append({'localGroupOrdinal':ordinal,'timestamp':d['timestamp'],'eventType':'GUIDED_ACTION_ADMITTED','obligationKind':d['obligationKind']})
assert collections.Counter(x['localGroupOrdinal'] for x in auditfacts)=={1:6,2:6,3:6}
warnings=[]
for d,line,t in logs:
 if d.get('logger')!='com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient':continue
 m=re.fullmatch(r'Guided runner refused the context for session ([a-f0-9-]+) \(contextHash [a-f0-9]+\): ([A-Z_]+)',d.get('message',''))
 assert m and m[2]=='CONTEXT_LOST'
 warnings.append({'timestampUtc':t.astimezone(datetime.timezone.utc).isoformat(),'logger':'com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient','closedRunnerCode':'CONTEXT_LOST','lineSha256':H(line.encode()),'matchesOneOfThreeObservedAuditSessionIds':m[1] in ids,'exactFourthSessionIdentityBinding':'NOT_PRESENT_IN_PUBLIC_METADATA'})
assert len(warnings)==1
publictext='\n'.join(x.text or '' for x in xml.findall('system-out')+xml.findall('system-err'))
assert not any(x in publictext for x in ['GUIDED_START_FAILED','GuidedStartFailure','GuidedLaunchFailure'])
for p,h in sources.items():assert H((R/p).read_bytes())==h
assert H(xmlpath.read_bytes())==H(xmlbytes) and xmlpath.stat().st_mtime_ns==diag['publicXmlFact']['mtimeNs']
out={'scope':'PROVISIONAL_CLOSED_DEFAULT_PUBLIC_DIAGNOSIS_ONLY_NOT_FULL_EXECUTION_ASSESSMENT','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rootDiagnosticSha256':H((T/'resume2-fullcheck03-closed-default-public-diagnostic.json').read_bytes()),'sourceHashes':sources,'closureNativeMarkers':markers,'artifactFacts':facts,'xml':{'class':'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT','name':method+'()','tests':int(xml.get('tests')),'failures':int(xml.get('failures')),'errors':int(xml.get('errors')),'caseSeconds':float(case.get('time')),'exceptionType':failure.get('type'),'expected':'FINALIZING','actual':'FAILED','sourceFileFrames':frames,'hasSuppressedFailure':bool(re.search(r'\bSuppressed:',failure.text or ''))},'cohortFlags':{k:v for k,v in cohort.items() if isinstance(v,(bool,int))},'invocation':{k:inv[k] for k in ['method','invocationOrdinal','variantOrdinal','variant','passed','afterEachComplete']},'sessionFacts':sessionfacts,'sessionOrdinalsAtPrivacyFinal':privacy['sessionOrdinals'],'fourthAxisInference':{'axis':4,'basis':'Four accepted tracked sessions within this reset invocation; only one successful202 guided start per sequential axis and no other creation in the method. Public source/budget/response/privacy artifacts agree on four. Existing source checks must complete before the next axis start.','sameCsiEnvironmentAsAxis1NewTest':True,'labelSecondLearningUsedAsEvidence':False},'boundedLogWindow':{'leftPreviousAfterEachUtc':left.isoformat(),'rightCurrentAfterEachUtc':right.isoformat(),'exactAssertionTime':False,'admittedActionGroups':auditfacts,'contextRefusals':warnings,'warningExactFailingSessionJoin':False},'missingPublicStartFacts':{'GUIDED_START_FAILED':True,'phase':True,'loss':True,'causeChain':True,'firstStoppingWriter':True},'cause':'UNPROVEN','minimalRemedyPrepared':False,'rawFailureMessageOrStackOrIdentityOrPrivatePathExported':False,'privateArtifactReads':0,'sourceWrites':0,'nativeCalls':0,'wholeCollectorTerminalOrCoverageOrLaneCreditClaim':False,'originalOwnedIdentityObservationGapRemains':True}
(OUT/'public-facts.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'artifactCount':len(facts),'caseActualState':'FAILED','failingAxisSourceInference':4,'sessionAttempts':[s['attempts'] for s in sessionfacts],'publicContextRefusals':len(warnings),'cause':'UNPROVEN','sourceWrites':0,'privateReads':0},indent=2))

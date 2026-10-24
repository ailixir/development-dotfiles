from pathlib import Path
import json,hashlib,re,difflib
R=Path.cwd(); D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-b-draft'; A=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gsm-a-draft/resume2/repo'; G=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/gs-t-draft/repo'
S='backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java'; T='backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedSessionIT.java'; N=T.replace('GuidedSessionIT','GuidedAdmissionWithoutTranslationIT')
def sha(b):return hashlib.sha256(b).hexdigest()
def put(p,v):
 p=D/p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(v)
def patch(rows):
 return ''.join(''.join(difflib.unified_diff(a.splitlines(True), b.splitlines(True), fromfile='a/'+p if a else '/dev/null', tofile='b/'+p)) for p,a,b in rows)
def names(s):return re.findall(r'@Test\s+(?:public\s+)?void\s+(\w+)\(',s)
files=[]; combined=[]; incremental=[]
for p in sorted((D/'repo').rglob('*.java')):
 rel=str(p.relative_to(D/'repo')); final=p.read_text(); base=((G/rel) if rel==T else (A/rel))
 b=base.read_text() if base.exists() else ''; s=(R/rel).read_text() if (R/rel).exists() else ''
 files.append({'path':rel,'baseSha256':sha(b.encode()) if b else None,'baseOrigin':str(base.relative_to(R)) if b else None,'S011Sha256':sha(s.encode()) if s else None,'draftSha256':sha(final.encode()),'bytes':len(final.encode()),'forwardedUnchanged':b==final})
 combined.append((rel,s,final))
 if b!=final:incremental.append((rel,b,final))
put('part-b.patch',patch(incremental));put('S011-owned-seven-paths.patch',patch(combined));
for rel in ['backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java','backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedLifecycleReasonIT.java']:
 combined.append((rel,(R/rel).read_text(),(G/rel).read_text()))
put('S011-composition.patch',patch(sorted(combined)));
put('negative-tests-only.patch',patch([(N,'',(D/'repo'/N).read_text())]));put('main-session-after-red.patch',patch([x for x in incremental if x[0]!=N]))
service=(D/'repo'/S).read_text();mutants={}
operations={
 'side-effect':('  public JsonNode sideEffectConfirmation(\n      Authentication controller,\n      String id,','  /**\n   * Revocation may'),
 'clarify':('  public JsonNode clarify(', '  /**\n   * Trusted planning handoff'),
 'admit':('  private JsonNode admitChecked(', '  /**\n   * Trusted planner/validator'),
 'bootstrap':('  public JsonNode bootstrap(', '  /** A refresh intent')}
for name,(first,last) in operations.items():
 start=service.index(first);end=service.index(last,start);s=service[start:end]
 assert s.count('          requireTranslation(id);')==1
 m=service[:start]+s.replace('          requireTranslation(id);\n','',1)+service[end:]
 mid='delete-'+name;put('mutants/'+mid+'.java.txt',m);put('mutants/'+mid+'.patch',patch([(S,service,m)]))
 mutants[mid]={'serviceSha256':sha(m.encode()),'expected':'SURVIVAL_CONFLICT_PENDING_ARCHITECT_QA_RULING' if name=='side-effect' else 'ASSERTION_RED_WITH_FULL_FRESH_DISCOVERY','operation':name}
first='          requireTranslation(id);\n';start=service.index('  private JsonNode admitChecked(');end=service.index('  /**\n   * Trusted planner/validator',start);s=service[start:end];s=s.replace(first,'',1);anchor='          String policyHash = access.authorizeAction(session.document(), proposal, proof);';assert s.count(anchor)==1;s=s.replace(anchor,anchor+'\n          requireTranslation(id);');m=service[:start]+s+service[end:];put('mutants/admit-after-authorize.java.txt',m);put('mutants/admit-after-authorize.patch',patch([(S,service,m)]));mutants['admit-after-authorize']={'serviceSha256':sha(m.encode()),'expected':'ASSERTION_RED_ON_AUTHORIZE_ACTION_NEVER','operation':'admit'}
proof=[]
for rel in ['backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgeIntegrationTest.java','backend/src/test/java/com/citi/put/checks/studio/guided/bridge/GuidedBridgePlannedIT.java','backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningIntegrationTest.java','backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java']:
 expected='b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475' if rel.endswith('GuidedPublicationReplayIT.java') else sha((R/rel).read_bytes())
 proof.append({'path':rel,'S011Sha256':expected,'currentSha256':sha((R/rel).read_bytes()),'mustEqualOriginalBeforeFreeze':True})
prereq=[]
for rel in ['backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java','backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedLifecycleReasonIT.java']:
 prereq.append({'path':rel,'sha256':sha((G/rel).read_bytes()),'origin':str((G/rel).relative_to(R))})
manifest={'status':'UNEXECUTED_OFF_TREE_PREPARATION_WITH_R_F1_RED_MUTANT_CONFLICT','actualApplication':False,'compileExecuted':False,'runtimeExecuted':False,'files':files,'mutants':mutants,'proofFiles':proof,'unchangedGsTBatons':prereq,'newCaseNames':names((D/'repo'/N).read_text()),'sessionBeforeNames':names((G/T).read_text()),'sessionAfterNames':names((D/'repo'/T).read_text()),'rootBarriers':['Diagnostic terminal and original Replay exact bytes/mode/restored compile','Root+QA fresh full-check and coverage disposition; tree open','Full five-class GS-T gate with every backend/src/main byte S011','Corrected GSMa applied/verified; exact GS-T test batons accepted','Aria/Quinn resolve existing-wrapper control and redundant-guard mutant; no fake red','Root announces F1 proof freeze; no capture-root or chart writer until end'],'budgetCeilingUSD':500,'actualSpend':'UNAVAILABLE'}
assert manifest['sessionBeforeNames']==manifest['sessionAfterNames'] and len(manifest['newCaseNames'])==5
put('manifest.json',json.dumps(manifest,indent=2)+'\n')
put('source-preservation.json',json.dumps({'mainBaseOrigin':str((A/S).relative_to(R)),'partBChangedPaths':[x[0] for x in incremental], 'partBForwardOnlyPaths':[x['path'] for x in files if x['forwardedUnchanged']], 'instanceofProductionAccessSitesBase':[(i+1,l.strip()) for i,l in enumerate((A/S).read_text().splitlines()) if 'GuidedProductionSessionAccess' in l], 'helperCalls':service.count('requireTranslation(id);'),'helperDeclaration':service.count('private void requireTranslation(String id)'),'remainingTranslationNonNull':service.count('translation != null'),'conditionalTranslationAbsentArms':service.count('if (translation != null'),'remainingRecordEvidence':service.count('recordEvidence'),'noCaseDrops':True,'retiredSubassertion':'Only raw URL refusal of removed recordEvidence; all other evidence case assertions retained against surviving repository/projector behavior','proofFiles':proof},indent=2)+'\n')
print(json.dumps({'files':len(files),'changedPartB':len(incremental),'testCasesAdded':len(manifest['newCaseNames']),'sessionCasesPreserved':len(manifest['sessionBeforeNames']),'helperCalls':7,'runtime':'UNEXECUTED'}))

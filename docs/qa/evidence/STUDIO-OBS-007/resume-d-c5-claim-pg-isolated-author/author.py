from pathlib import Path
import hashlib,json,difflib,re
base=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c5-claim-pg-isolated-author')
rel=Path('backend/src/test/java/com/citi/put/checks/studio/guided/session/GuidedServiceTransportFaultIT.java')
before=rel.read_text(); sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
assert sha(before)=='2ca0b48147ed15892acc9c84697b47abde893f743ab380dc716a9e5267d750cc'
add=(base/'additions.txt').read_text().replace('new java.util.ArrayList<Object>()','new java.util.ArrayList<ClaimResource>()')
add=add.replace('currentHolders.add(org.springframework.transaction.support.TransactionSynchronizationManager\n            .getResource(actualJdbc.getDataSource()));','currentHolders.add(currentClaimResource());')
add=add.replace('authorizationHolders.add(\n                  org.springframework.transaction.support.TransactionSynchronizationManager\n                      .getResource(actualJdbc.getDataSource()));','authorizationHolders.add(currentClaimResource());')
a=add.index('  private static void assertClaimResourceIdentity('); b=add.index('  private void closeClaimFixture(',a)
add=add[:a]+'''  private record ClaimResource(Object holder, java.sql.Connection connection, boolean active) {}

  private static ClaimResource currentClaimResource() {
    Object holder = org.springframework.transaction.support.TransactionSynchronizationManager
        .getResource(actualJdbc.getDataSource());
    java.sql.Connection connection = holder instanceof org.springframework.jdbc.datasource.ConnectionHolder h
        ? h.getConnection() : null;
    return new ClaimResource(holder, connection,
        org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
  }

  private static void assertClaimResourceIdentity(List<ClaimResource> authorization,
      List<ClaimResource> current) {
    assertThat(authorization.isEmpty()).isFalse();
    assertThat(current.size()).isEqualTo(1);
    var expected = current.getFirst();
    assertThat(expected.active()).isTrue();
    assertThat(expected.holder() != null && expected.connection() != null).isTrue();
    for (ClaimResource observed : authorization) {
      assertThat(observed.active()).isTrue();
      assertThat(observed.holder()).isSameAs(expected.holder());
      assertThat(observed.connection()).isSameAs(expected.connection());
    }
  }

'''+add[b:]
changes=[]
def replace(old,new):
 global before,candidate
 assert candidate.count(old)==1,old[:100]
 candidate=candidate.replace(old,new); changes.append({'before':old,'after':new})
candidate=before
anchor='  /** Owns the two actual operations, not the unexposed outer common-pool Future. */\n'
replace(anchor,add+anchor)
old='''  private GuidedControllerCutFixture prepareGuidedControllerCut(
      SourceStopOwner owner, Scenario[] created, GuidedSessionService[] controllerService)
      throws Exception {
'''
new=old+'''    return prepareGuidedControllerCut(owner, created, controllerService, access);
  }

  private GuidedControllerCutFixture prepareGuidedControllerCut(
      SourceStopOwner owner, Scenario[] created, GuidedSessionService[] controllerService,
      FixtureAccess fixtureAccess) throws Exception {
'''
replace(old,new)
start=candidate.index('  private GuidedControllerCutFixture prepareGuidedControllerCut(')
end=candidate.index('  /** Does not access any enclosing fixture static',start)
old=candidate[start:end]; new=old.replace('var sessions = service(repository, materialization, access, 600);','var sessions = service(repository, materialization, fixtureAccess, 600);')
assert old!=new
replace(old,new)
replace('''    private final JdbcTemplate jdbc;

    FixtureAccess(JdbcTemplate jdbc) {
      this.jdbc = jdbc;
    }
''','''    private final JdbcTemplate jdbc;
    private final java.util.function.Consumer<JsonNode> currentObserver;

    FixtureAccess(JdbcTemplate jdbc) {
      this(jdbc, null);
    }

    FixtureAccess(JdbcTemplate jdbc, java.util.function.Consumer<JsonNode> currentObserver) {
      this.jdbc = jdbc;
      this.currentObserver = currentObserver;
    }
''')
old='''          "FORBIDDEN_SCOPE",
          403);
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {'''
new='''          "FORBIDDEN_SCOPE",
          403);
      if (currentObserver != null) {
        currentObserver.accept(session);
      }
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {'''
replace(old,new)
for folder,value in [('before',before),('candidate',candidate)]:
 p=base/folder/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(value)
inverse=candidate
for c in reversed(changes):
 assert inverse.count(c['after'])==1
 inverse=inverse.replace(c['after'],c['before'])
assert inverse==before
# Exact original annotated test-body regions through next declaration, all unchanged.
regions=[]
pattern=r'  @(?:Test|ParameterizedTest)\b'
for m in re.finditer(pattern,before):
 start=m.start(); body=before.index('{',start); depth=0; quote=None;esc=False;i=body
 # Original test regions can contain brace strings, so use exact next unindented method boundary.
 nxt=re.search(r'\n  (?:@Test|@ParameterizedTest|private |public |static |@FunctionalInterface)',before[body+1:])
 end=body+1+nxt.start() if nxt else len(before)
 region=before[start:end]
 assert region in candidate,region[:100]
 regions.append({'sha256':sha(region),'byteExact':True})
patch=''.join(difflib.unified_diff(before.splitlines(True),candidate.splitlines(True),fromfile='before/'+str(rel),tofile='candidate/'+str(rel)))
(base/'candidate.patch').write_text(patch)
(base/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
report={'state':'FROZEN_ISOLATED_SOURCE_CANDIDATE_RUNTIME_UNRUN','source':str(rel),'baseSha256':sha(before),'candidateSha256':sha(candidate),'patchSha256':sha(patch),'entireInverseBytesEqual':True,'originalAnnotatedBodyRegions':regions,'addedTests':['composedClaimRevocationCommitsBeforeRefusalAndOriginalStop','permittedComposedClaimSharesTransactionAndPreservesIdempotencyAndRollback'],'seams':['FixtureAccess optional default-null currentObserver only after original SQL guard','Original prepareGuidedControllerCut delegates to same helper body with selected access; inverse extraction exact'],'provenance':['Genuine original source/manifest/assignment/materialization/preparation/admission/consume; real service recordSecretDecision controlled RESOLVED metadata','Original real sweep, audit recorder and exact datasource transaction manager','True sender-entry independent committed reads before original owner.send and transport/ACK/confirmation, observer failure retained without skipping original sender','False callback snapshots actual same datasource ConnectionHolder and Connection identities while active; compares after real claim','Duplicate/conflict state exact, controlled caller rollback sees actual lease/command inside and no new persistence after rollback','Independent original cancel/stop owner drain and live=false cleanup; primary preserved and cleanup failures suppressed'],'defaultPreservation':['Existing access observer null; original checks unchanged','All original annotated test body regions byte exact','No resolver-harness/live production/test/SDK changes'],'limits':['Service+real PostgreSQL/controlled authenticated relay defining component tier only','Controlled RESOLVED metadata is not a physical Vault read, native browser effect or Core HTTP proof','Main806c composition remains separately isolated, required before running new tests','No one-second throughput benefit claim, runtime/compiler/formatter unrun'],'authority':['.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c5-claim-pg-isolated-author-intent.txt','.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c5-claim-pg-isolated-author-context.txt','docs/qa/evidence/STUDIO-OBS-007/root-c5-pg-plan-review.json'],'actions':{'liveWrites':0,'runtime':0,'builds':0,'newFrameworks':0,'newMandatoryE2E':0}}
(base/'result.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'base':sha(before),'candidate':sha(candidate),'report':sha((base/'result.json').read_text()),'originalAnnotatedRegions':len(regions),'addedTests':2}))

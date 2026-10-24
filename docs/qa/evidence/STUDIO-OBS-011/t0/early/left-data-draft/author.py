from pathlib import Path
import re, json, hashlib, difflib
ROOT=Path.cwd(); OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/early/left-data-draft'
BASE='backend/src/test/java/com/citi/put/checks/studio/'
paths=[BASE+'support/GuidedPublicationEvidenceFixture.java',BASE+'guided/publication/GuidedPublicationMigrationTest.java',BASE+'InferenceMigrationIT.java',BASE+'InferenceMigrationLatestIT.java',BASE+'guided/GuidedReplayingPrefixMigrationIT.java']
original={p:(ROOT/p).read_text() for p in paths}; revised=dict(original)
# Mask Java strings/comments, retaining offsets. Structural transforms never parse quoted braces.
def mask(s):
 pat=r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/'
 return re.sub(pat,lambda m: ''.join('\n' if c=='\n' else ' ' for c in m[0]),s)
def close(s,pos):
 m=mask(s); depth=0
 for i in range(pos,len(s)):
  if m[i]=='{':depth+=1
  elif m[i]=='}':
   depth-=1
   if depth==0:return i+1
 raise ValueError('unclosed')
def remove_method(s,name, prefix=None):
 # Declaration line plus contiguous Javadoc, where present.
 pat=r'^  (?:public |private |static |final )+[^\n=;]+\b'+name+r'\s*\('
 matches=list(re.finditer(pat,s,re.M))
 if prefix:matches=[m for m in matches if prefix in s[m.start():s.index('{',m.end())]]
 assert len(matches)==1,(name,len(matches))
 m=matches[0];start=m.start();end=close(s,s.index('{',m.end()))
 before=s[:start]
 if before.rstrip().endswith('*/'):
  start=before.rfind('  /**')
 return s[:start]+s[end:].lstrip('\n')
def choose_if(s,condition,keep):
 token='if ('+condition+') {'
 while token in s:
  start=s.index(token); brace=start+len(token)-1; end=close(s,brace)
  after=end
  while after<len(s) and s[after].isspace():after+=1
  has_else=s.startswith('else {',after)
  then=s[brace+1:end-1]
  if has_else:
   eb=after+5;ee=close(s,eb);other=s[eb+1:ee-1];finish=ee
  else:other='';finish=end
  chosen=then if keep else other
  # Dedent just one block level, keeping original indentation of outer context.
  if chosen:
   chosen=chosen.strip('\n');chosen='\n'.join(line[2:] if line.startswith('  ') else line for line in chosen.splitlines())
   first_indent=len(s[s.rfind('\n',0,start)+1:start]);chosen=chosen[first_indent:] if chosen.startswith(' '*first_indent) else chosen
  s=s[:start]+chosen+s[finish:]
 return s
# fixture collapse: retain existing head method bodies directly, preserving public APIs.
p=paths[0];s=original[p]
s=remove_method(s,'freezeHistoricalV18Source');s=remove_method(s,'freezeSource',prefix='return freezeSource') if False else s
# remove the wrapper, then expose its previous head implementation.
s=s.replace('    return freezeSource(jdbc, tx, supplied, false);\n  }\n\n  private static ObjectNode freezeSource(\n      JdbcTemplate jdbc, TransactionTemplate tx, JsonNode supplied, boolean historical) {\n','')
assert 'return freezeSource(jdbc, tx, supplied, false)' not in s
s=choose_if(s,'!historical',True)
s=remove_method(s,'completeHistoricalV18Session')
s=s.replace('    return completeExistingSession(jdbc, tx, id, base, false);\n  }\n\n  private static ObjectNode completeExistingSession(\n      JdbcTemplate jdbc,\n      TransactionTemplate tx,\n      String id,\n      PublicationContracts.Base base,\n      boolean historical) {\n','')
# conditional with multiline parentheses uses a known exact body boundary.
a=s.index('          if (historical\n');b=close(s,s.index('{',a));s=s[:a]+s[b:].lstrip('\n')
a=s.index('          // This test-only structural context on V18');b=s.index('          context.set("applicationPolicy", applicationPolicy);',a)
s=s[:a]+'''          JsonNode applicationPolicy =
              C.parse(
                      jdbc.queryForObject(
                          "SELECT v.document::text FROM studio_guided_session_policies s JOIN "
                              + "studio_guided_policy_versions v ON v.policy_id=s.policy_id AND "
                              + "v.version=s.policy_version WHERE s.session_id=?",
                          String.class,
                          id))
                  .path("applicationPolicy");
'''+s[b:]
s=choose_if(s,'historical',False)
s=s.replace('            String attemptColumn = historical ? "" : ",attempt_ordinal",\n                attemptValue = historical ? "" : ",0";\n','')
s=s.replace('                    + "meaning,proposal,proposal_digest,admission_key,admission_id"\n                    + attemptColumn\n                    + ") VALUES (?,?,1,?::jsonb,?::jsonb,?,?,?"\n                    + attemptValue\n                    + ")",','                    + "meaning,proposal,proposal_digest,admission_key,admission_id,attempt_ordinal"\n                    + ") VALUES (?,?,1,?::jsonb,?::jsonb,?,?,?,0)",')
s=s.replace('historical ? readHistoricalV18(jdbc, id, manifest) : evidence.read(id)','evidence.read(id)')
s=remove_method(s,'requireV18');s=remove_method(s,'readHistoricalV18');revised[p]=s
# migration helper retirement.
p=paths[1];s=original[p]
s=s.replace('core V1–V11, observed V12–V21). Historical\n     * V11/V18 upgrade assertions below retain their explicit targets.','core V1–V11, observed V12–V22).\n     * Explicit core V11 upgrade assertions below retain their target.')
s=s.replace('GuidedSecretLoginMigrationTest#publishedRetry()} does. The explicitly named historical V18\n   * helper retains reserve/claim/finish and uses its reviewed test-only historical SQL commit; it\n   * does not claim current Java commit compatibility with V18. The validator verdict is synthetic','GuidedSecretLoginMigrationTest#publishedRetry()} does. The validator verdict is synthetic')
s=s.replace('''      assertThatThrownBy(() -> commitHistoricalV18(db.jdbc, db.tx, command, HistoricalFault.NONE))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("actual V18");
''','')
for name in ['publishHistoricalV18Observed','prepareHistoricalV18Observed','changedHistoricalCommand','historicalRows','probeHistoricalAdapter','commitHistoricalV18','verifyHistoricalCandidate','verifyHistoricalVerdict']:
 s=remove_method(s,name)
a=s.index('  private enum HistoricalFault {');b=close(s,s.index('{',a));s=s[:a]+s[b:].lstrip('\n')
s=s.replace('''    return prepareObserved(source, sessionId, existingTestId, csiId, environment, principal, false);
  }

  private static Prepared prepareObserved(
      javax.sql.DataSource source,
      String sessionId,
      UUID existingTestId,
      String csiId,
      String environment,
      String principal,
      boolean historicalV18) {
''','')
s=s.replace('          principal,\n          historicalV18);','          principal);').replace('        principal,\n        historicalV18);','        principal);')
s=s.replace('      String principal,\n      boolean historicalV18) {','      String principal) {')
s=choose_if(s,'historicalV18',False)
s=s.replace('''                  historicalV18
                      ? com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture
                          .completeHistoricalV18Session(jdbc, tx, sessionId, base)
                      : com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture
                          .completeExistingSession(jdbc, tx, sessionId, base);''','''                  com.citi.put.checks.studio.support.GuidedPublicationEvidenceFixture
                      .completeExistingSession(jdbc, tx, sessionId, base);''')
s=s.replace('    return publishObserved(source, prepared, false);','    return publishObserved(source, prepared, command -> {});')
s=s.replace('      javax.sql.DataSource source, Prepared prepared, boolean historicalV18) {','''      javax.sql.DataSource source,
      Prepared prepared,
      java.util.function.Consumer<PublicationContracts.Commit> beforeCommit) {''')
# First matching complete test finish is within validatedRelationalCycle.
a=s.index('  void validatedRelationalCycleCommitsOnceAndKeepsHistoricalReceiptAfterExpiry()');b=s.index('      db.tx.executeWithoutResult(\n          t -> {\n            db.sessions.lock("session");\n            db.publications.finish(',a)
s=s[:b]+'''      ObjectNode badVerdict = verdict.deepCopy().put("basisHash", "0".repeat(64));
      assertThatThrownBy(
              () ->
                  db.tx.executeWithoutResult(
                      t -> {
                        t.setRollbackOnly();
                        db.sessions.lock("session");
                        db.publications.finish(
                            "session",
                            attempt.attemptId(),
                            attempt.claimId(),
                            snapshot.hash(),
                            PublicationContracts.AttemptStatus.VALIDATED,
                            badVerdict,
                            null,
                            Instant.now());
                      }))
          .hasMessageContaining("EVIDENCE_MISMATCH");
      assertThat(
              db.jdbc.queryForObject(
                  "SELECT status FROM studio_guided_publication_attempts WHERE session_id=? AND attempt_id=?",
                  String.class,
                  "session",
                  attempt.attemptId()))
          .isEqualTo("VALIDATING");
'''+s[b:]
# Put callback after genuine finalization/claim; public no-op keeps old behavior.
a=s.index('  private static Published publishObserved(');b=s.index('    tx.executeWithoutResult(\n        status -> {\n          sessions.lock(sessionId);\n',s.index('    var command =',a))
s=s[:b]+'    beforeCommit.accept(command);\n'+s[b:]
# Helpers/test added before session metadata helper. Full durability equality, including trigger rollback.
newtest=r'''  /** Ports the retired adapter's Java-held negatives through the real head writer. */
  @Test
  void headCommitRejectsPolicyBasisAuthorityAndDeletedDraftWithoutAnyWrite() {
    try (var db = new Database()) {
      javax.sql.DataSource source = db.jdbc.getDataSource();
      var prior = publishObserved(source, "left-prior", "CSI", "Development", "owner@example.test");
      var next =
          prepareObserved(
              source, "left-next", prior.testId(), "CSI", "Development", "owner@example.test");
      var published =
          publishObserved(
              source,
              next,
              command -> {
                assertThat(command.snapshot().identity().path("base").path("confirmedRevisionId").asText())
                    .as("pointer-clear probe starts from a genuine nonnull published revision")
                    .isEqualTo(prior.revisionId().toString());
                String before = commandRows(db.jdbc, command);
                ObjectNode wrongPolicy =
                    PublicationContracts.copy(command.candidate().policy()).put("unexpectedMutation", true);
                var badPolicy =
                    new PublicationContracts.Candidate(
                        command.candidate().learnedPlan(),
                        command.candidate().artifact(),
                        wrongPolicy,
                        command.candidate().hashes());
                ObjectNode wrongBasis =
                    PublicationContracts.copy(command.snapshot().basis()).put("translationRevision", "999");
                for (var bad :
                    List.of(
                        changedCommand(command, command.snapshot(), badPolicy),
                        changedCommand(
                            command,
                            new PublicationContracts.Snapshot(command.snapshot().identity(), wrongBasis),
                            command.candidate()))) {
                  assertThatThrownBy(
                          () ->
                              db.tx.executeWithoutResult(
                                  t -> {
                                    t.setRollbackOnly();
                                    db.publications.commit(bad, Instant.now());
                                  }))
                      .hasMessageContaining("EVIDENCE_MISMATCH");
                  assertThat(commandRows(db.jdbc, command)).isEqualTo(before);
                }
                for (String mutation :
                    List.of(
                        "UPDATE ui_tests SET confirmed_revision_id=NULL WHERE id=?",
                        "UPDATE studio_guided_sessions SET state='OBSERVING',"
                            + "document=jsonb_set(document,'{state}','\"OBSERVING\"') WHERE session_id=?",
                        "UPDATE studio_guided_sessions SET document=jsonb_set(document,"
                            + "'{owner,workerId}','\"wrong-worker\"') WHERE session_id=?",
                        "UPDATE studio_guided_sessions SET expires_at='2000-01-01',"
                            + "document=jsonb_set(document,'{expiresAt}','\"2000-01-01T00:00:00Z\"') WHERE session_id=?")) {
                  assertThatThrownBy(
                          () ->
                              db.tx.executeWithoutResult(
                                  t -> {
                                    t.setRollbackOnly();
                                    db.jdbc.update(
                                        mutation,
                                        mutation.startsWith("UPDATE ui_tests") ? prior.testId() : command.sessionId());
                                    db.publications.commit(command, Instant.now());
                                  }))
                      .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class);
                  assertThat(commandRows(db.jdbc, command)).as(mutation).isEqualTo(before);
                }
                // A transaction-local receipt trigger deletes only after early authority checks.
                // This pins deleted_at IS NULL in the final CAS, not an earlier reader refusal.
                assertThatThrownBy(
                        () ->
                            db.tx.executeWithoutResult(
                                t -> {
                                  t.setRollbackOnly();
                                  db.jdbc.execute(
                                      "CREATE FUNCTION left_delete_before_cas() RETURNS trigger LANGUAGE plpgsql AS $$ "
                                          + "BEGIN UPDATE ui_tests SET deleted_at=clock_timestamp() WHERE id=NEW.test_id; "
                                          + "RETURN NEW; END $$");
                                  db.jdbc.execute(
                                      "CREATE TRIGGER left_delete_before_cas AFTER INSERT ON studio_guided_publications "
                                          + "FOR EACH ROW EXECUTE FUNCTION left_delete_before_cas()");
                                  db.publications.commit(command, Instant.now());
                                }))
                    .hasMessageContaining("PUBLICATION_CONFLICT");
                assertThat(commandRows(db.jdbc, command)).isEqualTo(before);
                assertThat(
                        db.jdbc.queryForObject(
                            "SELECT to_regprocedure('left_delete_before_cas()') IS NULL", Boolean.class))
                    .as("the fault trigger and function are rolled back with the failed write")
                    .isTrue();
              });
      assertThat(published.testId()).isEqualTo(prior.testId());
      assertThat(published.revisionId()).isNotEqualTo(prior.revisionId());
    }
  }

  private static PublicationContracts.Commit changedCommand(
      PublicationContracts.Commit c,
      PublicationContracts.Snapshot snapshot,
      PublicationContracts.Candidate candidate) {
    return new PublicationContracts.Commit(
        c.sessionId(), c.revisionId(), c.attemptId(), c.claimId(), c.finalizeKey(),
        c.finalizeDigest(), snapshot, candidate, c.grant());
  }

  private static String commandRows(JdbcTemplate jdbc, PublicationContracts.Commit c) {
    return jdbc.queryForObject(
        "SELECT jsonb_build_object('draft',(SELECT to_jsonb(t) FROM ui_tests t WHERE id=?),"
            + "'session',(SELECT to_jsonb(s) FROM studio_guided_sessions s WHERE session_id=?),"
            + "'revision',(SELECT to_jsonb(r) FROM ui_test_revisions r WHERE id=?),"
            + "'receipt',(SELECT to_jsonb(p) FROM studio_guided_publications p WHERE session_id=?),"
            + "'attempt',(SELECT to_jsonb(a) FROM studio_guided_publication_attempts a WHERE session_id=? AND attempt_id=?))::text",
        String.class,
        UUID.fromString(c.snapshot().identity().path("base").path("testId").asText()),
        c.sessionId(), c.revisionId(), c.sessionId(), c.sessionId(), c.attemptId());
  }

'''
s=s.replace('  private static void completeSessionMetadata(ObjectNode session) {',newtest+'  private static void completeSessionMetadata(ObjectNode session) {')
# No obsolete imports if their only callsites were adapter-only.
if not re.search(r'\brequire\(',s):s=s.replace('import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;\n','')
s=s.replace('import java.sql.Timestamp;\n','')
revised[p]=s
# Port P1 method and raw rollback-only row helper, retaining all branches.
p=paths[3];s=original[p];old=original[paths[2]]
def get_method(s,name):
 m=re.search(r'^  (?:(?:public |private |static |final )+[^\n=;]+|void )\b'+name+r'\s*\(',s,re.M);return s[m.start():close(s,s.index('{',m.end()))]
p1=get_method(old,'reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot').replace('prepareHistoricalV18Observed','prepareObserved').replace('"inference-','"latest-')
# Existing current class does not have dataSource(), add exact local helper.
s=s.replace('  @Test\n  void historicalExecutionCannotBeRelabelledAsFullEvidence()', '  @Test\n'+p1+'\n\n  @Test\n  void historicalExecutionCannotBeRelabelledAsFullEvidence()')
a=s.index('  void historicalExecutionCannotBeRelabelledAsFullEvidence()');b=s.index('    try (Connection c = transaction()) {',a)+len('    try (Connection c = transaction()) {')
indexprobe='''
      assertThat(
              scalar(
                  c,
                  "SELECT count(*) FROM pg_indexes WHERE schemaname='public'"
                      + " AND indexname='idx_ui_test_exec_full_baseline'"
                      + " AND indexdef LIKE '%execution_scope)::text = ''FULL''%'"))
          .isEqualTo("1");'''
s=s[:b]+indexprobe+s[b:]
helper=get_method(old,'revisionWithStepMetadata')
s=s.replace('  private static String tamperValue(',helper+'\n\n  private static DriverManagerDataSource dataSource() {\n    return new DriverManagerDataSource(\n        POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());\n  }\n\n  private static String tamperValue(')
# dataSource may already exist under distinct syntax, reject duplicate below.
assert len(re.findall(r'\bdataSource\(\) \{',s))==1
revised[p]=s
# P3 authorized one case only.
p=paths[4];s=original[p];anchor='      exec(f.c, publicationSql(f, good, artifact));';a=s.index('  void publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys()');b=s.index(anchor,a)
s=s[:b]+'''      ObjectNode wrongHash = good.deepCopy();
      wrongHash.put("artifactHash", "0".repeat(64));
      reject(f.c, publicationSql(f, wrongHash, artifact), "publication receipt shape invalid");
'''+s[b:];revised[p]=s
revised[paths[2]]=None
pattern=r'HistoricalV18|requireV18|historicalV18|HistoricalFault|probeHistoricalAdapter|changedHistoricalCommand|historicalRows|verifyHistorical|readHistoricalV18|historical-v18'
before_hits=[];after_hits=[]
for file in sorted((ROOT/'backend/src').rglob('*')):
 if not file.is_file():continue
 try:text=file.read_text()
 except UnicodeError:continue
 rel=str(file.relative_to(ROOT));replacement=revised.get(rel,text)
 for label,content,hits in [('before',text,before_hits),('after',replacement,after_hits)]:
  if content is None:continue
  for n,line in enumerate(content.splitlines(),1):
   if re.search(pattern,line):hits.append({'path':rel,'line':n,'text':line})
assert len(before_hits)==78,len(before_hits)
assert len(after_hits)==4 and all(x['path'].endswith('/LegacyV20ConfirmedBaseFixture.java') for x in after_hits),after_hits
revised={p:None if s is None else re.sub(r'(?m)^[ \t]+$', '', s) for p,s in revised.items()}
patch='';manifest=[]
for p in paths:
 before=original[p];after=revised[p]
 if after is not None:
  target=OUT/'repo'/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(after)
 patch+=''.join(difflib.unified_diff(before.splitlines(True), [] if after is None else after.splitlines(True),fromfile='a/'+p,tofile='/dev/null' if after is None else 'b/'+p))
 manifest.append({'path':p,'operation':'delete' if after is None else 'edit','beforeSha256':hashlib.sha256(before.encode()).hexdigest(),'afterSha256':None if after is None else hashlib.sha256(after.encode()).hexdigest(),'beforeTestMethods':re.findall(r'@Test\s+void\s+(\w+)',before),'afterTestMethods':[] if after is None else re.findall(r'@Test\s+void\s+(\w+)',after)})
(OUT/'left-data-draft.patch').write_text(patch)
(OUT/'manifest.json').write_text(json.dumps({'draftOnly':True,'budgetUsdDeclared':500,'actualSpend':'unavailable','files':manifest},indent=2)+'\n')
(OUT/'historical-grep.json').write_text(json.dumps({'pattern':pattern,'beforeCount':len(before_hits),'afterVirtualOverlayCount':len(after_hits),'beforeHits':before_hits,'afterHits':after_hits},indent=2)+'\n')
print(json.dumps({'paths':len(paths),'beforeHits':len(before_hits),'afterHits':len(after_hits),'patchBytes':len(patch.encode()),'patchSha256':hashlib.sha256(patch.encode()).hexdigest()}))

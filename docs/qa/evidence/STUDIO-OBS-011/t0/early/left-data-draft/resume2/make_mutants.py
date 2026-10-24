from pathlib import Path
import difflib,json,hashlib
root=Path.cwd();out=root/'docs/qa/evidence/STUDIO-OBS-011/t0/early/left-data-draft/resume2';base='backend/src/test/java/com/citi/put/checks/studio/'
latest=base+'InferenceMigrationLatestIT.java';prefix=base+'guided/GuidedReplayingPrefixMigrationIT.java';main='backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationRepository.java'
mutants=[]
def emit(name,path,before,after,method,description):
 assert before!=after
 patch=''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+path,tofile='b/'+path))
 target=out/'mutants'/(name+'.patch');target.parent.mkdir(exist_ok=True);target.write_text(patch)
 mutants.append({'id':name,'path':path,'base':'candidate' if path!=main else 'frozen-production','baseSha256':hashlib.sha256(before.encode()).hexdigest(),'mutantSha256':hashlib.sha256(after.encode()).hexdigest(),'patchSha256':hashlib.sha256(patch.encode()).hexdigest(),'testFilter':method,'description':description,'executed':False})
s=(out/'repo'/latest).read_text();a=s.index('  void reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot()');needle='      UUID prior = UUID.randomUUID();';i=s.index(needle,a)
after=s[:i]+'''      // RED MUTANT ONLY: rollback at transaction close restores the original function.
      s.execute(
          "CREATE OR REPLACE FUNCTION studio_publication_step_metadata_guard() RETURNS trigger "
              + "LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$");
'''+s[i:]
emit('P1-metadata-guard-noop',latest,s,after,'com.citi.put.checks.studio.InferenceMigrationLatestIT.reusedStepCannotBelongToAnotherTestAndNeedsTheSameSnapshot','Wrong snapshot must become accepted, producing an assertion failure; installed V21 guard remains deferred and transaction rolls back.')
a=s.index('  void historicalExecutionCannotBeRelabelledAsFullEvidence()');i=s.index('      assertThat(',a)
after=s[:i]+'''      // RED MUTANT ONLY: dropping the partial index is rollback-scoped.
      try (Statement mutant = c.createStatement()) {
        mutant.execute("DROP INDEX idx_ui_test_exec_full_baseline");
      }
'''+s[i:]
emit('P2-drop-full-baseline-index',latest,s,after,'com.citi.put.checks.studio.InferenceMigrationLatestIT.historicalExecutionCannotBeRelabelledAsFullEvidence','Catalog assertion must read zero instead of one; transaction rollback restores the index.')
s=(out/'repo'/prefix).read_text();a=s.index('  void publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys()');i=s.index('      ObjectNode wrongHash',a)
# This single replaced conjunct is deliberately narrower than bypassing the complete receipt trigger.
injection="""      // RED MUTANT ONLY: preserve all other receipt checks; DDL rolls back with Fixture.
      exec(
          f.c,
          "DO $mut$ BEGIN EXECUTE replace("
              + "pg_get_functiondef('studio_publication_receipt_guard()'::regprocedure),"
              + "'AND NEW.document->''publicReceipt''->''artifactHash''=NEW.document->''artifactHash''',"
              + "'AND true'); END $mut$");
"""
emit('P3-receipt-hash-conjunct',prefix,s,s[:i]+injection+s[i:],'com.citi.put.checks.studio.guided.GuidedReplayingPrefixMigrationIT.publicationReceiptRejectsWrongRelearnedBoundaryOrExtraKeys','Wrong hash must cease failing the shape guard. An independent relational guard may still reject it with a different message; that also makes the shape-specific new assertion red. Inspect actual failure, never count infrastructure errors.')
s=(root/main).read_text();a=s.index('  private void verifyVerdict(');i=s.index('            "basisHash",\n',a)
emit('J1-omit-verdict-basis-check',main,s,s[:i]+s[i:].replace('            "basisHash",\n','',1),'com.citi.put.checks.studio.guided.publication.GuidedPublicationMigrationTest.validatedRelationalCycleCommitsOnceAndKeepsHistoricalReceiptAfterExpiry','Production Java-held verdict basis check omitted. The new bad-verdict assertion must fail or observe a different SQL-layer refusal; exact failure must be audited.')
needle='confirmed_revision_id IS NOT DISTINCT FROM ?::uuid AND deleted_at IS NULL AND';assert s.count(needle)==1
after=s.replace(needle,'confirmed_revision_id IS NOT DISTINCT FROM ?::uuid AND')
emit('J2-omit-deleted-draft-cas',main,s,after,'com.citi.put.checks.studio.guided.publication.GuidedPublicationMigrationTest.headCommitRejectsPolicyBasisAuthorityAndDeletedDraftWithoutAnyWrite','Receipt-insert trigger changes deleted_at after early checks; removing final CAS predicate should allow commit and fail the PUBLICATION_CONFLICT assertion. Rollback-only helper transaction prevents persistent fault DDL.')
(out/'mutants'/'manifest.json').write_text(json.dumps({'isRuntimeEvidence':False,'mutants':mutants},indent=2)+'\n')
print(json.dumps({'mutants':len(mutants),'executed':False}))

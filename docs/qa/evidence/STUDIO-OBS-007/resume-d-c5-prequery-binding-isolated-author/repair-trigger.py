from pathlib import Path
import json,hashlib,difflib,re
out=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c5-prequery-binding-isolated-author');rel=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
draft=(out/'draft-fbb94-unapplied/candidate'/rel).read_text();base=(out/'before'/rel).read_text();s=draft;h=lambda x:hashlib.sha256(x.encode()).hexdigest();assert h(draft)=='fbb94bc12c5e951c5760fde34847580720029214f2ccb5e3bd5a3fa3b90b14b6'
changes=[]
def change(a,b):
 global s
 assert s.count(a)==1,(a[:100],s.count(a));s=s.replace(a,b);changes.append({'before':a,'after':b})
a=s.index('    private Map<Thread, PgClaimBinding> snapshotBindings() {');b=s.index('    void enterCurrent() {',a)
old=s[a:b]
new='''    private boolean activeTriggerBinding(Thread target, PgClaimBinding expected) {
      try {
        synchronized (gate) {
          return target != null
              && expected != null
              && !stopping
              && System.nanoTime() < end
              && !bindingUnconfirmed
              && executing.contains(target)
              && bindings.get(target) == expected;
        }
      } catch (Throwable unavailable) {
        bindingUnconfirmed = true;
        return false;
      }
    }

'''
change(old,new)
change('''        pgStatus = PgStatus.RUNNING;
        pgObserver =
            Thread.ofPlatform().daemon().name("private-c5-pg-once").unstarted(this::snapshotPg);''','''        PgClaimBinding expected = bindings.get(target);
        pgStatus = PgStatus.RUNNING;
        pgObserver =
            Thread.ofPlatform()
                .daemon()
                .name("private-c5-pg-once")
                .unstarted(() -> snapshotPg(target, expected));''')
change('''    private void snapshotPg() {
      // Snapshot identity before original row inspection; never associate a later pooled borrower.
      Map<Thread, PgClaimBinding> beforeBindings =
          new java.util.IdentityHashMap<>(snapshotBindings());
      var stableCandidates = new java.util.HashSet<Integer>();
      pgExactClaimAttribution = false;''','''    private void snapshotPg(Thread target, PgClaimBinding expected) {
      // Only the original slow-trigger identity; no other registered or later binding can qualify.
      boolean activeBefore = activeTriggerBinding(target, expected);
      boolean targetRowMatched = false;
      pgExactClaimAttribution = false;''')
change('''                if (stage < 6 && stableBinding(beforeBindings, pid) != null) {
                  stableCandidates.add(pid);
                }''','''                if (activeBefore
                    && stage < 6
                    && pid == expected.pid()
                    && activeTriggerBinding(target, expected)) {
                  targetRowMatched = true;
                }''')
change('''        pgExactClaimAttribution =
            !bindingUnconfirmed
                && candidates.size() == 1
                && stableCandidates.contains(candidates.iterator().next())
                && stableBinding(beforeBindings, candidates.iterator().next()) != null
                && pgStatus != PgStatus.TRUNCATED
                && pgStatus != PgStatus.NON_QUIESCENT;''','''        pgExactClaimAttribution =
            activeBefore
                && targetRowMatched
                && !bindingUnconfirmed
                && candidates.size() == 1
                && candidates.contains(expected.pid())
                && activeTriggerBinding(target, expected)
                && pgStatus != PgStatus.TRUNCATED
                && pgStatus != PgStatus.NON_QUIESCENT;''')
change('''        beforeBindings.clear();
        stableCandidates.clear();
''','')
change('''          .put("pgSnapshotExactClaimAttribution", claimSampler.pgExactClaimAttribution);''','''          .put(
              "pgSnapshotExactClaimAttribution",
              pgJoined
                  && claimSampler.pgStatus == C5ClaimSampler.PgStatus.OBSERVED
                  && !claimSampler.bindingUnconfirmed
                  && claimSampler.pgExactClaimAttribution);''')
(out/'candidate'/rel).write_text(s)
inverse=s
for c in reversed(changes):
 assert inverse.count(c['after'])==1 if c['after'] else True
 if c['after']:inverse=inverse.replace(c['after'],c['before'])
 else:
  # Deleted two private-map cleanup lines reconstruct at their exact original finally anchor.
  anchor='''      } finally {
        privatePids.clear();'''
  assert inverse.count(anchor)==1;inverse=inverse.replace(anchor,'''      } finally {
'''+c['before']+'''        privatePids.clear();''')
assert inverse==draft
originalChanges=json.loads((out/'draft-fbb94-unapplied/inverse-transformations.json').read_text())
full=inverse
for c in reversed(originalChanges):assert full.count(c['after'])==1;full=full.replace(c['after'],c['before'])
assert full==base
patch=''.join(difflib.unified_diff(base.splitlines(True),s.splitlines(True),fromfile='before/'+str(rel),tofile='candidate/'+str(rel)));(out/'candidate.patch').write_text(patch)
repair=''.join(difflib.unified_diff(draft.splitlines(True),s.splitlines(True),fromfile='draft-fbb94/'+str(rel),tofile='candidate/'+str(rel)));(out/'trigger-repair.patch').write_text(repair)
(out/'trigger-inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
regions=[]
for m in re.finditer(r'  @Test\n',base):
 a=m.start();n=re.search(r'\n  (?:@|private |public |static )',base[a+8:]);b=a+8+n.start() if n else len(base);part=base[a:b];assert part in s;regions.append(h(part))
oldReport=json.loads((out/'draft-fbb94-unapplied/result.json').read_text());r=oldReport.copy()
r.update({'state':'FROZEN_ISOLATED_SOURCE_TARGET_SCOPE_REPAIR_UNBUILT_UNRUN_NOT_APPLIED','baseSha256':h(base),'candidateSha256':h(s),'patchSha256':h(patch),'supersededDraftSha256':h(draft),'triggerRepairPatchSha256':h(repair),'wholeInverseBytesExact':True,'repairInverseReturnsFbb94Exact':True,'oldTestCount':len(regions),'testRegionSha256':regions,'snapshotProof':['SAME original trigger target and its immutable callback binding captured under existing gate before starting SAME one-shot observer','Original once snapshot receives only that target/expected identity; missing binding cannot fallback to another registered or later replacement','activeTriggerBinding requires same target registered and bindings.get(target)==expected before original row inspection, after matching row and after full loop','Only original unique candidate corresponding to expected PID can qualify; matched PG query/rows/bounds still original','Existing exact Boolean exports true only PGobserver joined, pgStatus OBSERVED, no bindingUnconfirmed and historical active identity row proof','Failed/truncated/ambiguous/nonquiescent/ended/replaced/unsupported always false; callback retirement precedes commit/rollback, filter/close backup intact','No private PID/Thread/Connection/raw SQL/params exported; no new numeric keys/SQL/observer/timer/case/poll/borrow'],'authority':oldReport['authority']+['.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c5-trigger-target-binding-repair-intent.txt','.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c5-trigger-target-binding-repair-context.txt','docs/qa/evidence/STUDIO-OBS-007/root-c5-prequery-binding-source-review.json']})
(out/'result.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'candidate':h(s),'report':h((out/'result.json').read_text()),'base':h(base),'tests':len(regions)}))

from pathlib import Path
import json,hashlib,re,difflib
out=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c5-prequery-binding-isolated-author')
rel=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java');before=rel.read_text();h=lambda s:hashlib.sha256(s.encode()).hexdigest()
assert h(before)=='c9b7e6c37ef4fc5ac7fe18fb1ed04788aa3fec4ca92418a50a6ad7cfb6fa56b2'
s=before;changes=[]
def change(old,new):
 global s
 assert s.count(old)==1,(old[:100],s.count(old));s=s.replace(old,new);changes.append({'before':old,'after':new})
change('''              try {
                return super.execute(callback);
              } catch (GuidedSessionException original) {''','''              try {
                C5Capture capture = c5Capture;
                C5ClaimSampler observer = capture == null ? null : capture.claimSampler;
                if (observer == null
                    || org.springframework.transaction.support.TransactionSynchronizationManager
                        .isActualTransactionActive()
                    || !observer.registeredCurrent()) {
                  return super.execute(callback);
                }
                return super.execute(
                    status -> {
                      C5ClaimSampler.PgClaimBinding binding =
                          status.isNewTransaction() ? observer.bindPrequery(manager, jdbc) : null;
                      try {
                        return callback.doInTransaction(status);
                      } finally {
                        // Retire BEFORE original superclass commit/rollback, never just filter exit.
                        observer.retirePrequery(binding);
                      }
                    });
              } catch (GuidedSessionException original) {''')
change('''    private final java.util.Map<Thread, Long> entered = new java.util.IdentityHashMap<>();''','''    private final java.util.Map<Thread, Long> entered = new java.util.IdentityHashMap<>();
    private record PgClaimBinding(int pid) {}
    private final Map<Thread, PgClaimBinding> bindings = new java.util.IdentityHashMap<>();
    private volatile boolean bindingUnconfirmed, pgExactClaimAttribution;''')
anchor='''    void enterCurrent() {'''
helper='''    boolean registeredCurrent() {
      try {
        synchronized (gate) {
          return !stopping && System.nanoTime() < end && executing.contains(Thread.currentThread());
        }
      } catch (Throwable unavailable) {
        return false;
      }
    }

    PgClaimBinding bindPrequery(
        org.springframework.transaction.PlatformTransactionManager manager, JdbcTemplate jdbc) {
      try {
        if (!registeredCurrent()
            || !(manager instanceof org.springframework.orm.jpa.JpaTransactionManager jpa)
            || jpa.getDataSource() != jdbc.getDataSource()
            || jpa.getEntityManagerFactory() == null) {
          return null;
        }
        Object resource =
            org.springframework.transaction.support.TransactionSynchronizationManager.getResource(
                jpa.getEntityManagerFactory());
        if (!(resource instanceof org.springframework.orm.jpa.EntityManagerHolder holder)
            || !(holder.getEntityManager()
                instanceof org.hibernate.engine.spi.SessionImplementor session)) {
          return null;
        }
        var logical = session.getJdbcCoordinator().getLogicalConnection();
        if (!(logical
                instanceof org.hibernate.resource.jdbc.internal.LogicalConnectionManagedImpl managed)
            || !managed.isOpen()
            || !managed.isPhysicallyConnected()
            || managed.getConnectionHandlingMode().getReleaseMode()
                == org.hibernate.ConnectionReleaseMode.AFTER_STATEMENT) {
          return null;
        }
        // Never obtain/borrow a connection when the native logical connection is not connected.
        var existing = managed.getPhysicalConnection();
        if (existing == null || existing.isClosed()) {
          return null;
        }
        var pg = existing.unwrap(org.postgresql.PGConnection.class);
        int pid = pg.getBackendPID(); // Already-connected handshake metadata; no statement/SQL.
        if (pid <= 0) {
          return null;
        }
        synchronized (gate) {
          Thread current = Thread.currentThread();
          if (stopping
              || System.nanoTime() >= end
              || !executing.contains(current)
              || bindings.containsKey(current)
              || bindings.size() >= MAX_THREADS) {
            return null;
          }
          var binding = new PgClaimBinding(pid);
          bindings.put(current, binding);
          return binding;
        }
      } catch (Throwable unavailable) {
        return null; // Diagnostic availability cannot replace original callback/status/error.
      }
    }

    void retirePrequery(PgClaimBinding binding) {
      if (binding == null) {
        return;
      }
      try {
        synchronized (gate) {
          Thread current = Thread.currentThread();
          if (bindings.get(current) == binding) {
            bindings.remove(current);
          }
        }
      } catch (Throwable unavailable) {
        bindingUnconfirmed = true;
        pgExactClaimAttribution = false;
      }
    }

    private Map<Thread, PgClaimBinding> snapshotBindings() {
      try {
        synchronized (gate) {
          if (stopping || System.nanoTime() >= end || bindingUnconfirmed) {
            return Map.of();
          }
          return new java.util.IdentityHashMap<>(bindings);
        }
      } catch (Throwable unavailable) {
        bindingUnconfirmed = true;
        return Map.of();
      }
    }

    private PgClaimBinding stableBinding(Map<Thread, PgClaimBinding> before, int pid) {
      try {
        synchronized (gate) {
          if (stopping || System.nanoTime() >= end || bindingUnconfirmed) {
            return null;
          }
          PgClaimBinding matched = null;
          for (var entry : before.entrySet()) {
            if (entry.getValue().pid() == pid
                && bindings.get(entry.getKey()) == entry.getValue()
                && executing.contains(entry.getKey())) {
              if (matched != null) {
                return null; // Multiple registered owners of this PID never qualify as exact.
              }
              matched = entry.getValue();
            }
          }
          return matched;
        }
      } catch (Throwable unavailable) {
        bindingUnconfirmed = true;
        return null;
      }
    }

'''
change(anchor,helper+anchor)
# Callback exit is primary; original filter and sampler closure are backup retirement only.
change('''          executing.remove(current);
          entered.remove(current);''','''          executing.remove(current);
          entered.remove(current);
          bindings.remove(current);''')
change('''    private void snapshotPg() {
      var privatePids''','''    private void snapshotPg() {
      // Snapshot identity before original row inspection; never associate a later pooled borrower.
      Map<Thread, PgClaimBinding> beforeBindings = snapshotBindings();
      var stableCandidates = new java.util.HashSet<Integer>();
      pgExactClaimAttribution = false;
      var privatePids''')
old='''                if (!rows.wasNull() && blockers.add(blocker)) {
                  pgBlockerStages[pgStage(blockerQuery)]++;
                }
'''
new=old+'''                if (stage < 6 && stableBinding(beforeBindings, pid) != null) {
                  stableCandidates.add(pid);
                }
'''
change(old,new)
# Unique source-category candidate plus same private immutable active callback identity.
change('''        pgCandidates = candidates.size();
        pgBlockers = blockers.size();''','''        pgCandidates = candidates.size();
        pgBlockers = blockers.size();
        pgExactClaimAttribution =
            !bindingUnconfirmed
                && candidates.size() == 1
                && stableCandidates.contains(candidates.iterator().next())
                && stableBinding(beforeBindings, candidates.iterator().next()) != null
                && pgStatus != PgStatus.TRUNCATED
                && pgStatus != PgStatus.NON_QUIESCENT;''')
change('''        privatePids.clear();
        candidates.clear();
        blockers.clear();
        settings.clear();''','''        beforeBindings.clear();
        stableCandidates.clear();
        privatePids.clear();
        candidates.clear();
        blockers.clear();
        settings.clear();''')
# Map.of() is immutable in unobserved path; always clear a mutable identity-copy instead.
change('''      Map<Thread, PgClaimBinding> beforeBindings = snapshotBindings();''','''      Map<Thread, PgClaimBinding> beforeBindings =
          new java.util.IdentityHashMap<>(snapshotBindings());''')
# Exact boolean remains in existing numeric evidence key; no output PID/connection/identity.
change('''          .put("pgSnapshotExactClaimAttribution", false);''','''          .put("pgSnapshotExactClaimAttribution", claimSampler.pgExactClaimAttribution);''')
# Both original close clear sites retire backup references; no listener or wider lifetime.
change('''        executing.clear();
      }
      if (sampler == null) {''','''        executing.clear();
        bindings.clear();
      }
      if (sampler == null) {''')
change('''          executing.clear();
          entered.clear();
        }
        if (restoreInterrupt) {''','''          executing.clear();
          entered.clear();
          bindings.clear();
        }
        if (restoreInterrupt) {''')
for side,content in [('before',before),('candidate',s)]:
 p=out/side/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content)
inverse=s
for c in reversed(changes):
 assert inverse.count(c['after'])==1
 inverse=inverse.replace(c['after'],c['before'])
assert inverse==before
patch=''.join(difflib.unified_diff(before.splitlines(True),s.splitlines(True),fromfile='before/'+str(rel),tofile='candidate/'+str(rel)));(out/'candidate.patch').write_text(patch);(out/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
regions=[]
for m in re.finditer(r'  @Test\n',before):
 a=m.start();n=re.search(r'\n  (?:@|private |public |static )',before[a+8:]);b=a+8+n.start() if n else len(before);part=before[a:b];assert part in s;regions.append(h(part))
# Every generated script is unchanged: added code only touches existing Java diagnostic/template sections.
start=before.index('  private static String p4RevocationScalarSupport(');end=before.index('  private static String p3LoginDocument()',start);assert before[start:end] in s
r={'state':'FROZEN_ISOLATED_SOURCE_UNBUILT_UNRUN_NOT_APPLIED','source':str(rel),'baseSha256':h(before),'candidateSha256':h(s),'patchSha256':h(patch),'wholeInverseBytesExact':True,'oldTestCount':len(regions),'allOldTestRegionsByteExact':True,'testRegionSha256':regions,'generatedNativeRevocationProfileScriptRegionByteExact':True,'callbackProof':['Default-off/unregistered/ambient-or-nested transaction uses original super.execute(callback) directly','Only original selected outer new transaction wrapper invokes original callback once with the original status; original result/error and original GuidedSessionException catch body preserved','Binding removal in original callback finally before result/error returns to original superclass commit/rollback','No map replacement for nested callbacks, private binding reference identity compared using ==','Original HTTP leave/sampler close remove private map backup; observer failures never replace callback error or original rollback'],'connectionProof':['Manager datasource identity must equal original JDBC datasource','Original bound EntityManagerHolder must already contain native SessionImplementor; no EntityManager unwrap/create','Native LogicalConnectionManagedImpl must be open and already physically connected; public release-mode metadata excludes AFTER_STATEMENT aggressive release so a callback-active connection cannot be borrowed by a different transaction between statements','Only then get existing physical connection/PG unwrap and cached handshake backendPID; no obtain-if-unconnected/borrow/SQL/statement/close','No Connection/EntityManager/request IDs/parameters retained in binding; only positive private handshake PID in bounded registered Thread map'],'snapshotProof':['Before original catalog/row inspection copy immutable binding reference identities under existing gate','After each original row inspection and again after entire row loop stableBinding requires SAME entry instance still active for SAME registered thread and PID within existing30s window','Exact true only unique source-category candidate matched active before+after; ambiguous/ended/replaced/unsupported/truncated/unconfirmed remains false','Callback ends before commit/rollback => commit-stage association remains unobserved; no attribution of blocker method or exclusive wallclock latency','Existing snapshot SQL/bounds/cap8/30s/cadence/JDBCtrigger/timeouts/18numeric keys unchanged; no PID export'],'limits':['Physical-connected premise/runtime unique association UNRUN; unsupported/lazy resource stays unobserved without borrowing','No production or framework/dataSource/API/schema/permission/clock/case change','No performance or1s benefit/acceptance claim','Root independent exact source review, canonical formatting/static/compiler then one approved existing diagnostic required before any result'],'authority':['.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c5-prequery-binding-isolated-author-intent.txt','.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c5-prequery-binding-isolated-author-context.txt','docs/qa/evidence/STUDIO-OBS-007/root-c5-prequery-association-design-review.json'],'actions':{'liveSourceWrites':0,'globalBuilds':0,'runtime':0,'newCases':0,'newSql':0,'newListeners':0,'newNumericFields':0},'whole19AcPass':False,'lifecycleVerdict':None,'wholeWaveCeilingUsd':500,'billing':'UNAVAILABLE'}
(out/'result.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'base':h(before),'candidate':h(s),'report':h((out/'result.json').read_text()),'tests':len(regions)}))

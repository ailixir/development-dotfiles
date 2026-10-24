"""Source-derived symbolic witnesses only; no Java or author validator execution."""
from pathlib import Path
import json,re,ast,hashlib
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r-draft/resume2');O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-resume2-review')
edits={r['ids'][0]:r['replacement'] for r in json.loads((D/'poll-edits.json').read_text())}
loops={r['ids'][0]:r for r in json.loads((D/'loop-sites.json').read_text())};w=[]
for n,b in edits.items():
 p=f'itr{n:03d}';q=f'itrRead{n:03d}'
 guard = ('if (!'+p+'.firstIteration' if loops[n]['kind']=='do' else 'if (!(')
 assert b.index(f'if ({p}.intervalOwed)')<b.index(guard,b.index('java.util.concurrent.Callable'))
 assert b.index(f'if (Thread.interrupted()) throw new InterruptedException();')<b.index(f'if (System.nanoTime() < {p}.owedUntil) return false;')<b.index(f'{p}.intervalOwed = false;')
 assert b.index(f'if ({p}.firstException != null) throw {p}.firstException;')<b.index(f'if ({p}.terminal) return true;')
 assert f'while (!{p}.terminal)' in b and f'if (itrDone{n:03d}) break;' in b
 assert f'long itrBound{n:03d} = Math.max(itrRemaining{n:03d}, itrOwed{n:03d});' in b
 assert 'Original last-value/fall-through' not in b
 w.append({'site':n,'driverHasNoNormalPendingExit':True,'owedInterruptBeforeDueGuard':True,'terminalFirstFailureGuardBeforeAllReads':True})
for n in [83,86]:
 b=edits[n];read='P3_FINAL_REPORTS.get(execution)' if n==83 else 'p3Call(p3Cookie,'
 assert b.count(read)==1
 assert b.index('.intervalOwed = false;')<b.index(read)<b.index('if (!(',b.index('java.util.concurrent.Callable'))
 w.append({'site':n,'sourcePath':'due entered interval -> one real read -> original guard','expiredDeadlineCannotPrecedeOwedRead':True,'lateTerminalReplayPrevented':True})
for n in [29,31,32,33]:
 b=edits[n];assert b.index('if (!(',b.index('java.util.concurrent.Callable'))<b.index('assertThat(System.nanoTime())')
 w.append({'site':n,'sourcePath':'due interval -> fresh original condition -> original deadline assertion only if false','freshTrueAfterExpiry':'original and corrected avoid deadline assertion'})
b=edits[5];assert 'if (!itr005.intervalOwed && !(' in b and 'if (itr005.fixtureAnnouncement.isBlank()) {' in b
w.append({'site':5,'blankReadCrossingDeadline':'interval debt retained; driver clears/throws interrupt before clock/guard; no terminal from expiry alone','genuineNonblank':'no interval debt; terminal before !done interrupt check'})
b=edits[84];assert b.count('privateImmutableJson(')==1 and 'if (!(true))' in b and b.count('H8: expired teardown not CONFIRMED within 120 s')==1
w.append({'site':84,'noAwaitPath':'driver repeats pending original transition; unconditional original guard cannot silently terminate','firstImmutableWriteError':'latched before any driver reentry; no duplicate write','noAwaitReadOrRuntimeExecuted':True})
# Evaluate only a small safe subset of an actual Python verifier predicate, not the author program.
source=(D/'verify_mutation_run.py').read_text();tree=ast.parse(source)
node=next(n for n in ast.walk(tree) if isinstance(n,ast.Assert) and 'bodyCorpusChecksBeforeActivation' in ast.unparse(n.test))
assert isinstance(node.test,ast.Compare)
key=node.test.left.slice.value;threshold=node.test.comparators[0].value
assert key=='bodyCorpusChecksBeforeActivation' and isinstance(node.test.ops[0],ast.GtE) and threshold==1
old=(D/'ReplayIT.original.java').read_text()
def values(field):
 a=old.index(field+' =');return re.findall(r'"([^"\n]+)"',old[a:old.index(';',a)])
name='auditStreamCarriesIdsAndCodesOnlyAcrossTheWholeClass';assert name in values('SINGLETON_METHODS') and name not in values('INCREMENTAL_METHODS')
w.append({'actualVerifierLine':node.lineno,'actualPredicate':ast.unparse(node.test),'profileDerivedFromOriginalRegistry':{'test':{'Order39BodyPresent':True,'firstFinalBodyCorpusChecks':1,'predicatePass':1>=threshold},'guidedIncrementalTest':{'Order39BodyPresent':False,'firstFinalBodyCorpusChecks':0,'predicatePass':0>=threshold}},'counterexample':'valid complete incremental fault proof rejected'})
# Actual negative-branch cohort assertions omit unaffected flags; collector validates presence/freshness only.
segment=source[source.index("elif name=='cohort.json':"):source.index('# Both final boundaries')]
for flag in ['privacyComplete','modelEvidenceComplete','budgetEvidenceComplete','responseEvidenceComplete','retentionFailures']:assert flag not in segment
required={'producersDrained':True,'finalScansAttempted':True,'invocations':[{'passed':True,'afterEachComplete':True}], 'privacyComplete':False,'modelEvidenceComplete':False,'budgetEvidenceComplete':False,'responseEvidenceComplete':False,'retentionFailures':1}
assert required['producersDrained'] and required['finalScansAttempted'] and all(i['passed'] and i['afterEachComplete'] for i in required['invocations'])
w.append({'negativeCohortBranchAcceptsModeledFacts':required,'notWholeVerifierExecution':True,'gap':'unaffected semantic failures not rejected by actual cohort branch; raw aggregated stack matching is insufficient'})
(O/'path-witnesses.json').write_text(json.dumps({'scope':'source-derived structural/symbolic witnesses; no Java/runtime equivalence claim','witnesses':w},indent=2)+'\n')
print(json.dumps({'sites':len(edits),'structuralWitnesses':len(w),'remainingVerifierFindings':2}))

from pathlib import Path
import hashlib,json,difflib,re
out=Path('docs/qa/evidence/STUDIO-OBS-007/resume-d-c5-capture-isolated-author')
rel=Path('backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java')
s=rel.read_text();sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
assert sha(s)=='f8d429f9a6fcdaa4cf2a1f3d5404e67d1049834ee3cd6640f249b925c35f5850'
before=s;changes=[]
def replace(old,new):
 global s
 assert s.count(old)==1,(old[:100],s.count(old))
 s=s.replace(old,new);changes.append({'before':old,'after':new})
replace('''    var canaries = new java.util.ArrayList<String>();
    canaries.add(canary);
    var fixtureReceiptIds''','''    String rotatedCanary = "ROTATED-LOGIN-" + UUID.randomUUID();
    var canaries = new java.util.ArrayList<String>();
    canaries.add(canary);
    canaries.add(rotatedCanary); // Both actual values are known to the original stream matcher at opening.
    var fixtureReceiptIds''')
replace('''        String actual = run == 0 ? canary : "ROTATED-LOGIN-" + UUID.randomUUID();
        if (run == 1) {
          canaries.add(actual);
          capture.writeProfileValues();''','''        String actual = run == 0 ? canary : rotatedCanary;
        if (run == 1) {
          capture.writeProfileValues();''')
start=s.index('    synchronized void recordHttp(HttpResponse<String> response) {')
end=s.index('    void watchExecution(UUID execution)',start)
old=s[start:end]
header='''    synchronized void recordHttp(HttpResponse<String> response) {'''
assert old.startswith(header)
bound=old.index('      if (bytes.length > MAX_BYTES) {')
pure=old[len(header):bound]
# Exact original metadata/bound/failure body, merely nested inside the same monitor.
metadata=old[bound:old.rfind('    }')]
new='''    void recordHttp(HttpResponse<String> response) {'''+pure+'''      synchronized (this) {
'''+''.join('  '+line if line.strip() else line for line in metadata.splitlines(True))+'''      }
    }

'''
replace(old,new)
for folder,text in [('before',before),('candidate',s)]:
 p=out/folder/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
inverse=s
for c in reversed(changes):
 assert inverse.count(c['after'])==1
 inverse=inverse.replace(c['after'],c['before'])
assert inverse==before
patch=''.join(difflib.unified_diff(before.splitlines(True),s.splitlines(True),fromfile='before/'+str(rel),tofile='candidate/'+str(rel)))
(out/'candidate.patch').write_text(patch)
(out/'inverse-transformations.json').write_text(json.dumps(changes,indent=2)+'\n')
# Only the exact approved ninth test region changes; all other test regions byte-exact.
regions=[]
for m in re.finditer(r'  @Test\n',before):
 a=m.start();nxt=re.search(r'\n  (?:@|private |public |static )',before[a+8:]);b=a+8+nxt.start() if nxt else len(before)
 text=before[a:b];exact=text in s
 if not exact:
  assert 'ROTATED-LOGIN-' in text and 'C5Capture capture = new C5Capture(canaries, false)' in text
 regions.append({'sha256':sha(text),'byteExact':exact,'change':'Exact preregistration inverse only' if not exact else None})
assert sum(not r['byteExact'] for r in regions)==1
# Entire generated script helper functions stay byte exact: no replacement reaches them.
scriptStart=before.index('  private static String p4RevocationScalarSupport(')
scriptEnd=before.index('  private static String p3LoginDocument()',scriptStart)
assert before[scriptStart:scriptEnd] in s
r={'state':'FROZEN_ISOLATED_SOURCE_CANDIDATE_UNBUILT_UNRUN_NOT_APPLIED','source':str(rel),'baseSha256':sha(before),'candidateSha256':sha(s),'patchSha256':sha(patch),'wholeInverseBytesExact':True,'testRegions':regions,'oldTestCount':len(regions),'unchangedOtherTestCount':sum(x['byteExact'] for x in regions),'generatedRevocationNativeProfileScriptRegionByteExact':True,'rotationProof':['Same one rotated UUID is generated once before capture construction and preregistered exactly once with initial value','Original Vault rotate/origin/fixture rotate POST/profile refresh/second replay remain at the same run1 point, original bodies/arguments/calls unchanged except same variable reuse','Original matcher now snapshots all fifteen variants for both actual returned controlled values from capture opening through final closure','No extra provider/native/model/request/read; no version/source/reference/hash/scope/security/timer/assertion change'],'recordHttpLifetimeProof':{'creationSites':[{'owner':'original ninth','inventory':'Method-local ArrayList now filled with exactly initial+rotation before constructor, no later mutation; final scan/profile methods read only'},{'owner':'p9 midfill child fixture','inventory':'List.of(value)'},{'owner':'p7 captured outage/pool fixture','inventory':'List.of(old,fresh)'},{'owner':'p14 minimum fixture','inventory':'List.of(canary)'},{'owner':'p8 native fixture','inventory':'List.of(value)'}],'directCallers':[{'method':'p3Call','facts':'Same original synchronous HttpClient.send response, private UTF8 bytes; immediate record before status assertion/return; called by fixture test/lifecycle/poll/cleanup methods, not delegated to any added asynchronous record task'},{'method':'publicCall','facts':'Same original synchronous HttpClient.send response; owner tracking/binding precedes record; record precedes original status assertion/return'}],'lifetime':'Current source-owned capture scope closes in its enclosing test/helper finally after synchronous client calls and genuine owner cleanup. Server/filter/log callbacks may run concurrently but do not mutate canary inventories or call recordHttp; they keep original synchronized capture metadata/log behavior. Both direct callers use real returned HttpResponse<String>/immutable String, not a shared producer byte array. No values list writes remain during any current capture lifetime after preregistration. This is current source/default ordered fixture proof, not arbitrary future concurrent embedding guarantee.','sourceChecks':'Private class and recordHttp have exactly two direct callsites; five explicit two-arg capture creations, default one-arg constructor only delegates; no cache/worker/route uses recordHttp asynchronously. Other local canaries.add statements belong to separate noncapture tests.','monitorPreservation':'UTF8 conversion and original all-values/all-fifteen-variants immediate absence assertion only move before same monitor. Bound check, failed=true, fixed overflow exception, original produced insertion/counters/media status body remain byte exact after dedenting one added monitor block. Both old and new immediate privacy assertion precede produced insertion and bound failure. Collection/final/late scans and encoder monitor stay unchanged.'},'sourceLimits':['No latency benefit/exclusive source attribution/one-second success asserted','Current C5 already red; rotated original streamed logs from historical runs unavailable','No live source, formatter/compiler/test/build or runtime executed','Independent root review required before integration and original workflow/gates'],'authority':['.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c5-capture-isolated-author-intent.txt','.aiox/sdc/STUDIO-OBS-007/dispatch/resume-d-c5-capture-isolated-author-context.txt','docs/qa/evidence/STUDIO-OBS-007/root-c5-capture-audit-design-review.json'],'actions':{'liveSourceWrites':0,'runtime':0,'newCases':0,'newFrameworks':0,'newInstrumentation':0,'clockChanges':0},'whole19AcPass':False,'lifecycleVerdict':None,'wholeWaveCeilingUsd':500,'billingTelemetry':'UNAVAILABLE'}
(out/'result.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({'base':sha(before),'candidate':sha(s),'report':sha((out/'result.json').read_text()),'oldTests':len(regions),'otherExact':sum(x['byteExact'] for x in regions)}))

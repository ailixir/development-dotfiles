from pathlib import Path
import hashlib,difflib,json
p=Path('docs/qa/evidence/STUDIO-OBS-007/resume-r-c6-isolated-candidate')
before=(p/'repair2-before/GuidedPublicationReplayIT.java').read_text();assert hashlib.sha256(before.encode()).hexdigest()=='ce1219cdcbd10b7fd6f7fa5a3be42228b3f440556c41be0e7c644e42c15d5d23'
s=before;changes=[]
def rep(old,new,name):
 global s
 assert s.count(old)==1,(name,s.count(old));s=s.replace(old,new);changes.append(name)
rep('''  private void p4AwaitRevocationObserverCompletion(P4RevocationState state) throws Exception {
    long deadline''','''  private void p4AwaitRevocationObserverCompletion(P4RevocationState state) throws Exception {
    if (state.c6Kind != 0) {
      // C6 never manufactures the legacy successful click/authority flip or residual ACK.
      p8AwaitC6Closed(state);
      return;
    }
    long deadline''','selected-c6-completion-uses-real-native-close-settlement-restoration')
rep('''      if (!cleanupUnconfirmed) {
        if (owned != null && owned.c6Kind != 0 && !owned.c6ProducerSealed) {
          p3AttemptTeardown(failures, () -> {
            p4SealPrivateProducersAfterOwnerCleanup(owned);owned.c6ProducerSealed=true;
          });
        }
        if (owned != null && owned.c6Kind != 0''','''      // Independently attempt the EXISTING selected producer restoration/seal command even
      // when original owner close failed. It cannot clear sticky failures or quarantine.
      if (owned != null && owned.c6Kind != 0 && !owned.c6ProducerSealed) {
        p3AttemptTeardown(failures, () -> {
          p4SealPrivateProducersAfterOwnerCleanup(owned);owned.c6ProducerSealed=true;
        });
      }
      if (!cleanupUnconfirmed) {
        if (owned != null && owned.c6Kind != 0''','failed-original-cleanup-still-attempts-existing-selected-seal')
rep('''    assertThat(state.c6NativeClose).as("original SDK close receipt").isTrue();
    assertThat(state.restored)''','''    assertThat(state.c6NativeClose).as("original SDK close receipt").isTrue();
    if (state.c6FenceAvailable) {
      assertThat(p4OriginalCloseSettled(state.c6Phase) && P4_CLOSED_PHASES.contains(state.c6Phase))
          .as("actual original healthy page fence and close receipt").isTrue();
    } else {
      assertThat(P8_C6_CLOSED_UNKNOWN.contains(state.c6Phase) && !P4_CLOSED_PHASES.contains(state.c6Phase))
          .as("actual original close with unavailable realm effects, never healthy by absence").isTrue();
    }
    assertThat(state.restored)''','c6-completion-explicitly-checks-actual-healthy-or-closed-unknown-phase')
base=(p/'before.java').read_text();(p/'GuidedPublicationReplayIT.java').write_text(s)
full=''.join(difflib.unified_diff(base.splitlines(True),s.splitlines(True),fromfile='a/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java',tofile='b/backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java'))
repair=''.join(difflib.unified_diff(before.splitlines(True),s.splitlines(True),fromfile='a/isolated/GuidedPublicationReplayIT.java',tofile='b/isolated/GuidedPublicationReplayIT.java'))
(p/'candidate.patch').write_text(full);(p/'repair2.patch').write_text(repair)
m=json.loads((p/'repair2-before/manifest.json').read_text());m['afterSha256']=hashlib.sha256(s.encode()).hexdigest();m['patchSha256']=hashlib.sha256(full.encode()).hexdigest();m['secondRepairBeforeSha256']=hashlib.sha256(before.encode()).hexdigest();m['secondRepairPatchSha256']=hashlib.sha256(repair.encode()).hexdigest();m['secondRepairChanges']=changes
# The legacy non-C6 completion body is exactly preserved below the case-gated prefix.
old='''  private void p4AwaitRevocationObserverCompletion(P4RevocationState state) throws Exception {
    long deadline'''
new='''  private void p4AwaitRevocationObserverCompletion(P4RevocationState state) throws Exception {
    if (state.c6Kind != 0) {
      // C6 never manufactures the legacy successful click/authority flip or residual ACK.
      p8AwaitC6Closed(state);
      return;
    }
    long deadline'''
restored=s.replace(new,old,1)
start=before.index(old);end=before.index('  private void p4SealPrivateProducersAfterOwnerCleanup',start)
rstart=restored.index(old);rend=restored.index('  private void p4SealPrivateProducersAfterOwnerCleanup',rstart)
assert before[start:end]==restored[rstart:rend]
m['legacyCompletionBranchByteIdentical']=True
(p/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'afterSha256':m['afterSha256'],'fullPatchSha256':m['patchSha256'],'secondRepairPatchSha256':m['secondRepairPatchSha256'],'legacyCompletionUnchanged':True,'runtime':'UNRUN'}))

"""Independent text/hash checks for corrected C6 prerequisite. No product execution."""
from pathlib import Path
import hashlib
import json
import re

HERE=Path(__file__).resolve().parent
PACK=HERE.parent
OLD=PACK.parent
ROOT=HERE.parents[7]
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_bytes())
manifest=load(PACK/'manifest.json')
assert sha((PACK/'manifest.json').read_bytes())=='bc280c8e012258bcfd9d3c64ba01aebc852b10019bba7b50600b41cbf297e118'
for item in manifest['files']:
    raw=(ROOT/item['path']).read_bytes()
    assert len(raw)==item['bytes'] and sha(raw)==item['sha256']
historical=load(PACK/'historical-preservation.json')['originalFiles']
assert len(historical)==21
for item in historical:assert sha((ROOT/item['path']).read_bytes())==item['sha256']
assert sha((OLD/'qa-review/review.md').read_bytes())=='a69472c20e9fbde3f69ac443fb59935b51144739f63f6772568c52c6cc7fb4c3'
name=load(PACK/'source-preservation.json')['path']
stages={stage:(PACK/stage/name).read_bytes() for stage in ['before','red','green']}
for stage,raw in stages.items():assert sha(raw)==manifest[stage+'Sha256']
assert (ROOT/name).read_bytes()==stages['before']

def apply_text(original,patch_name):
    lines=(PACK/patch_name).read_text().splitlines(keepends=True)
    assert lines[:2]==['--- a/'+name+'\n','+++ b/'+name+'\n']
    source=original.decode().splitlines(keepends=True)
    i=2;pos=0;result=[]
    while i<len(lines):
        match=re.fullmatch(r'@@ -(\d+),(\d+) \+(\d+),(\d+) @@\n',lines[i]);assert match
        start,old_count,new_start,new_count=map(int,match.groups())
        assert start-1>=pos
        result.extend(source[pos:start-1]);pos=start-1
        assert len(result)==new_start-1
        i+=1;consumed=produced=0
        while i<len(lines) and not lines[i].startswith('@@ '):
            line=lines[i];assert line[0] in ' +-'
            if line[0] in ' -':assert source[pos]==line[1:];pos+=1;consumed+=1
            if line[0] in ' +':result.append(line[1:]);produced+=1
            i+=1
        assert (consumed,produced)==(old_count,new_count)
    result.extend(source[pos:]);return ''.join(result).encode()

for a,b,patch in [
    ('before','red','01-neutral-seam-fixture-and-controls.patch'),
    ('red','green','02-fresh-liveness-only.patch'),
    ('green','red','restore-green-to-red.patch'),
    ('green','before','restore-green-to-before.patch'),
    ('red','before','restore-red-to-before.patch')]:assert apply_text(stages[a],patch)==stages[b]
old_header=b'  void syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls() {\n'
new_header=b'  void syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls() throws Exception {\n    itrEnsureClassFixtures();\n'
for stage in ['red','green']:
    parent=(OLD/stage/name).read_bytes()
    assert parent.count(old_header)==stages[stage].count(new_header)==1
    assert parent.replace(old_header,new_header,1)==stages[stage]
assert apply_text((OLD/'red'/name).read_bytes(),'fixture-prerequisite-from-original-red.patch')==stages['red']

before=stages['before'].decode();red=stages['red'].decode();green=stages['green'].decode()
helper_start=before.index('  private static boolean p8TerminatedUnsignalled(ProcessHandle pinned) {')
helper_end=before.index('\n  // R10-rev2 I3',helper_start)
old_helper=before[helper_start:helper_end]
neutral=(OLD/'neutral-helper.java.txt').read_text();fixed=(OLD/'green-helper.java.txt').read_text()
controls=(OLD/'appended-controls.java.txt').read_text()
assert sha(controls.encode())==manifest['sameNineControlsSha256']
start=before.index(old_header.decode());end=before.index('\n  @Test',start)
old_support=before[start:end]
new_support=(old_support[:-4]+controls+'  }\n').replace(old_header.decode(),new_header.decode(),1)
assert before.replace(old_helper,neutral,1).replace(old_support,new_support,1)==red
assert before.replace(old_helper,fixed,1).replace(old_support,new_support,1)==green
for text,helper in [(red,neutral),(green,fixed)]:
    assert text.replace(helper,old_helper,1).replace(new_support,old_support,1)==before
assert neutral[neutral.index('    try {'):]==old_helper[old_helper.index('    try {'):].replace('pinned.isAlive()','isAlive.getAsBoolean()').replace('p6Status(pinned).state()','status.get()')
assert fixed==neutral.replace('return "X".equals(state) || state.startsWith("Z");','return "X".equals(state) || state.startsWith("Z") || !isAlive.getAsBoolean();')
assert neutral.count('() -> pinned.isAlive()')==neutral.count('() -> p6Status(pinned).state()')==1
assert controls.count('assertThat(')==18 and controls.count('p8TerminatedUnsignalled(')==9
assert red.splitlines()[20887].strip()=='.isTrue();'
init_start=before.index('  private void itrEnsureClassFixtures() throws Exception {')
init_end=before.index('\n  private ItrPublishedFixture',init_start)
initializer=before[init_start:init_end]
assert sha(initializer.encode())==manifest['initializerBodySha256']
assert all(text.count(initializer)==1 for text in [before,red,green])
assert initializer.count('startWorkers();')==1
assert 'if (guidedWorker == null && ordinaryWorker == null)' in initializer
assert 'assertThat(cleanupUnconfirmed)' in initializer
for text in ['assertThat(guidedWorker).as("existing guided owner is retained").isNotNull();',
             'assertThat(ordinaryWorker).as("existing ordinary owner is retained").isNotNull();',
             'assertThat(guidedWorker.isAlive()).as("no implicit guided restart").isTrue();',
             'assertThat(ordinaryWorker.isAlive()).as("no implicit ordinary restart").isTrue();']:
    assert text in initializer
assert all(token not in initializer for token in ['createSource(','startLearning(','itrFreshPublishedFixture(',
             'itrEstablishOwnAuditCorpus(','AUDIT_CANARIES','dispatcher.','MODEL_WIRE.add'])
for text in [before,red,green]:
    assert len(re.findall(r'(?m)^\s*@Test\s*$',text))==73
    assert text.count('Thread.sleep(')==94 and text.count('TimeUnit.NANOSECONDS.sleep(')==1
    for marker in ['cleanupUnconfirmed','AUDIT_CANARIES.add','MODEL_WIRE.add']:
        assert [line for line in text.splitlines() if marker in line]==[line for line in before.splitlines() if marker in line]

composition=[]
for row in load(PACK/'prospective-composition.json')['rows']:
    old=(ROOT/row['path']).read_text()
    assert sha(old.encode())==row['sha256'] and old.count(old_helper)==old.count(old_support)==old.count(initializer)==1
    composed=old.replace(old_helper,fixed,1).replace(old_support,new_support,1)
    assert sha(composed.encode())==row['prospectiveComposedGreenSha256']
    assert composed.replace(fixed,old_helper,1).replace(new_support,old_support,1)==old
    assert old.count('Thread.sleep(')==composed.count('Thread.sleep(')==row['oldThreadSleepCount']
    assert old.count('TimeUnit.NANOSECONDS.sleep(')==composed.count('TimeUnit.NANOSECONDS.sleep(')==1
    composition.append({'path':row['path'],'oldSha256':row['sha256'],'prospectiveGreenSha256':sha(composed.encode()),'applied':False})
future=load(PACK/'future-commands.json')
assert future['selector'].endswith('.syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls')
for job in future['jobs']:
    label=job['argv'][2]
    assert '-c6-observation-r2-' in label and not job['executed']
    assert not (ROOT/'docs/qa/evidence/STUDIO-OBS-011/execution'/(label+'-results.json')).exists()
    assert job['expectedSourceSha256']==manifest['redSha256' if 'red' in job['id'] else 'greenSha256']
    if 'support' in job['id']:
        assert job['argv'][job['argv'].index('--tests')+1]==future['selector']

out={'sourceVerdict':'CLEAN_FOR_CONTROLLED_RED','closedFinding':'C6-QA-01','mandatoryFindings':[],
     'manifestSha256':sha((PACK/'manifest.json').read_bytes()),
     'beforeSha256':sha(stages['before']),'redSha256':sha(stages['red']),'greenSha256':sha(stages['green']),
     'oldHistoricalArtifactsUnchanged':21,'correctionExactlySignatureAndExistingInitializerCall':True,
     'initializerBodyUnchangedSha256':sha(initializer.encode()),'firstConstructionOnlyExistingLiveOwnersRetained':True,
     'sameNineControlsSha256':sha(controls.encode()),'fivePatchDirectionsAndIsolatedCorrectionExact':True,
     'wholeSourceFourEditReverseProof':True,'prospectiveComposition':composition,
     'freshProspectiveLabelsVerified':True,'runtimeExecuted':False,'actualSourceApplied':False,
     'sourceLanguageParserExecuted':False,'historicalCauseProved':False}
(HERE/'independent-text-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'sourceVerdict':out['sourceVerdict'],'closedFinding':'C6-QA-01','checksSha256':sha((HERE/'independent-text-checks.json').read_bytes())}))

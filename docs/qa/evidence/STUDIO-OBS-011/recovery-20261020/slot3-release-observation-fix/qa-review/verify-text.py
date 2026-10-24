"""Independent bounded text/hash reconstruction; no source-language parser or runtime."""
from pathlib import Path
import hashlib
import json
import re

HERE=Path(__file__).resolve().parent
PACK=HERE.parent
ROOT=HERE.parents[6]
sha=lambda b:hashlib.sha256(b).hexdigest()
load=lambda p:json.loads(p.read_bytes())
manifest=load(PACK/'manifest.json')
assert sha((PACK/'manifest.json').read_bytes())=='f38a2d3b8c48d0b183191f547958e1e76baea003c76a313d89ba9b1d1c2b3878'
for item in manifest['inputs']+manifest['files']:
    raw=(ROOT/item['path']).read_bytes()
    assert sha(raw)==item['sha256'],item['path']
    if 'bytes' in item:assert len(raw)==item['bytes']
name=manifest['scopePath']
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
    ('before','red','01-neutral-seam-and-controls.patch'),
    ('red','green','02-fresh-liveness-only.patch'),
    ('green','red','restore-green-to-red.patch'),
    ('green','before','restore-green-to-before.patch'),
    ('red','before','restore-red-to-before.patch')]:assert apply_text(stages[a],patch)==stages[b]

before=stages['before'].decode();red=stages['red'].decode();green=stages['green'].decode()
helper_start=before.index('  private static boolean p8TerminatedUnsignalled(ProcessHandle pinned) {')
helper_end=before.index('\n  // R10-rev2 I3',helper_start)
old_helper=before[helper_start:helper_end]
neutral=(PACK/'neutral-helper.java.txt').read_text()
fixed=(PACK/'green-helper.java.txt').read_text()
controls=(PACK/'appended-controls.java.txt').read_text()
start=before.index('  void syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls() {')
end=before.index('\n  @Test',start)
old_support=before[start:end]
assert sha(old_support.encode())=='010c3a725bbf6ab82dbb62aa62ec87f891643f327dc53c465e68ff83cacbf1b3'
new_support=old_support[:-4]+controls+'  }\n'
assert before.count(old_helper)==before.count(old_support)==1
assert before.replace(old_helper,neutral,1).replace(old_support,new_support,1)==red
assert before.replace(old_helper,fixed,1).replace(old_support,new_support,1)==green
assert red.replace(neutral,old_helper,1).replace(new_support,old_support,1)==before
assert green.replace(fixed,old_helper,1).replace(new_support,old_support,1)==before
assert neutral[neutral.index('    try {'):]==old_helper[old_helper.index('    try {'):].replace('pinned.isAlive()','isAlive.getAsBoolean()').replace('p6Status(pinned).state()','status.get()')
assert fixed==neutral.replace('return "X".equals(state) || state.startsWith("Z");',
                              'return "X".equals(state) || state.startsWith("Z") || !isAlive.getAsBoolean();')
assert neutral.count('() -> pinned.isAlive()')==neutral.count('() -> p6Status(pinned).state()')==1
assert 'pinned::isAlive' not in neutral
assert controls.count('assertThat(')==18 and controls.count('p8TerminatedUnsignalled(')==9
assert all(word not in controls for word in ['ProcessHandle','Thread.sleep','p6Status(','startWorkers(','destroyForcibly(','new ProcessBuilder','p6Signal('])
assert red.splitlines()[20886].strip()=='.isTrue();'
for stage in [before,red,green]:
    assert len(re.findall(r'(?m)^\s*@Test\s*$',stage))==73
    assert stage.count('Thread.sleep(')==94 and stage.count('TimeUnit.NANOSECONDS.sleep(')==1
    assert [line for line in stage.splitlines() if 'cleanupUnconfirmed' in line]==[line for line in before.splitlines() if 'cleanupUnconfirmed' in line]
assert red[:red.index('  void syntheticSinkScanner')].count('startWorkers();')==before[:start].count('startWorkers();')

composition=[]
for row in load(PACK/'prospective-composition.json')['rows']:
    old=(ROOT/row['path']).read_text()
    assert sha(old.encode())==row['sha256']
    assert old.count(old_helper)==old.count(old_support)==1
    composed=old.replace(old_helper,fixed,1).replace(old_support,new_support,1)
    assert sha(composed.encode())==row['prospectiveComposedGreenSha256']
    assert composed.replace(fixed,old_helper,1).replace(new_support,old_support,1)==old
    assert old.count('Thread.sleep(')==composed.count('Thread.sleep(')==row['oldThreadSleepCount']
    assert old.count('TimeUnit.NANOSECONDS.sleep(')==composed.count('TimeUnit.NANOSECONDS.sleep(')==1
    composition.append({'path':row['path'],'beforeSha256':row['sha256'],'prospectiveGreenSha256':sha(composed.encode()),'actualSourceApplied':False})

# Closed source contradiction in the proposed standalone runtime plan: real log fixture is absent.
assert 'startWorkers(' not in old_support and 'startWorkers(' not in new_support
collect_start=before.index('  private void collectJoinedSinks(')
collect_end=before.index('\n  private ',collect_start+1)
collect=before[collect_start:collect_end]
assert 'for (String file : List.of("guided.log", "ordinary.log"))' in collect
assert 'sinks.put(file, Files.readAllBytes(TEMP.resolve(file)));' in collect
scan_start=before.index('  private void scanFinalOwnedSinks(')
assert 'collectJoinedSinks(sinks);' in before[scan_start:before.index('\n  private ',scan_start+1)]
assert 'Files.createTempDirectory("obs007-joined-")' in before
assert 'guided.redirectErrorStream(true).redirectOutput(TEMP.resolve("guided.log").toFile())' in before
assert 'ProcessBuilder.Redirect.to(TEMP.resolve("ordinary.log").toFile())' in before
out={'sourceVerdict':'NOT_READY_MANDATORY_SINGLETON_FIXTURE_PREREQUISITE',
     'finding':'C6-QA-01: standalone synthetic case has no real worker log setup but original finalization unconditionally reads both worker logs',
     'manifestSha256':sha((PACK/'manifest.json').read_bytes()),
     'beforeSha256':sha(stages['before']),'redSha256':sha(stages['red']),'greenSha256':sha(stages['green']),
     'allFivePatchDirectionsExact':True,'wholeSourceTwoSpanReverseProof':True,
     'neutralLazyProviderSubstitutionExact':True,'greenOnlyFreshLivenessDelta':True,
     'controlledBlocks':9,'addedAssertions':18,'originalJUnitCasesUnchanged':73,
     'originalAssertionsOutsideAppendedBlockExact':True,'protectedNativeIdentityCleanupBytesUnchanged':True,
     'prospectiveComposition':composition,'runtimeExecuted':False,'actualSourceApplied':False,
     'historicalCauseProved':False,'sourceLanguageParserExecuted':False}
(HERE/'independent-text-checks.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'sourceVerdict':out['sourceVerdict'],'checksSha256':sha((HERE/'independent-text-checks.json').read_bytes())}))

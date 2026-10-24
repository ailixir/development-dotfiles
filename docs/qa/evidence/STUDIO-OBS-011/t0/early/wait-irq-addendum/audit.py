"""Read-only/light Python audit of addendum source and sealed inputs. No Java execution."""
from pathlib import Path
import hashlib
import json
import re

O=Path(__file__).resolve().parent
ROOT=O.parents[6]
EARLY=O.parent
sha=lambda data:hashlib.sha256(data).hexdigest()
binding=json.loads((O/'bindings.json').read_text())
java=(O/'WaitIrqConformance.java').read_text()
assert sha(java.encode())==binding['generatedJavaSha256']
sealed_java=(EARLY/'it-s-draft/resume2/conformance/WaitConformance.java').read_text()
assert sha(sealed_java.encode())==binding['sealedOriginalJavaSha256']


def mask(s):
    return re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/',lambda m:''.join('\n' if c=='\n' else ' ' for c in m[0]),s)


def method(s,index,variant):
    match=re.search(r'(?m)^ *Object s'+str(index)+'_'+variant+r'\(\) throws Exception \{',s)
    assert match
    hidden=mask(s);opening=hidden.index('{',match.start());depth=1;end=opening+1
    while depth:
        depth+=(hidden[end]=='{')-(hidden[end]=='}');end+=1
    return match.start(),s[match.start():end]


for record in binding['cases']:
    index=record['index']
    for variant in ['original','delivered']:
        start,body=method(java,index,variant)
        assert body==method(sealed_java,index,variant)[1]
        assert sha(body.encode())==record['copied'+variant.title()+'MethodSha256']
    start,body=method(java,index,'original')
    sleep=re.search(r'Thread\.sleep\((\d+)\)',mask(body))
    assert int(sleep[1])==record['intervalMillisUnchanged']
    assert java.count('\n',0,start+sleep.start())+1==record['originalSleepSourceLine']
    start,body=method(java,index,'delivered')
    guard=body.index('if (slept && Thread.interrupted())')
    target=body.index('throw new InterruptedException();',guard)
    assert java.count('\n',0,start+target)+1==record['deliveredPostIntervalThrowSourceLine']
    out=EARLY/('gs-t2-draft/resume2' if index<14 else 'it-s-draft/resume2')
    candidate_folder='candidates' if index<14 else 'repo'
    edit=next(r for r in json.loads((out/'loop-edits.json').read_text()) if r['id']==record['id'])
    assert edit['replacement'] in (out/candidate_folder/record['path']).read_text()
    assert sha(edit['replacement'].encode())==record['deliveredBoundSha256']

# Syntax delimiters only: this is deliberately not a Java compiler or a passing probe.
hidden=mask(java)
stack=[]
for char in hidden:
    if char in '([{':stack.append(char)
    elif char in ')]}':assert stack.pop()=={')':'(',']':'[','}':'{'}[char]
assert not stack
fixture=java[java.index('  static final class Fixture {'):java.index('  static final java.lang.management.ThreadMXBean')]
assert sha(fixture.removesuffix('\n').encode())==binding['fixtureCopiedByteExactSha256']
assert 'Thread.ofPlatform().daemon(false)' in java
assert java.count('worker.interrupt();')==2 # one measured interrupt and one owned cleanup only
assert 'worker.join(' in java and 'joinOwned(worker,3000)' in java and 'joinOwned(worker,4000)' in java
assert 'Runtime.getRuntime().halt(3)' in java
assert 'Thread.State.TIMED_WAITING' in java and 'frame.getMethodName().startsWith("sleep")' in java
assert 'Uninterruptibles' in java and 'ConditionAwaiter' in java
assert 'p.reads==1' in java and 'entered.waitedCount()>=0' in java
assert 'current.waitedCount()>entered.waitedCount()' in java
assert 'frame.getLineNumber()==deliveredAfterIntervalLines[site]' in java
assert 'frame.getLineNumber()==originalSleepLines[site]' in java
assert 'value.reads()).as(label+' in java and ').isEqualTo(1);' in java
assert 'now.trace()' in java and 'old.trace()' in java
assert 'throw new AssertionError("UNPROVED' in java
assert 'sleepUninterruptibly' in java

seal_counts={}
for rel,facts in binding['sealedPackages'].items():
    directory=ROOT/rel
    actual={str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()}
    assert actual==set(facts['files'])
    for name,digest in facts['files'].items():assert sha((directory/name).read_bytes())==digest
    seal_counts[rel]=len(actual)
for row in json.loads((O/'input-bindings.json').read_text()):
    assert sha((ROOT/row['path']).read_bytes())==row['sha256']
for row in json.loads((O/'classpath.json').read_text())['jars']:
    assert sha(Path(row['path']).read_bytes())==row['sha256']

owned_source=[]
for directory in [EARLY/'gs-t2-draft/resume2',EARLY/'it-s-draft/resume2']:
    manifest=json.loads((directory/'manifest.json').read_text())
    rows=manifest['owned'] if isinstance(manifest,dict) else manifest
    for row in rows:
        source=ROOT/row['path']
        digest=row.get('actualS011Sha256',row['preimageSha256'])
        assert (sha(source.read_bytes()) if source.exists() else None)==digest
        owned_source.append({'path':row['path'],'actualSha256':digest})

oracle={'status':'EXPECTED ONLY / ALL RUNTIME UNEXECUTED',
        'siteCount':26,'ownedRuns':52,'ownedSourceBindings':owned_source,
        'perPair':['same exact first-read/effect trace','one first unwrapped InterruptedException escape',
                   'exactly one external condition/predicate/marker read; no original final fresh read',
                   'cleared caller flag except two route outer handlers which reassert it',
                   'original native Thread.sleep frame at bound source line',
                   'delivered post-interval step throw at different bound source line',
                   'pre-interrupt real TIMED_WAITING sleep + exact owner stack',
                   'delivered resumed Uninterruptibles native sleep, higher waitedCount, still first read',
                   'owned thread joined; no survivor; unchanged default uncaught handler'],
        'failClosed':['missing entry/ack/read count/line evidence is FAIL_OR_UNPROVED, never inferred pass',
                      'unknown/unsupported waitedCount cannot acknowledge resleep',
                      'no retry; any failure stops remaining pairs',
                      'bounded cleanup releases gate, interrupts/joins only owned worker',
                      'survivor writes failure proof then halts only owned scratch JVM'],
        'timing':'10/20/25/50ms real intervals preserved;2500ms scratch coordination budget only; no latency/timing identity assertion',
        'sealedPackagesMembershipAndHashCounts':seal_counts,
        'copiedMethodsByteExact':52,'actualDeliveredBlocksHashBound':26,
        'noCompilerRuntimeProbeExecution':True,'earlier234ComparisonsNotExecutedHere':True,
        'nativeGateCoveragePrivacyTransactionOwnershipAndAC5TimingCredit':False}
(O/'expected-oracle.json').write_text(json.dumps(oracle,indent=2)+'\n')
print(json.dumps({'staticOnly':True,'copiedMethods':52,'hashBoundSites':26,'ownedRunsUNEXECUTED':52,
                  'sealedPackagesUnchanged':True,'javaSha256':binding['generatedJavaSha256']}))

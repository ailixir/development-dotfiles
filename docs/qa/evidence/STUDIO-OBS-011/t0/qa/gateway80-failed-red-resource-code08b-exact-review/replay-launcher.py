"""One inspected sealed dispatcher replay; only exclusive result sink changes."""
from pathlib import Path
import difflib
import hashlib
import json

REVIEW = Path(__file__).absolute().parent
SEALED = REVIEW.parent.parent / 'early/gateway80-failed-red-resource-prep/resume8b/dispatcher_check.py'
EXPECTED = 'efe64dac5199734da29a15ae42b9d3290a0dc357b23d391a0d6043e40b547397'
raw = SEALED.read_bytes()  # Exactly one sealed harness read in this launcher.
assert hashlib.sha256(raw).hexdigest() == EXPECTED
source = raw.decode('utf-8')
old = "str(HERE/'dispatcher-results.json')"
new = repr(str(REVIEW / 'dispatcher-results.json'))
assert source.count(old) == 1
rewritten = source.replace(old, new, 1)
delta = ''.join(difflib.unified_diff(source.splitlines(True), rewritten.splitlines(True), 'sealed/dispatcher_check.py', 'review/one-sink-dispatcher_check.py'))
with (REVIEW / 'one-sink-source-delta.patch').open('x') as f:
    f.write(delta)
record = dict(sealedPath=str(SEALED), sealedSha256=EXPECTED, sealedBytes=len(raw),
              soleOldLiteral=old, soleNewLiteral=new, replacementCount=1,
              rewrittenSha256=hashlib.sha256(rewritten.encode()).hexdigest(),
              deltaSha256=hashlib.sha256(delta.encode()).hexdigest(),
              launcherSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              originalFileContextPreserved=True, targetBytesChanged=False,
              preloadNamespacesPersistentDenyUnchanged=True, exclusiveSinkUnchanged=True)
with (REVIEW / 'replay-bindings.json').open('x') as f:
    json.dump(record, f, indent=2); f.write('\n')
exec(compile(rewritten, str(SEALED), 'exec'), {'__file__': str(SEALED), '__name__': '__main__'})

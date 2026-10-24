"""Resume2 corrections only. Writes exclusively this off-tree package."""
from pathlib import Path
import difflib
import hashlib
import json
import re

O = Path(__file__).resolve().parent
OLD = O.parent
ROOT = O.parents[7]
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()
mask = lambda s: re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/', lambda m: ''.join('\n' if c == '\n' else ' ' for c in m[0]), s)
records, rows, full, delta = [], [], [], []
old_manifest = json.loads((OLD / 'manifest.json').read_text())
for row in old_manifest['owned']:
    rel = Path(row['path'])
    previous = (OLD / 'candidates' / rel).read_text()
    actual = (ROOT / rel).read_text() if (ROOT / rel).exists() else ''
    assert sha(actual) == row['preimageSha256'] if actual else row['preimageSha256'] is None
    text = previous
    if rel.stem != 'GuidedBridgeFixture':
        wait_rows = [r for r in json.loads((OLD / 'wait-call-sites.json').read_text()) if r['class'] == rel.stem]
        starts = list(re.finditer(r'org\.awaitility\.Awaitility\.await\(\)', text))
        assert len(starts) == 7
        for number, found in reversed(list(enumerate(starts, 1))):
            start = found.start()
            end = text.index('.isTrue();', text.index('.until(', start)) + len('.isTrue();')
            original = text[start:end]
            alias = re.search(r'\.alias\("([^"]+)"\)', original)[1]
            timeout = re.search(r'\.atMost\(Duration.ofMillis\((\d+)\)\)', original)[1]
            expr = re.search(r'\.until\(\(\) -> ([\s\S]*?)\);', original)[1]
            assert 'assertThat(' + expr + ').isTrue();' in original
            indent = text[text.rfind('\n', 0, start)+1:start]
            name = 'BridgePoll' + str(number)
            replacement = '''{
  long bridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(TIMEOUT);
  class LOCAL {
    Throwable failure;
    boolean terminal;
    boolean slept;
    boolean initialAwaitTick = true;

    boolean step() {
      if (terminal) {
        return true;
      }
      try {
        if (slept && Thread.interrupted()) {
          throw new InterruptedException();
        }
        if (!(!(EXPR)
            && System.nanoTime() < bridgeDeadline)) {
          terminal = true;
          return true;
        }
        if (Thread.interrupted()) {
          throw new InterruptedException();
        }
        slept = true;
        return false;
      } catch (Throwable caught) {
        failure = caught;
        terminal = true;
        return true;
      }
    }
  }
  var bridgePoll = new LOCAL();
  if (!bridgePoll.step()) {
    try {
      org.awaitility.Awaitility.await()
          .alias("ALIAS")
          .pollInSameThread()
          .dontCatchUncaughtExceptions()
          .pollDelay(Duration.ZERO)
          .pollInterval(Duration.ofMillis(25))
          .atMost(Duration.ofNanos(Math.max(1L, bridgeDeadline - System.nanoTime())))
          .until(
              () -> {
                if (bridgePoll.initialAwaitTick) {
                  bridgePoll.initialAwaitTick = false;
                  return false;
                }
                return bridgePoll.step();
              });
    } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
      if (!bridgePoll.terminal) {
        bridgePoll.step();
      }
    }
  }
  if (bridgePoll.failure instanceof Exception exception) {
    throw exception;
  }
  if (bridgePoll.failure instanceof Error error) {
    throw error;
  }
  assertThat(EXPR).isTrue();
}'''.replace('TIMEOUT', timeout).replace('LOCAL', name).replace('EXPR', expr).replace('ALIAS', alias)
            replacement = ('\n'+indent).join(replacement.splitlines())
            text = text[:start] + replacement + text[end:]
            records.append({'id': rel.stem + '-' + str(number), 'path': str(rel), 'classIdentifier': name,
                            'condition': expr, 'timeoutMillis': int(timeout), 'intervalMillis': 25,
                            'originalReviewedBlock': original, 'replacement': replacement,
                            'originalHelperCall': 'await(() -> ' + expr + ', ' + timeout + ');',
                            'oldSha256': sha(original), 'newSha256': sha(replacement),
                            'alias': alias, 'originalSeparateFinalFreshAssertion': 'assertThat(' + expr + ').isTrue();'})
    for folder, content in [('candidates', text), ('preimages', actual), ('reviewed-preimages', previous)]:
        if folder == 'preimages' and not actual:
            continue
        target = O / folder / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    patch = lambda before, after, new=False: ''.join(difflib.unified_diff(before.splitlines(True), after.splitlines(True), fromfile='/dev/null' if new else 'a/'+str(rel), tofile='b/'+str(rel)))
    full.append(patch(actual, text, not actual))
    delta.append(patch(previous, text))
    rows.append({'path': str(rel), 'operation': row['operation'], 'preimageSha256': sha(actual) if actual else None,
                 'reviewedPreimageSha256': sha(previous), 'candidateSha256': sha(text),
                 'actualS011Sha256': sha(actual) if actual else None})
(O / 'candidate.patch').write_text(''.join(full))
(O / 'incremental-from-reviewed.patch').write_text(''.join(delta))
(O / 'loop-edits.json').write_text(json.dumps(sorted(records, key=lambda r:(r['path'], int(r['id'].rsplit('-',1)[1]))), indent=2)+'\n')
(O / 'manifest.json').write_text(json.dumps({'owned': rows, 'sourceApplied': False, 'compileVerified': False,
                                          'runtimeVerified': False, 'patchSha256': sha(''.join(full)),
                                          'incrementalPatchSha256': sha(''.join(delta))}, indent=2)+'\n')
print(json.dumps({'paths': len(rows), 'directWaits': len(records), 'patchSha256': sha(''.join(full))}))

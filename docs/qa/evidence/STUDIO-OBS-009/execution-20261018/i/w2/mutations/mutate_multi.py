#!/usr/bin/env python3
"""Mutation checks under the shared Gradle lock (run via with-gradle-lock.py).

usage: mutate_multi.py <spec.json>
spec: {"label": str, "evid": dir, "edits": [{"file": repo-relative, "old": str, "new": str}], "gradle": [args]}
Each edit must match exactly once. ALWAYS restores every file (sha asserted), then copies the
fresh test XML into <evid>/<label>-xml. Exit code is the restore status, not the Gradle result.
"""
import hashlib, json, shutil, subprocess, sys, time, os
from pathlib import Path

spec = json.loads(Path(sys.argv[1]).read_text())
root = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
evid = Path(spec['evid'])
evid.mkdir(parents=True, exist_ok=True)
originals = {}
for e in spec['edits']:
    p = root / e['file']
    originals.setdefault(e['file'], p.read_bytes())
texts = {f: b.decode() for f, b in originals.items()}
for e in spec['edits']:
    assert texts[e['file']].count(e['old']) == 1, f"{e['file']}: old text count {texts[e['file']].count(e['old'])}"
    texts[e['file']] = texts[e['file']].replace(e['old'], e['new'])
env = dict(os.environ, JAVA_HOME='/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home')
started = time.time()
code = None
try:
    for f, t in texts.items():
        (root / f).write_text(t)
        print(f'[mutate] applied {f}', flush=True)
    with (evid / f"{spec['label']}.log").open('w') as log:
        code = subprocess.run(['./gradlew', *spec['gradle']], cwd=root / 'backend', env=env, stdout=log, stderr=subprocess.STDOUT).returncode
finally:
    ok = True
    for f, b in originals.items():
        (root / f).write_bytes(b)
        same = hashlib.sha256((root / f).read_bytes()).hexdigest() == hashlib.sha256(b).hexdigest()
        ok = ok and same
        print(f'[mutate] restored {f} sha256 {hashlib.sha256(b).hexdigest()} match={same}', flush=True)
xml = evid / f"{spec['label']}-xml"
xml.mkdir(exist_ok=True)
for f in sorted((root / 'backend/build/test-results/test').glob('TEST-*.xml')):
    if f.stat().st_mtime >= started:
        shutil.copy2(f, xml / f.name)
print(f'[mutate] gradle exit {code}', flush=True)
sys.exit(0 if ok else 3)

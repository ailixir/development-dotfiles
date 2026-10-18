#!/usr/bin/env python3
"""W10 mutation checks: apply one source mutation, run the named vitest files, report failed tests, always restore."""
import hashlib, json, os, subprocess, sys

ROOT = '<repo>/studio-runner'
OUT = '<scratch>'
NODE = os.path.expanduser('~/.local/share/fnm/node-versions/v24.20.0/installation/bin')
ENV = dict(os.environ, PATH=NODE + ':' + os.environ['PATH'])

def sha(p):
    return hashlib.sha256(open(p, 'rb').read()).hexdigest()

def run(name, edits, files, fixtures=False):
    backups = {}
    try:
        for rel, old, new in edits:
            p = os.path.join(ROOT, rel)
            if rel not in backups:
                backups[rel] = (open(p).read(), sha(p))
            s = open(p).read()
            assert s.count(old) == 1, (name, rel, s.count(old), old[:60])
            open(p, 'w').write(s.replace(old, new))
        out = os.path.join(OUT, name + '.json')
        cmd = ['./node_modules/.bin/vitest', 'run'] + (['--config', 'vitest.fixtures.config.ts'] if fixtures else []) + files + ['--coverage.enabled=false', '--reporter=json', '--outputFile=' + out]
        if os.path.exists(out): os.remove(out)
        r = subprocess.run(cmd, cwd=ROOT, env=ENV, capture_output=True, text=True)
        failed = []
        try:
            d = json.load(open(out))
            for f in d['testResults']:
                for t in f['assertionResults']:
                    if t['status'] == 'failed':
                        failed.append(t['fullName'])
            summary = (d['numFailedTests'], d['numPassedTests'], d['numTotalTests'])
        except Exception as e:
            summary = ('no-json', str(e), r.stdout[-300:] + r.stderr[-300:])
        return {'name': name, 'exit': r.returncode, 'summary': summary, 'failed': failed}
    finally:
        for rel, (content, h) in backups.items():
            p = os.path.join(ROOT, rel)
            open(p, 'w').write(content)
            assert sha(p) == h, ('RESTORE MISMATCH', rel)

if __name__ == '__main__':
    muts = json.load(open(sys.argv[1]))
    sel = sys.argv[2:]
    results = []
    for m in muts:
        if sel and m['name'] not in sel: continue
        res = run(m['name'], [tuple(e) for e in m['edits']], m['files'], m.get('fixtures', False))
        print(json.dumps(res), flush=True)
        results.append(res)
    json.dump(results, open(os.path.join(OUT, 'results-' + os.path.basename(sys.argv[1])), 'w'), indent=1)

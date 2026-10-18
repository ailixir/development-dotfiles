#!/usr/bin/env python3
"""Serialized coordinator gate; invocation requires an explicit owner freeze."""
from pathlib import Path
import datetime, hashlib, json, os, shutil, subprocess, sys, time, xml.etree.ElementTree as ET, zipfile
root = Path(__file__).resolve().parents[3]
label, *classes = sys.argv[1:]
if not label or not classes or '/' in label or '..' in label:
    raise SystemExit('usage: gate.py isolated-label fully.qualified.Test ...')
archive = root / 'docs/qa/evidence/STUDIO-OBS-007' / label
archive.mkdir(parents=True, exist_ok=False)
def hashes():
    files = [p for p in (root/'backend/src').rglob('*') if p.is_file()]
    files += [p for p in (root/'docs/specs/studio-observed-authoring/contracts/v3').rglob('*') if p.is_file()]
    files += [root/'backend/build.gradle.kts', root/'docs/specs/studio/openapi.yaml']
    if any('GuidedPublicationReplayIT' in name or 'GuidedBridgeIntegration' in name for name in classes):
        for directory in ['studio-runner/src', 'studio-runner/dist', 'studio-runner/scripts', 'studio-runner/fixtures/observed-reference', 'studio-runner/test/fixtures/secret-login']:
            files += [p for p in (root/directory).rglob('*') if p.is_file()]
        files += [root/'studio-runner/package.json',root/'studio-runner/package-lock.json',root/'studio-runner/Dockerfile']
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(set(files))}
before = hashes()
(archive/'source-hashes.json').write_text(json.dumps(before, indent=2)+'\n')
with zipfile.ZipFile(archive/'sources.zip', 'w', zipfile.ZIP_DEFLATED) as snapshot:
    for path in sorted(before):
        snapshot.write(root/path, path)
command = ['./gradlew', 'test', '--rerun-tasks']
for cls in classes:
    command += ['--tests', cls]
env = os.environ.copy()
env['JAVA_HOME'] = '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home'
(archive/'invocation.json').write_text(json.dumps({'command':command,'classes':classes,'JAVA_HOME':env['JAVA_HOME'],'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
started = time.time()
with (archive/'run.log').open('wb') as log:
    run = subprocess.run(command, cwd=root/'backend', env=env, stdout=log, stderr=subprocess.STDOUT)
after=hashes()
drift=[p for p in set(before)|set(after) if before.get(p)!=after.get(p)]
results=[]
for cls in sorted(set(name.rsplit(".", 1)[0] if name.rsplit(".", 1)[-1][0].islower() else name for name in classes)):
    path=root/'backend/build/test-results/test'/('TEST-'+cls+'.xml')
    if not path.exists() or path.stat().st_mtime < started - 1:
        results.append({'class':cls,'missingOrStale':True})
        continue
    shutil.copy2(path,archive/path.name)
    suite=ET.parse(path).getroot()
    results.append({'class':cls, **{key:int(suite.get(key,'0')) for key in ['tests','failures','errors','skipped']}})
result={'scope':'Exact selected current backend gate only; no whole-story QA verdict','gradleExitCode':run.returncode,'sourceDrift':sorted(drift),'results':results,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
for key in ['tests','failures','errors','skipped']:
    result[key]=sum(row.get(key,0) for row in results)
result['pass']=run.returncode==0 and not drift and all(not row.get('missingOrStale') for row in results) and result['failures']==0 and result['errors']==0 and result['skipped']==0
(archive/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
raise SystemExit(0 if result['pass'] else 1)

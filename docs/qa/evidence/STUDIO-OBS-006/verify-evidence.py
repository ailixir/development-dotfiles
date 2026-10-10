#!/usr/bin/env python3
"""Read-only verification of this frozen review; run from repository root."""
from pathlib import Path
import hashlib, json, xml.etree.ElementTree as ET
root = Path(__file__).resolve().parents[4]
evidence = root / 'docs/qa/evidence/STUDIO-OBS-006'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
manifest = json.loads((evidence/'reviewed-source-manifest.json').read_text())
errors=[]
for category in ['source','runtimeSource','frozenDist','backendClasses']:
    for path, expected in manifest[category].items():
        # QA owns the coupled status/results/changelog write after the pre-review snapshot.
        if path == 'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-006.story.md':
            continue
        if not (root/path).is_file() or sha(root/path) != expected:
            errors.append(f'{category}: {path}')
for archive in ['broad-gates-final-pass','joined-attempts/observed-choice-attempt2-pass']:
    location=root/'.aiox/sdc/STUDIO-OBS-006'/archive
    for path, expected in json.loads((location/'hashes.json').read_text()).items():
        if not (location/path).is_file() or sha(location/path)!=expected:
            errors.append(f'{archive}: {path}')
for path, expected in json.loads((evidence/'evidence-hashes.json').read_text()).items():
    if not (evidence/path).is_file() or sha(evidence/path)!=expected:
        errors.append(f'evidence: {path}')
totals={k:0 for k in ['tests','failures','errors','skipped']}
for xml in (evidence/'xml').glob('TEST-*.xml'):
    suite=ET.parse(xml).getroot()
    for key in totals: totals[key]+=int(suite.attrib[key])
assert totals=={'tests':321,'failures':0,'errors':0,'skipped':0}, totals
import importlib.util, sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('substance',evidence/'story-substance.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
proof=json.loads((evidence/'lifecycle-verification.json').read_text())
currentStory=(root/'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-006.story.md').read_text()
if hashlib.sha256(module.substantive(currentStory).encode()).hexdigest()!=proof['storySubstantiveSha256']:
    errors.append('story substance changed outside allowed QA/lifecycle/Change Log sections')
for path,expected in json.loads((evidence/'artifact-provenance.json').read_text()).items():
    if sha(root/path)!=expected: errors.append('review artifact: '+path)
print(json.dumps({'reviewedRevision':manifest['reviewedRevision'],'backend':totals,'storySubstantiveSha256':proof['storySubstantiveSha256'],'mismatches':errors},indent=2))
raise SystemExit(bool(errors))

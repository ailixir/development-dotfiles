"""PREPARED, NOT EXECUTED. Root owns authorization and sandbox seeding after B7."""
import hashlib,json,os,re,shutil,sys
from pathlib import Path

if os.environ.get('OBS011_RT_ROOT_QUIET_WINDOW') != 'B1_TERMINAL_B7_COMPLETE_TREE_OPEN':
    raise SystemExit('Root must verify and declare the B1/B7/tree-open quiet-window gate first')
root=Path(sys.argv[1]).resolve()
sandbox=Path(sys.argv[2]).resolve()
draft=Path(__file__).resolve().parent
if sandbox == root or root in sandbox.parents or sandbox.exists():
    raise SystemExit('Sandbox must be a new path outside the actual repository')
manifest=json.loads((draft/'copy-back-manifest.json').read_text())
start=json.loads((root/'docs/qa/evidence/STUDIO-OBS-011/t0/start-capture.json').read_text())
hashfile=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for row in manifest['paths']:
    if hashfile(root/row['path']) != row['beforeSha256']:
        raise SystemExit('Real source drift: '+row['path'])
    if hashfile(draft/'repo'/row['path']) != row['afterSha256']:
        raise SystemExit('Draft drift: '+row['path'])
for row in manifest['carriedUntouched']:
    if hashfile(root/row['path']) != row['sha256']:
        raise SystemExit('Carried/protected source drift: '+row['path'])
listfile=root/'docs/qa/evidence/STUDIO-OBS-011/t0/early/T0-DEV/sandbox-runner-copy-list.txt'
copy=[]; mkdir=[]
for line in listfile.read_text().splitlines():
    match=re.match(r'^(COPY|MKDIR)\s+(\S+)',line)
    if match: (copy if match[1]=='COPY' else mkdir).append(match[2])
# v5 sandboxT0Note retained conservatively; unit/fixtures do not read this file.
copy.append('backend/src/main/resources/application.yml')
selected=[]
for row in start['files']:
    if any(row['path']==path or row['path'].startswith(path+'/') for path in copy):
        if hashfile(root/row['path']) != row['sha256']:
            raise SystemExit('Seed input differs from S_011: '+row['path'])
        selected.append(row)
# copytree(symlinks=False) dereferences dependency symlinks into copies; no source root is linked.
for destinationName in ['before-repo','repo']:
    destination=sandbox/destinationName
    destination.mkdir(parents=True)
    for path in copy:
        source=root/path; target=destination/path
        target.parent.mkdir(parents=True,exist_ok=True)
        if source.is_dir(): shutil.copytree(source,target,symlinks=False)
        else: shutil.copy2(source,target,follow_symlinks=True)
    for path in mkdir: (destination/path).mkdir(parents=True,exist_ok=True)
for row in manifest['paths']:
    shutil.copy2(draft/'repo'/row['path'],sandbox/'repo'/row['path'])
receipt={'kind':'ROOT_AUTHORIZED_SANDBOX_SEED_NOT_QA','realRepo':str(root),'sandbox':str(sandbox),
 'S011':start['digest'],'copyListSha256':hashfile(listfile),'copies':copy,'emptyDirectories':mkdir,
 'sourceInputsVerifiedBeforeCopy':selected,'activeDraftFiles':manifest['paths'],
 'guardedRetirementsApplied':False,'nodeVersion':'RECORD_IN_COMMAND_RECEIPT'}
(sandbox/'seed-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'sandbox':str(sandbox),'seedReceipt':str(sandbox/'seed-receipt.json')}))

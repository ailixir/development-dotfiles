from pathlib import Path
import sys,json,hashlib,stat
R=Path.cwd();B=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020';O=Path(__file__).resolve().parent;phase=sys.argv[1];assert phase in ['before','after'];dest=O/('public-support-'+phase+'.json');assert not dest.exists()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();public=json.loads((O/'public-context.json').read_text());members={x['path']:x for x in public['members']};contract=json.loads((B/'final-linux-image-preparation03/context-contract.json').read_text());capture=json.loads((O/'preflight-source.json').read_text());source={x['path']:x for x in capture['files']};rows=[]
for mount in contract['inImageReadOnlySupportMounts']:
 root=R/mount['source'];assert not root.is_symlink();files=sorted(root.rglob('*')) if root.is_dir() else [root]
 for p in files:
  s=p.lstat();assert not stat.S_ISLNK(s.st_mode)
  if stat.S_ISDIR(s.st_mode):continue
  assert stat.S_ISREG(s.st_mode);rel=str(p.relative_to(R));h=sha(p);assert h==source[rel]['sha256']
  if rel.startswith('studio-runner/'):
   v=members[rel.removeprefix('studio-runner/')];assert v['kind']=='regular' and h==v['sha256'] and p.stat().st_size==v['bytes'] and stat.S_IMODE(s.st_mode)==v['mode']
  rows.append({'path':rel,'targetMount':mount['target'],'sha256':h,'bytes':p.stat().st_size,'mode':oct(stat.S_IMODE(s.st_mode))})
canon=[];base=contract['packagedSchemas']['sourceOfTruthRoot']
for name in contract['packagedSchemas']['sourceOfTruthFileNamesAtPreparationOnly']:
 p=R/base/name;assert not p.is_symlink() and p.is_file();rel=str(p.relative_to(R));assert sha(p)==source[rel]['sha256'];canon.append({'path':rel,'sha256':sha(p)})
record={'phase':phase,'mountSupportFiles':rows,'canonicalV3Files':canon,'canonicalFileCount':len(canon),'mountsExactlyReviewed':contract['inImageReadOnlySupportMounts'],'allSourceHashesMatchAcceptedA1':True,'allRunnerMountsMatchQualifiedPublicContext':True,'imageOwnNotMounted':contract['imageOwnNotMounted']}
if phase=='after':
 prior=json.loads((O/'public-support-before.json').read_text());assert record['mountSupportFiles']==prior['mountSupportFiles'] and record['canonicalV3Files']==prior['canonicalV3Files']
dest.write_text(json.dumps(record,indent=2)+chr(10));print(json.dumps({'phase':phase,'supportFiles':len(rows),'canonicalV3Files':len(canon),'allExact':True}))

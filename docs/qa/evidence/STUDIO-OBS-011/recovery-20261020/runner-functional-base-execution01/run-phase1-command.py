from pathlib import Path
import os,json,sys,subprocess,datetime,hashlib,runpy,stat,shutil
O=Path(__file__).resolve().parent;R=Path.cwd();P=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-successor-preparation';S=Path('/private/tmp/obs011-rt-functional-base-20261020-root01');E=R/'docs/qa/evidence/STUDIO-OBS-011/execution'
m=runpy.run_path(str(O/'input-snapshot.py'));snapshot=m['snapshot'];sha=m['sha']
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
ids=['ast01','names01','types01','lint01','emit-before01','emit-after01','stamp-before01','stamp-after01','emit-compare01'];key=sys.argv[1];assert key in ids
c=next(c for c in json.loads((P/'commands-successor.json').read_text())['commands'] if c['id']==key);argv=c['argv'];label=argv[2]
assert not (O/(key+'-terminal.json')).exists() and not any(E.glob(label+'*'))
if ids.index(key):
 prev=json.loads((O/(ids[ids.index(key)-1]+'-terminal.json')).read_text());assert prev['outerExit']==0
before={n:snapshot(S/n) for n in ['before-repo','repo']}
if key=='ast01':
 actual=snapshot(R);cat=json.loads((O/'fresh-copy-catalog.json').read_text());assert actual['copyProfileFiles']==cat['files'];assert actual['dist']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210';wj('actual-selected-before-runtime.json',actual)
 binding=json.loads((P/'candidate/copy-back-binding.json').read_text());wanted={r['path']:r for r in binding['paths']};expected=[]
 for r in cat['files']:
  row=dict(r)
  if row['path'] in wanted:row.update(sha256=wanted[row['path']]['afterSha256'],bytes=(S/'repo'/row['path']).stat().st_size)
  expected.append(row)
 assert before['before-repo']['copyProfileFiles']==cat['files'];assert before['repo']['copyProfileFiles']==expected
 for n in before:
  assert not any(p.is_symlink() for p in (S/n).rglob('*'))
  for r in binding['businessPredecessors']+binding['carriedUntouched']:assert sha(S/n/r['path'])==r['sha256']
  carry=json.loads((P/'selftest-carry.json').read_text())
  for r in carry['dependencyAndCanonicalCliIdentity']:
   p=S/n/'studio-runner/node_modules'/r['relativePath'];assert sha(p)==r['actualSha256'] and oct(stat.S_IMODE(p.stat().st_mode))==r['mode']
 wj('private-initial-full-snapshots.json',before)
 baseline=before
else:
 baseline=json.loads((O/'private-initial-full-snapshots.json').read_text())
for n in before:assert before[n]['inputFiles']==baseline[n]['inputFiles'],n
wj(key+'-input-before.json',{n:{'inputDigest':v['inputDigest'],'inputFilesCount':len(v['inputFiles']),'copyProfileDigest':v['copyProfileDigest'],'dist':v['dist']} for n,v in before.items()})
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH']
record={'id':key,'argv':argv,'cwd':str(R),'startedAtUtc':now()}
with (O/(key+'-collector.log')).open('w') as log:
 p=subprocess.Popen(argv,cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT);record['collectorPid']=p.pid;wj(key+'-start.json',record);code=p.wait()
record.update(outerExit=code,endedAtUtc=now());result=json.loads((E/(label+'-results.json')).read_text());record['actualCollectorResult']=result;record['collectorResultSha256']=sha(E/(label+'-results.json'));record['collectorLogSha256']=sha(E/(label+'.log'))
after={n:snapshot(S/n) for n in ['before-repo','repo']}
for n in after:assert after[n]['inputFiles']==before[n]['inputFiles']==baseline[n]['inputFiles'],n
record['privateSourceAndDependencyInputsStable']=True
for k in ['sourceStable','testInputStable','distStable']:assert result[k] is True,(key,k)
assert result['exit']==code
assert result['testInputDigestBefore']==result['testInputDigestAfter']
# The collector snapshots ACTUAL root; private output changes are bound separately.
if not key.startswith(('emit-before','emit-after','stamp-before','stamp-after')):
 for n in after:assert after[n]['dist']==before[n]['dist']
wj(key+'-input-after.json',{n:{'inputDigest':v['inputDigest'],'inputFilesCount':len(v['inputFiles']),'copyProfileDigest':v['copyProfileDigest'],'dist':v['dist']} for n,v in after.items()})
if key in ['emit-before01','emit-after01','stamp-before01','stamp-after01']:
 tree='before-repo' if '-before' in key else 'repo';kind='tsc-only' if key.startswith('emit-') else 'stamped';wj(tree+'-'+kind+'-dist.json',after[tree]['dist'])
 # Archive complete emitted outputs at the actual stage, no private/actual transplantation.
 target=O/('outputs-'+kind)/tree
 for row in after[tree]['dist']['files']:
  src=S/tree/'studio-runner/dist'/row['path'];dest=target/row['path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(src,dest)
if key=='emit-compare01':
 wj('private-terminal-full-snapshots.json',after);actual=snapshot(R);old=json.loads((O/'actual-selected-before-runtime.json').read_text());assert actual==old;wj('actual-selected-after-runtime.json',actual)
record['expectedRawComparisonDifferenceAllowedOnlyForRootDisposition']=key=='emit-compare01';wj(key+'-terminal.json',record)
print(json.dumps({'id':key,'outerExit':code,'childExit':result['exit'],'collectorPid':p.pid,'sourceStable':result['sourceStable'],'testInputStable':result['testInputStable'],'actualDistStable':result['distStable'],'privateInputsStable':True,'privateDist':{n:v['dist']['digest'] for n,v in after.items()}}))
assert code==0 if key!='emit-compare01' else code in [0,1]

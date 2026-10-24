from pathlib import Path
import json,csv,re,hashlib,zipfile
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/it-r-draft');O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/qa/it-r-draft-review')
old=(D/'ReplayIT.original.java').read_text();sites=json.loads((D/'loop-sites.json').read_text());edits=json.loads((D/'poll-edits.json').read_text());mapping={i:(s,e) for s,e in zip(sites,edits) for i in s['ids']};out=[]
for row in csv.DictReader((D/'sleep-table.tsv').open(),delimiter='\t'):
 n=int(row['id']);r={'id':n,'originalLine':int(row['line']),'class':row['class'],'method':row['enclosing_method'],'runtime':'UNEXECUTED','assertedSourcePreservation':'NOT_RUNTIME_EQUIVALENCE'}
 if row['class']=='DELIBERATE':
  assert old.splitlines()[int(row['line'])-1].strip().startswith(row['source_text'].splitlines()[0].strip());r['sourceText']=row['source_text'];r['disposition']='exact original call retained in all candidates'
 else:
  s,e=mapping[n];interval=re.search(r'Thread\.sleep\((\d+)\)',s['source'])[1]
  assert '.pollInterval(Duration.ofMillis('+interval+')).pollDelay(Duration.ZERO)' in e['replacement']
  r.update(kind=s['kind'],condition=s['condition'],intervalMs=int(interval),originalLoopSha256=hashlib.sha256(e['source'].encode()).hexdigest(),deliveredBlockSha256=hashlib.sha256(e['replacement'].encode()).hexdigest(),disposition='static scope only; source findings and runtime gates apply')
  if n in [29,31,32,33]:r['finding']='ITR-WAIT-02,ITR-WAIT-03'
  elif n in [83,86]:r['finding']='ITR-WAIT-01'
  elif n==84:r['finding']='ITR-WAIT-03'
  elif n==5:r['finding']='ITR-WAIT-04'
  elif s['kind']=='while' and not s['condition'].startswith(('System.nanoTime()', 'true')):r['finding']='ITR-WAIT-02 final condition evaluation'
 out.append(r)
x=json.loads((D/'awaitility-source-bytecode.json').read_text());jar=next((Path.home()/'.gradle/caches').rglob('awaitility-4.2.2.jar'))
with zipfile.ZipFile(jar) as z:
 for name,r in x['classes'].items():
  matches=[n for n in z.namelist() if n.endswith('/'+name+'.class')];assert len(matches)==1
  assert hashlib.sha256(z.read(matches[0])).hexdigest()==r['sha256']
(O/'row-review.json').write_text(json.dumps({'rows':out,'actualInstalledLibraryClassesMatch':{k:v['sha256'] for k,v in x['classes'].items()},'duringIntervalInterruptRuntimeProof':'UNPROVED_NO_ITR_PROBE_PREPARED'},indent=2)+'\n')
print(len(out))

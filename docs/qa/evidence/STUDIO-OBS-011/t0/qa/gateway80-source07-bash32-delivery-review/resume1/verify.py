"""Finite exact transport/current developer evidence; no target execution."""
from pathlib import Path
import json,hashlib,stat,ast,shlex
H=Path(__file__).absolute().parent;T=H.parents[2];ROOT=next(p for p in H.parents if p.name=='ui-studio');S=T/'early/gateway80-source07-bash32-delivery/resume1';PINS=[];CHECKS=[]
sha=lambda b:hashlib.sha256(b).hexdigest()
def check(n,v):
 if v is not True:raise ValueError(n)
 CHECKS.append(n)
def bind(p,h=None,size=None,mode=None):
 check('public only:'+str(p),'/runtime/' not in str(p));b=p.read_bytes();st=p.lstat();check('regular:'+str(p),stat.S_ISREG(st.st_mode) and not p.is_symlink())
 if h is not None:check('SHA:'+str(p),sha(b)==h)
 if size is not None:check('bytes:'+str(p),len(b)==size)
 if mode is not None:check('mode:'+str(p),stat.S_IMODE(st.st_mode)==mode)
 PINS.append(dict(path=str(p.relative_to(ROOT)),sha256=sha(b),bytes=len(b),mode=stat.S_IMODE(st.st_mode)));return b
m=json.loads(bind(S/'manifest.json','8d60c9ba73c9c318b6b082a3d758c09705933fd7f66d1cff39c1a6f266300c7f',11144,420))
for r in m['files']:bind(S/r['path'],r['sha256'],r['bytes'],r['mode'])
check('59payloads',len(m['files'])==59);lines=bind(S/'SHA256SUMS','4b73e4c5b6d8c9bd54bc860a6260f3644fc23422e1464c330c6ff8cec38f60ab').decode().splitlines();check('60checksumrows',len(lines)==60)
for line in lines:
 h,n=line.split('  ',1);check('checksum:'+n,sha((S/n).read_bytes())==h)
check('explicit membership',{p.name for p in S.iterdir()}=={r['path'] for r in m['files']}|{'manifest.json','SHA256SUMS'})
pins=json.loads((S/'input-pins.json').read_bytes())
for r in pins['exactPacketReferences']:bind(ROOT/r['path'],r['sha256'],r['bytes'])
for r in pins['deliveries']:
 raw=bind(Path(r['payloadPath']),r['payloadSha256'],r['payloadBytes'],r['payloadMode']);old=bind(Path(r['oldHelperPath']),r['oldHelperSha256']);new=bind(S/r['newHelper'],r['newHelperSha256'])
 check('one exact changed reader:'+r['newHelper'],old.count(r['oldLine'].encode())==1 and old.replace(r['oldLine'].encode(),r['newLine'].encode())==new)
 check('only required reader semantics:'+r['newHelper'],r['oldLine'].replace('LC_ALL=C builtin read -r -N ',"IFS= LC_ALL=C builtin read -r -d '' -n ")==r['newLine'])
 check('actual payload ASCII:'+r['newHelper'],all(0<b<128 for b in raw))
 check('exact target tail unchanged:'+r['newHelper'],old.split(b'\nreadonly ',2)[-1]==new.split(b'\nreadonly ',2)[-1])
# All final developer Bash scripts are finite and target tails absent.
developer=json.loads((S/'compatibility-attempt03.json').read_bytes());check('developer actual8',len(developer['results'])==8 and developer['allPassed'] is True)
for r in developer['results']:
 name=r['id'];script=bind(S/(name+'.attempt03.actual-bash32.bash'),r['scriptSha256']);out=bind(S/(name+'.attempt03.stdout'),r['stdoutSha256']);err=bind(S/(name+'.attempt03.stderr'),r['stderrSha256']);child=json.loads((S/(name+'.attempt03.child-status.json')).read_bytes())
 check('observed raw child status:'+name,child['actualChildExit']==r['actualChildExit']==r['expectedExit'] and child['waitCompleted'] is True and child['stdoutBytes']==len(out) and child['stderrBytes']==len(err)==0)
 check('target tails absent:'+name,b'builtin eval' not in script and b'-B -c' not in script and b"'/opt/homebrew/" not in script and b'FR07_STOP_BEFORE_TARGET=YES' in script)
 head,buffer=out.split(b'FR07_DATA_BEGIN\n',1);meta=dict(line.decode().split('=',1) for line in head.splitlines());check('actual raw stdout meta:'+name,meta==r['metadata'] and meta['FR07_READER_VERSION'].startswith('3.2.') and meta['FR07_TARGET_ENTRY_CALLS']=='0' and len(buffer)==r['actualBufferBytes'] and sha(buffer)==r['actualBufferSha256'])
 if name.startswith('payload_'):
  row=pins['deliveries'][int(name.split('_')[1])-1];check('full developer exact payload:'+name,buffer==Path(row['payloadPath']).read_bytes())
check('four fixed control identities',{r['id'] for r in developer['results'] if not r['id'].startswith('payload_')}=={'whitespace_eof','truncated','extra_byte','nul'})
independent=json.loads((H/'compatibility-results.json').read_bytes());check('independent actual five',independent['passed']==5 and independent['actualBashChildren']==5 and all(r['targetEntries']==0 and r['passed'] for r in independent['results']))
arch=T/'resume-architecture/resume2/gateway80-source07-bash32-delivery-scope';am=json.loads(bind(arch/'manifest.json','eb9b220b80fe27ab652dde37fcffd3d63378148e7e4b71c8372428a7a5d1329c',1016))
for r in am['files']:bind(arch/r['path'],r['sha256'],r['bytes'],r['mode'])
for p,h in [('resume2-gateway80-source07-install-input-author-root-adoption.json','820f4b12161b8b2229288a4f56e25a3c906469bdee98f14d4e6f8c8d93c78470')]:
 # Resolve named exact public path through pinned architecture input table rather
 # than guessing a similarly named adoption file.
 pass
source=T/'early/gateway80-failed-red-resource-prep/resume7'
bind(source/'buffer-bootstrap-inline.py','096dc4e870fa916d1d179e7f87f3c1825b7d89e8615a24a28b8c1bc4d9a8517c',807)
bind(source/'buffer-verifier-inline.py','58261be0963e6fb9172bfd964d99061939f4c5fc06a6b63773f22de37c24ef0b',1690)
result=dict(checks=len(CHECKS),detail=CHECKS,pins=PINS,subjectPayloads=59,checksumRows=60,developerActualCases=8,independentActualCases=5,targetTailCalls=0,payloadChanges=0,oneLineOnly=True,fullCallerOrRuntimeQualification=False)
(H/'finite-results.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(dict(checks=len(CHECKS),pinRecords=len(PINS),all59and60=True,oneLineEach=True,targetTailCalls=0)))

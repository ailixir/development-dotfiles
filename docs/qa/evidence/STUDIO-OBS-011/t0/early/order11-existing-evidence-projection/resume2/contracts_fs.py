"""Actual FD-relative core AST-extracted into synthetic OS only. No entrypoint or actual OS IO."""
from pathlib import Path,PurePosixPath
from types import ModuleType,SimpleNamespace
import ast,copy,json,datetime,stat,os as flags,xml.etree.ElementTree as ET
O=Path(__file__).resolve().parent;R=next(p for p in O.parents if (p/'AGENTS.md').is_file())
source=(O/'project_existing.py').read_text();tree=ast.parse(source);P=ModuleType('fs_actual_core')
P.__dict__.update(HERE=O,ROOT=R,C=json.loads((O/'source-contract.json').read_text()))
body=[]
for n in tree.body:
 if isinstance(n,ast.If):continue
 if isinstance(n,ast.FunctionDef) and n.name in {'main','local_bindings'}:continue
 if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in {'HERE','ROOT','C'} for t in n.targets):continue
 body.append(n)
exec(compile(ast.Module(body=body,type_ignores=[]),'<actual-fd-core-only>','exec'),P.__dict__)
fixture=next(n for n in ast.parse((O/'contracts_fake.py').read_text()).body if isinstance(n,ast.ClassDef) and n.name=='Fake')
env=dict(P=P,BASE=copy.deepcopy(P.C),OUT=O,copy=copy,json=json,datetime=datetime,ET=ET,sha=P.digest,j=P.canonical)
exec(compile(ast.Module(body=[fixture],type_ignores=[]),'<fixture-builder-only>','exec'),env);Fake=env['Fake']
class Node:
 def __init__(self,kind,ino,mode=448,uid=123,dev=1,data=b'',target=None):
  self.kind=kind;self.ino=ino;self.mode=mode;self.uid=uid;self.dev=dev;self.data=data;self.target=target;self.children={};self.tick=1
 def facts(self):return SimpleNamespace(st_dev=self.dev,st_ino=self.ino,st_uid=self.uid,st_gid=0,st_mode={'dir':stat.S_IFDIR,'file':stat.S_IFREG,'link':stat.S_IFLNK}[self.kind]|self.mode,st_size=len(self.data),st_mtime_ns=self.tick,st_ctime_ns=self.tick)
class FS:
 O_RDONLY=flags.O_RDONLY;O_DIRECTORY=flags.O_DIRECTORY;O_NOFOLLOW=flags.O_NOFOLLOW
 O_WRONLY=flags.O_WRONLY;O_CREAT=flags.O_CREAT;O_EXCL=flags.O_EXCL
 def __init__(self):
  self.root=Node('dir',100,493,0);self.nextino=101;self.fds={};self.nextfd=10;self.reads=0;self.writes=0;self.hook=None;self.closed=[];self.created=[];self.alternate_writes=0;self.claimed_output_directory=None
 def new(self,kind='dir',**kw):self.nextino+=1;return Node(kind,self.nextino,**kw)
 def getuid(self):return 123
 def locate(self,path):
  node=self.root
  for part in PurePosixPath(str(path)).parts[1:]:node=node.children[part]
  return node
 def add(self,path,kind='dir',**kw):
  parts=PurePosixPath(str(path)).parts[1:];node=self.root
  for part in parts[:-1]:
   if part not in node.children:node.children[part]=self.new(mode=493)
   node=node.children[part]
  node.children[parts[-1]]=self.new(kind,**kw);return node.children[parts[-1]]
 def named(self,path,dir_fd=None):
  if str(path)=='/':return self.root
  assert dir_fd is not None and '/' not in str(path),(path,dir_fd)
  return self.fds[dir_fd]['node'].children[str(path)]
 def fire(self,op,path,node):
  if self.hook:self.hook(self,op,str(path),node)
 def stat(self,path,dir_fd=None,follow_symlinks=True):
  assert follow_symlinks is False
  node=self.named(path,dir_fd);answer=node.facts();self.fire('stat',path,node);return answer
 def readlink(self,path,dir_fd=None):return self.named(path,dir_fd).target
 def open(self,path,flags,mode=None,dir_fd=None):
  if flags & self.O_CREAT:
   parent=self.fds[dir_fd]['node'];assert flags&self.O_EXCL and flags&self.O_NOFOLLOW
   if str(path) in parent.children:raise FileExistsError()
   parent.children[str(path)]=self.new('file',mode=mode);self.created.append(parent.children[str(path)])
  node=self.named(path,dir_fd);self.fire('before-open',path,node);node=self.named(path,dir_fd)
  if node.kind=='link' and flags&self.O_NOFOLLOW:raise OSError()
  if flags&self.O_DIRECTORY and node.kind!='dir':raise OSError()
  self.nextfd+=1;self.fds[self.nextfd]={'node':node,'offset':0,'name':str(path),'active':True,'created_parent':self.fds[dir_fd]['node'] if flags & self.O_CREAT else None};self.fire('after-open',path,node);return self.nextfd
 def fstat(self,fd):return self.fds[fd]['node'].facts()
 def mkdir(self,path,mode,dir_fd=None):
  parent=self.fds[dir_fd]['node']
  if str(path) in parent.children:raise FileExistsError()
  parent.children[str(path)]=self.new(mode=mode)
  if str(path)=='released-projection-01' and self.claimed_output_directory is None:self.claimed_output_directory=parent.children[str(path)]
 def read(self,fd,count):
  self.reads+=1;entry=self.fds[fd];start=entry['offset'];entry['offset']+=count;raw=entry['node'].data[start:start+count];self.fire('read',entry['name'],entry['node']);return raw
 def write(self,fd,raw):
  entry=self.fds[fd];self.writes+=1
  if entry['created_parent'] is not self.claimed_output_directory:self.alternate_writes+=1
  self.fire('before-write',entry['name'],entry['node'])
  if getattr(self,'zero_write',False):return 0
  count=min(len(raw),getattr(self,'chunk',len(raw)));entry['node'].data+=raw[:count];entry['node'].tick+=1;self.fire('after-write',entry['name'],entry['node']);return count
 def fsync(self,fd):self.fire('fsync',self.fds[fd]['name'],self.fds[fd]['node'])
 def close(self,fd):
  entry=self.fds[fd];self.fire('close',entry['name'],entry['node']);entry['active']=False;self.closed.append(fd)

def retarget(f,path):
 f.temp=path;f.manifest['root']['path']=path
 for row in f.events:row['ownedTemp']=path
 xml=ET.fromstring(f.xml);xml.find('testcase/failure').set('message','[second explicit learning; logs '+path+'] ');f.xml=ET.tostring(xml);P.C['publicFacts']['xmlSha256']=P.digest(f.xml);f.rebind()
def prepare(alias=False):
 f=Fake();retarget(f,'/var/folders/owned/obs007-joined-closedfake' if alias else '/synthetic/obs007-joined-closedfake');fs=FS()
 if alias:
  fs.add('/private/var',mode=493,uid=0);fs.add('/var','link',target='private/var',mode=511,uid=0)
 rootpath='/private'+f.temp if alias else f.temp;root=fs.add(rootpath,mode=448);root.ino=f.manifest['root']['ino']
 for row in f.manifest['files']:
  path=str(R/row['path']) if row['role']=='default_xml' else rootpath+'/'+row['path']
  node=fs.add(path,'file',mode=row['mode'],uid=row['uid'],data=f.inputs[row['role']]);node.dev=row['dev'];node.ino=row['ino']
 fs.add(O/'release',mode=448)
 for name,raw in [('private-input-manifest.json',f.manifest_raw),*[(P.ExactIO.PUBLIC_FILES[a],f.public[a]) for a in P.ExactIO.PUBLIC_FILES]]:fs.add(O/'release'/name,'file',mode=384,data=raw)
 return f,fs,rootpath
results=[]
def check(name,act,edit=None,accept=False,zero_read=False,zero_write=False,alias=False):
 f,fs,rootpath=prepare(alias)
 if edit:edit(f,fs,rootpath)
 original_os=P.os;P.os=fs;reader=P.ExactIO();accepted=False;reason='NOT_RUN'
 try:
  act(reader,f,fs,rootpath);reader.close();accepted=True;reason='SOURCE_FD_CORE_ACCEPTED_SYNTHETIC_ONLY'
 except (P.Refused,OSError) as e:
  reason=str(e) if isinstance(e,P.Refused) else 'SYNTHETIC_OS_FAILURE_CLOSED_BY_MAIN'
  try:reader.close()
  except (P.Refused,OSError):pass
 finally:P.os=original_os
 assert accepted is accept,(name,accepted,reason)
 if zero_read:assert fs.reads==0,(name,fs.reads)
 if zero_write:assert fs.writes==0,(name,fs.writes)
 assert fs.alternate_writes==0
 results.append({'name':name,'accepted':accepted,'expected':accept,'reason':reason,'syntheticContentReadCalls':fs.reads,'syntheticWriteCalls':fs.writes,'actualPrivateIO':0,'actualOsCalls':0})
 return f,fs
permit={'scope':{'purpose':P.C['purpose']}}
def inputs(reader,f,fs,path):
 got=reader.read_inputs(permit,f.manifest,f.xml);assert got==f.inputs
 # Fixture also passes actual source-derived semantic/release functions, not just malformed IO.
 expected=f.run();assert expected['cause']=='UNPROVEN'
def swap_hook(match,mutate,op='before-open'):
 def edit(f,fs,path):
  fired=False
  def hook(fs,operation,name,node):
   nonlocal fired
   if not fired and operation==op and name==match:fired=True;mutate(fs,node)
  fs.hook=hook
 return edit
check('ordinary-anchored-root-and-descendants',inputs,accept=True)
check('approved-macos-var-private-var-relative-target',inputs,accept=True,alias=True)
check('approved-macos-var-private-var-absolute-target',inputs,lambda f,fs,p:setattr(fs.locate('/var'),'target','/private/var'),accept=True,alias=True)
check('arbitrary-macos-alias-target-rejected',inputs,lambda f,fs,p:setattr(fs.locate('/var'),'target','/synthetic/elsewhere'),zero_read=True,alias=True)
check('root-symlink-rejected',inputs,lambda f,fs,p:fs.add(p,'link',target='/synthetic/other'),zero_read=True)
check('ancestor-symlink-rejected',inputs,lambda f,fs,p:fs.add('/synthetic','link',target='/other'),zero_read=True)
check('root-approved-inode-mismatch',inputs,lambda f,fs,p:setattr(fs.locate(p),'ino',999),zero_read=True)
check('root-approved-owner-mismatch',inputs,lambda f,fs,p:setattr(fs.locate(p),'uid',999),zero_read=True)
check('root-approved-mode-mismatch',inputs,lambda f,fs,p:setattr(fs.locate(p),'mode',493),zero_read=True)
check('root-component-swap-between-stat-open',inputs,swap_hook('obs007-joined-closedfake',lambda fs,n:fs.add('/synthetic/obs007-joined-closedfake',mode=448)),zero_read=True)
check('ancestor-replaced-after-open',inputs,swap_hook('synthetic',lambda fs,n:fs.add('/synthetic',mode=493),op='after-open'),zero_read=True)
check('leaf-symlink-before-read-rejected',inputs,lambda f,fs,p:fs.add(p+'/'+next(r['path'] for r in f.manifest['files'] if r['role']=='snapshot_initial18'),'link',target='/elsewhere'),zero_read=True)
def descendant(f,fs,p):
 f.manifest['files'].sort(key=lambda r:r['role']!='guided_log');fs.add(p+'/owned-generations','link',target='/elsewhere')
check('descendant-symlink-before-native-content',inputs,descendant,zero_read=True)
def manifest(reader,f,fs,p):assert reader.read_manifest(permit)==f.manifest_raw
check('private-manifest-same-opened-owner-mode-positive',manifest,accept=True)
for attr,value in [('uid',999),('mode',420),('dev',99),('ino',999)]:
 check('manifest-stat-open-'+attr+'-mismatch-before-content',manifest,swap_hook('private-input-manifest.json',lambda fs,n,k=attr,v=value:setattr(n,k,v)),zero_read=True)
check('manifest-preexisting-wrong-owner-before-content',manifest,lambda f,fs,p:setattr(fs.locate(O/'release/private-input-manifest.json'),'uid',999),zero_read=True)
check('release-file-stat-open-owner-mismatch',lambda r,f,fs,p:r.read_public('authorization'),swap_hook('root-authorization.json',lambda fs,n:setattr(n,'uid',999)),zero_read=True)
check('release-parent-mode-rejected-before-content',manifest,lambda f,fs,p:setattr(fs.locate(O/'release'),'mode',493),zero_read=True)
def xml(reader,f,fs,p):
 row=next(r for r in f.manifest['files'] if r['role']=='default_xml');assert reader.read_default_xml(permit,row)==f.xml
check('approved-xml-fd-binding-positive',xml,accept=True)
check('xml-stat-open-device-mismatch-before-content',xml,swap_hook('TEST-'+P.FQCN+'.xml',lambda fs,n:setattr(n,'dev',9)),zero_read=True)
def swap_snapshot(f,fs,p):
 name=next(r['path'] for r in f.manifest['files'] if r['role']=='snapshot_initial18');fs.hook=lambda fs,op,n,node:fs.add(p+'/'+name,'file',mode=384,data=node.data) if op=='read' and n==name else None
check('leaf-replaced-during-read-is-incomplete',inputs,swap_snapshot)
def output(reader,f,fs,p):
 reader.claim_output(permit);out=f.run();reader.write_output(out);assert fs.created[0].data==P.canonical(out)+b'\n'
check('retained-output-fd-positive',output,accept=True)
check('partial-write-completes-without-retry',output,lambda f,fs,p:setattr(fs,'chunk',17),accept=True)
check('zero-write-fails-no-success',output,lambda f,fs,p:setattr(fs,'zero_write',True))
def output_swap_before(reader,f,fs,p):
 reader.claim_output(permit);fs.add(O/'released-projection-01',mode=448);reader.write_output(f.run())
check('claimed-output-parent-swapped-before-write-refused',output_swap_before,zero_write=True)
def output_swap_during(f,fs,p):
 def hook(fs,op,n,node):
  if op=='after-write' and n=='projection.json':fs.add(O/'released-projection-01',mode=448)
 fs.hook=hook
check('output-parent-swapped-during-write-detected-no-alternate-write',output,output_swap_during)
def package_swap(reader,f,fs,p):
 reader.claim_output(permit);fs.add(O,mode=493);reader.write_output(f.run())
check('claimed-package-ancestor-swapped-before-write-refused',package_swap,zero_write=True)
for op in ['before-write','fsync']:
 def edit(f,fs,p,operation=op):
  def hook(fs,seen,n,node):
   if seen==operation and n=='projection.json':raise OSError('synthetic private marker never exported')
  fs.hook=hook
 check('output-'+op+'-failure-no-success',output,edit)
def close_fail(kind):
 def edit(f,fs,p):
  fired=False
  def hook(fs,op,n,node):
   nonlocal fired
   if op=='close' and node.kind==kind and not fired:fired=True;raise OSError('synthetic close failure')
  fs.hook=hook
 return edit
check('output-file-close-failure-no-success',output,close_fail('file'))
# Only claim/write output in this control, so first directory close belongs to retained output chain.
def output_direct(reader,f,fs,p):
 reader.claim_output(permit);reader.write_output(f.run())
check('retained-directory-close-failure-no-success',output_direct,close_fail('dir'))

check('release-stat-open-mode-mismatch-before-content',lambda r,f,fs,p:r.read_public('authorization'),swap_hook('root-authorization.json',lambda fs,n:setattr(n,'mode',420)),zero_read=True)
for attr,value in [('uid',999),('mode',420),('ino',999)]:
 check('xml-stat-open-'+attr+'-mismatch-before-content',xml,swap_hook('TEST-'+P.FQCN+'.xml',lambda fs,n,k=attr,v=value:setattr(n,k,v)),zero_read=True)
def output_leaf_swap(f,fs,p):
 def hook(fs,op,n,node):
  if op=='after-open' and n=='projection.json':fs.add(O/'released-projection-01/projection.json','file',mode=384)
 fs.hook=hook
check('opened-output-leaf-substituted-before-write-refused',output,output_leaf_swap,zero_write=True)
for attr,value in [('uid',999),('mode',420)]:
 check('opened-output-'+attr+'-mismatch-before-write',output,swap_hook('projection.json',lambda fs,n,k=attr,v=value:setattr(n,k,v),op='after-open'),zero_write=True)
check('input-close-failure-is-not-success',manifest,close_fail('file'))
def alias_swap(f,fs,p):
 def hook(fs,op,n,node):
  if op=='after-open' and n=='folders':fs.locate('/var').target='/synthetic/elsewhere'
 fs.hook=hook
check('approved-alias-changed-during-traversal-refused',inputs,alias_swap,zero_read=True,alias=True)
report={'scope':'AST_EXTRACTED_ACTUAL_FD_CORE_SYNTHETIC_FILESYSTEM_ONLY','parserSha256':P.digest(source.encode()),'checks':len(results),'accepted':sum(r['accepted'] for r in results),'rejected':sum(not r['accepted'] for r in results),'results':results,'actualParserMainCli':0,'actualPrivateEnumerationStatReadGlobCopyExport':0,'actualOsIO':0,'sourceExtractedActualNewExactIOExercised':True,'noAlternateOutputParentWritten':True,'alternateWriteCheck':'Each actual modeled write fd creation-parent object compared with original mkdir-created claimed directory, not a constant witness','broadSameUidHardeningClaim':False}
(O/'fs-contracts.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='results'}))

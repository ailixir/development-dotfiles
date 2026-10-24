"""Actual parent Custody acquisition + Relay.start/stop + main-finally counterexample.

Every FD/path/thread/process boundary is fake. No actual target main/library boundary runs.
"""
from pathlib import Path
import ast,builtins,copy,ctypes,datetime,fcntl,hashlib,io,json,math,os,re,selectors,socket,stat,struct,subprocess,sys,threading,time,types
from contextlib import ExitStack
from unittest.mock import patch
D=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/c8-check01-public-evidence-prep/resume5').absolute();O=Path(__file__).absolute().parent
rawa=(D/'public_observation_unit.py').read_bytes();rawr=(D/'public_relay.py').read_bytes()
A={'__name__':'_inactive05_actual_adapter','__file__':'<source-only>'};R=types.ModuleType('_inactive05_actual_relay')
exec(compile(rawa,'<inactive05 adapter definitions>','exec'),A);exec(compile(rawr,'<inactive05 relay definitions>','exec'),R.__dict__)
checks=[];cases=[];blocked_calls=[]
def check(name,ok):
 if ok is not True:raise AssertionError(name)
 checks.append({'name':name,'pass':True})
def blocked(*args,**kwargs):blocked_calls.append('FORBIDDEN_REAL_BOUNDARY');raise AssertionError('FORBIDDEN_REAL_BOUNDARY')
def audit(event,args):
 if event=='open':
  name,mode,flags=args;writing=(isinstance(mode,str) and any(c in mode for c in 'wax+')) or flags&(os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC)
  if not(type(name) is str and name==str(O/'partial-acquisition-checks.json') and writing):raise AssertionError('FORBIDDEN_OPEN')
 if event.startswith(('subprocess.','socket.','ctypes.','os.exec','os.spawn','os.fork','os.kill','os.system')):raise AssertionError('FORBIDDEN_'+event)
class Event:
 def set(self):pass
 def wait(self,seconds):return True
 def is_set(self):return False
class FakeCustody:
 def __init__(self,key):self.chain=[(None,'/',1,key)];self.closed=False;self.nodes={}
 def check(self):pass
 def members(self):return []
 def close(self):self.closed=True
 def absent(self,name):return name not in self.nodes
class API:
 def __init__(self,case):self.case=case;self.nextfd=100;self.opened=set();self.closed=[];self.close_attempts=[];self.child=None
 def info(self,fd):return types.SimpleNamespace(st_dev=1,st_ino=fd,st_mode=stat.S_IFDIR|0o755,st_uid=501)
 def open(self,path,flags,dir_fd=None):self.nextfd+=1;self.opened.add(self.nextfd);return self.nextfd
 def fstat(self,fd):
  if self.case=='post-open-identity-failure' and fd==101:raise OSError('SYNTHETIC_FSTAT_UNKNOWN')
  return self.info(fd)
 def stat(self,path,dir_fd=None,follow_symlinks=False):
  if path=='/':return self.info(101)
  if path=='private':return self.info(102)
  if path=='tmp':
   if self.case=='constructor-close-failure':return self.info(999)
   return self.info(103)
  if path=='obs011-pub-observe01' and self.child is not None:return self.child
  raise FileNotFoundError(path)
 def getuid(self):return 501
 def close(self,fd):
  self.close_attempts.append(fd)
  if self.case=='constructor-close-failure' and fd==103:raise OSError('SYNTHETIC_CLOSE_UNKNOWN')
  self.opened.remove(fd);self.closed.append(fd)
def run():
 for kind in ('clean-parent-acquisition','post-open-identity-failure','constructor-close-failure'):
  api=API(kind);key=(1,7,stat.S_IFDIR|0o700,501);output=FakeCustody(key);short=FakeCustody(key)
  root=dict(ownerUid=501,outputChain=[list(key)],shortParentChain=[[1,n,stat.S_IFDIR|0o755,501] for n in (101,102,103)],createShortExactly0700=True)
  failed_objects=[]
  def custody(path,mode=None):
   if str(path)==R.SHORT:return short
   # Actual constructor. Assignment into Relay.parent happens only after success.
   return A['Custody'](path,mode,api)
  class Boundary:
   def uid(self):return 501
   def event(self):return Event()
   def mkdir_at(self,c,name):api.child=types.SimpleNamespace(st_dev=1,st_ino=42,st_mode=stat.S_IFDIR|0o700,st_uid=501)
   def thread(self,callback):
    class Thread:
     def start(self):relay.result['ready']=True
     def join(self,seconds):pass
     def is_alive(self):return False
    return Thread()
  control=dict(schemaVersion=1,protocolVersion=2,unit='u',**{'class':'c','method':'m'},amendedPlanManifestSha256='d9130ec418878668b4309e8e523032565a363f1fcf0c712000c08e9a397f6a8e',loopback='127.0.0.1',tlsHost='localhost',relayPath=R.ENDPOINT,enrollmentNonce='a'*64,**R.LIMITS)
  relay=R.Relay(Boundary(),custody,output,control,'b'*64,{},types.SimpleNamespace(CONSTANTS={'unit':'u','class':'c','method':'m'}),lambda raw:hashlib.sha256(raw).hexdigest(),lambda raw:{},lambda pid:{},root)
  e=A['Effects'].__new__(A['Effects']);e.relay=relay;e.c=FakeCustody(key);e.unit=output;e.gaps={};e.client={'pid':500,'start':'FAKE_START','identityComplete':True};e.a={'releaseSha256':'a'*64};e.registration_complete=True;e.custody_retained=False;e.records=[]
  def write_once(name,value):e.records.append((name,copy.deepcopy(value)));e.c.nodes[name]=value
  e.write_once=write_once;e.register=lambda mode:None;e.sys=types.SimpleNamespace(stdin_devnull=lambda:True,cwd=lambda:str(A['ROOT']))
  start_failed=False
  def operate(effects,mode,arg):
   nonlocal start_failed
   try:relay.start()
   except (R.RelayHold,A['Hold'],OSError):start_failed=True
   effects.stop_relay();return 1
  with patch.dict(A,{'__file__':str(A['CONTROL']/'public_observation_unit.py'),'load':lambda *args:e,'operate':operate}):
   try:status=A['main'](['selected','a'*64,'entry-0001-pins.json','b'*64],e.sys);held=False
   except A['Hold']:status=1;held=True
  receipt=next(v['receipt'] for n,v in e.records if n=='relay-drain.json')
  leaked=bool(api.opened)
  check('actual fake acquisition matches failure class '+kind,leaked==(kind!='clean-parent-acquisition'))
  check('actual main source behavior '+kind,status==1 and held is False and e.c.closed and output.closed and not any(x is e for x in A['RETAINED_EFFECTS']))
  check('canonical and published closure claim '+kind,relay.result['descriptorsClosed'] is True and receipt['descriptorsClosed'] is True and receipt['threadTerminated'] is True)
  if kind!='clean-parent-acquisition':check('failed actual constructor not assigned into relay '+kind,start_failed and relay.parent is None and relay.thread is None)
  cases.append({'case':kind,'actualMainStatus':status,'startRejected':start_failed,'relayParentAssigned':relay.parent is not None,'fakeOpenedFdsRemaining':sorted(api.opened),'fakeCloseAttempts':api.close_attempts,'canonicalDescriptorsClosed':relay.result['descriptorsClosed'],'publishedDescriptorsClosed':receipt['descriptorsClosed'],'mainControlClosed':e.c.closed,'mainOutputClosed':output.closed,'effectsRetained':any(x is e for x in A['RETAINED_EFFECTS']),'actualRuntimeActions':0})
sys.addaudithook(audit)
with ExitStack() as stack:
 for obj,names in ((builtins,('open',)),(io,('open',)),(Path,('open','read_bytes','read_text','write_text','stat','lstat','mkdir','iterdir','resolve','unlink')),(os,('open','read','write','close','fstat','stat','lstat','listdir','mkdir','unlink','fsync','kill','fork','system','getpid','getppid','getuid')),(subprocess,('Popen','run','call','check_output','check_call')),(socket,('socket','create_connection')),(selectors,('DefaultSelector',)),(threading,('Thread','Event','Lock')),(ctypes,('CDLL',)),(fcntl,('flock','fcntl','ioctl')),(time,('time','sleep','monotonic_ns'))):
  for n in names:
   if hasattr(obj,n):stack.enter_context(patch.object(obj,n,blocked))
 run();check('zero real boundary calls',blocked_calls==[])
result={'checks':checks,'count':len(checks),'cases':cases,'mandatoryCustodyCounterexample':True,'actualActions':0,'blockedRealCalls':blocked_calls}
(O/'partial-acquisition-checks.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'checks':len(checks),'pairedCases':len(cases),'counterexamples':2,'actualActions':0}))

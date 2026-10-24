from pathlib import Path
import os,subprocess,json,hashlib,fcntl,errno,datetime
D=Path(__file__).resolve().parent
R=D.parents[6]
ps=lambda p,c: subprocess.check_output(['/bin/ps','-ww','-p',str(p),'-o',c+'='],text=True).strip()
shell=os.getppid();wrapper=int(ps(shell,'ppid'))
cmd=ps(wrapper,'command');assert 'with-gradle-lock.py /bin/bash --noprofile --norc -i' in cmd
lock=R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/gradle.lock'
assert hashlib.sha256(lock.with_name('with-gradle-lock.py').read_bytes()).hexdigest()=='2846314e3ab12926bff6eb458d7058c406b983092fb40b1fb5c2fa087c2366df'
fd=os.open(lock,os.O_RDONLY|os.O_NOFOLLOW);st=os.fstat(fd)
try:
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
except OSError as e:
 assert e.errno in (errno.EAGAIN,errno.EACCES)
else:
 fcntl.flock(fd,fcntl.LOCK_UN);raise RuntimeError('LOCK_NOT_HELD')
os.close(fd)
x={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'wrapperPid':wrapper,'wrapperStart':ps(wrapper,'lstart'),'wrapperArgvSha256':hashlib.sha256(cmd.encode()).hexdigest(),'shellPid':shell,'shellStart':ps(shell,'lstart'),'lockDevInode':[st.st_dev,st.st_ino],'kernelExclusiveLockObserved':True,'toolSession':29335,'sourceWriterScope':'READONLY post-unlock incident reconciliation; NO source or native writer'}
with (D/'reconciliation-active-lock.json').open('x') as f:json.dump(x,f,indent=2);f.write('\n')
print(json.dumps(x))

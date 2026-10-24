import subprocess,time,datetime,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[5]
t0=root/'docs/qa/evidence/STUDIO-OBS-011/t0'
while True:
 status=(t0/'status.txt').read_text()
 result=root/'docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-results.json'
 ps=subprocess.run(['ps','-p','88144,88167,88182','-o','pid,ppid,lstart,etime,command'],capture_output=True,text=True)
 state={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'ps':ps.stdout,'b1Done':'B1-DONE' in status,'resultExists':result.exists()}
 (t0/'resume2-b1-watch.json').write_text(json.dumps(state,indent=2)+'\n')
 if state['b1Done'] and state['resultExists']:
  print('B1 terminal marker and collector result present; root must inspect before frontend launch',flush=True)
  sys.exit(0)
 if 'run-backend-tasked.py obs011-t0-baseline-check01' not in ps.stdout and 'GradleWrapperMain --continue check --rerun-tasks --no-daemon' not in ps.stdout:
  print('Original backend handles missing; inspect collector/entry-script completion, never infer green',flush=True)
  sys.exit(2)
 print(state['at']+' B1 confirmed live; terminal receipt absent',flush=True)
 time.sleep(20)

"""Read-only polling of the one already-running diagnostic; never starts/restores/signals it."""
from pathlib import Path
import json,datetime,subprocess,time,hashlib
BASE=Path.cwd()/'docs/qa/evidence/STUDIO-OBS-011/t0'
OUT=BASE/'qa/diag-start1-terminal'
receipt=BASE/'early/diag-start1-harness/resume2/runs/obs011-diag-start1-full01/receipt.json'
expected={48509:'Sun Oct 18 22:41:26 2026',48510:'Sun Oct 18 22:41:26 2026',50004:'Sun Oct 18 22:41:40 2026'}
while True:
    r=json.loads(receipt.read_text())
    raw=subprocess.run(['ps','-p',','.join(map(str,expected)),'-o','pid=,ppid=,lstart=,stat=,command='],capture_output=True,text=True).stdout
    ps=[]
    for line in raw.splitlines():
        fields=line.split(None,8)
        pid=int(fields[0]);start=' '.join(fields[2:7]);command=fields[8]
        ps.append({'pid':pid,'ppid':int(fields[1]),'start':start,'sameExpectedStart':start==expected[pid],'state':fields[7],'commandSha256':hashlib.sha256(command.encode()).hexdigest()})
    record={'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':r.get('status'),'lastPhase':r.get('phases',[None])[-1],'collectorInvocations':r.get('collectorInvocations'),'sourceRestored':r.get('sourceRestored'),'originalCompileSucceeded':r.get('originalCompileSucceeded'),'observationFailure':r.get('observationFailure'),'processes':ps}
    with (OUT/'poll.jsonl').open('a') as stream:stream.write(json.dumps(record)+'\n')
    print(json.dumps(record),flush=True)
    if not any(p['sameExpectedStart'] for p in ps) and r.get('status')!='STARTING':break
    time.sleep(15)

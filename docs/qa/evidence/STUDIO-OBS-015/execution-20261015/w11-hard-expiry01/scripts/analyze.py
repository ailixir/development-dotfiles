import json,glob,sys,os,statistics
d=sys.argv[1]
rows=[]
for o in sorted(glob.glob(d+'/oracle-*.json')):
    i=os.path.basename(o)[7:-5]
    f=json.load(open(o)); r=json.load(open(f'{d}/run-{i}.json')) if os.path.exists(f'{d}/run-{i}.json') else {}
    cf=f['claimFacts']; 
    e0=cf[0]['started']+cf[0]['timeoutMs']+100   # perf-clock estimate of E from first claim
    e4=cf[-1]['started']+cf[-1]['timeoutMs']+100
    st=f['authorityStoppedAt']
    t=[a for a in r.get('testResults',[{}])[0].get('assertionResults',[]) if 'hard-expiry' in a.get('title','')] if r else []
    dur=t[0].get('duration') if t else None; status=t[0].get('status') if t else None
    rows.append(dict(i=i,status=status,dur=dur,reason=f['stopReason'],stop_minus_E0=st-e0,stop_minus_E4=st-e4,drift=e4-e0,claims=len(cf),lastRemaining=cf[-1]['timeoutMs']+100,gap0=f['requestFacts'][0]['started']-cf[0]['started']))
fails=[x for x in rows if x['reason']!='EXPIRED' or x['status']!='passed']
print(d.split('/')[-1],'runs',len(rows),'fail',len(fails))
for k in ['stop_minus_E0','stop_minus_E4','drift','lastRemaining','dur']:
    v=[x[k] for x in rows if x[k] is not None]
    if v: print(f'  {k}: min {min(v):.2f} med {statistics.median(v):.2f} max {max(v):.2f}')
for x in fails: print('  FAIL',x)
json.dump(rows,open(d+'/analysis.json','w'),indent=1)

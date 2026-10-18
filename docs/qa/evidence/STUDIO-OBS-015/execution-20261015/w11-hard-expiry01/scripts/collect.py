import json,glob,os,shutil,collections,statistics,re,hashlib,subprocess
W='/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/dex-w11-hard-expiry'
R='/Users/brunobuger/orca/workspaces/put-checks/ui-studio'
D=R+'/docs/qa/evidence/STUDIO-OBS-015/execution-20261015/w11-hard-expiry01'
L=D+'/logs'; S=D+'/scripts'
for p in (L,S): os.makedirs(p,exist_ok=True)
def cp(a,b):
    os.makedirs(os.path.dirname(b),exist_ok=True); shutil.copyfile(a,b)
# patch + scripts
cp(W+'/fix.patch',D+'/fix.patch')
for f in ['loop.sh','loop-full.sh','sweep.sh','analyze.py','mkprobe.py','harden.py','timer_vs_wall.mjs','clock_drift.mjs','collect.py','stopReason.test.ts']:
    cp(W+'/'+f,S+'/'+f)
# rate runs (pristine test, hard-expiry mode only)
for v,name in [('cur','current-tree'),('v1-w10rev','w10-reverted'),('v2-w9w10rev','w9-w10-reverted')]:
    d=W+'/logs-rate/'+v
    cp(d+'/summary.txt',f'{L}/rate/{name}/summary.txt'); cp(d+'/analysis.json',f'{L}/rate/{name}/analysis.json')
    for r in json.load(open(d+'/analysis.json')):
        if r['status']!='passed' or r['reason']!='EXPIRED':
            for pre in ('run','oracle'): cp(f"{d}/{pre}-{r['i']}.json",f"{L}/rate/{name}/failing/{pre}-{r['i']}.json")
# instrumented probe runs
rows=[]
for f in sorted(glob.glob(W+'/logs-probe/*/oracle-*.json')):
    o=json.load(open(f)); E=o['expiresAtMs']; s=o['stopCalls'][0]
    caller=[x for x in s['frames'] if 'src/guided' in x]
    rows.append((f.split('/')[-2]+'/'+os.path.basename(f), o['stopReason'], s['reason'], s['dateNow']-E, round(s['wallMs']-E,2), caller[0].split('(')[-1].rstrip(')') if caller else '', len(o['renewCalls']), round(o['renewCalls'][-1]['startWall']-E,1)))
with open(L+'/probe-first-stop.tsv','w') as fh:
    fh.write('run\tstopReason\tfirstStopReason\tDate.now()-E at spy (ms)\tperf-wall minus E (ms)\tcaller\trenewals\tlast renewal start minus E (ms)\n')
    for r in rows: fh.write('\t'.join(map(str,r))+'\n')
rows=[]
for f in sorted(glob.glob(W+'/logs-cb/*/oracle-*.json')):
    o=json.load(open(f)); E=o['expiresAtMs']; end=[c for c in o['timerCallbacks'] if c['armedDue']==E]
    first=min(end,key=lambda c:c['perf'])
    rows.append((f.split('/')[-2]+'/'+os.path.basename(f), o['stopReason'], first['who'], first['dateNow']-E, len(end)))
with open(L+'/probe-timer-callback.tsv','w') as fh:
    fh.write('run\tstopReason\tfirst end-of-session timer\tDate.now()-E inside that callback (ms)\tend-of-session timer callbacks\n')
    for r in rows: fh.write('\t'.join(map(str,r))+'\n')
# phase sweep
rows=[]
for f in sorted(glob.glob(W+'/logs-sweep/cur/oracle-*.json'),key=lambda x:(int(re.search(r'd(\d+)',x).group(1)),x)):
    m=re.search(r'd(\d+)-r(\d)',f); o=json.load(open(f)); E=o['expiresAtMs']; s=o['stopCalls'][0]
    caller=[x for x in s['frames'] if 'src/guided' in x]
    rows.append((int(m.group(1)),int(m.group(2)),o['stopReason'],round(s['wallMs']-E,1),caller[0].split('(')[-1].rstrip(')') if caller else '',round(o['renewCalls'][-1]['startWall']-E,1),len(o['renewCalls'])))
with open(L+'/phase-sweep.tsv','w') as fh:
    fh.write('delay before POST /context (ms)\trep\tstopReason\tfirst stop minus E (ms)\tfirst stop caller\tlast renewal start minus E (ms)\trenewals started\n')
    for r in rows: fh.write('\t'.join(map(str,r))+'\n')
# micro + drift
cp(W+'/logs-micro/timer_vs_wall.jsonl',L+'/timer-vs-wall-microbench.jsonl'); cp(W+'/logs-micro/clock_drift.json',L+'/clock-drift.json')
# skew experiments
for t in ['curSkew','fixSkew-pre-hardening','fixSkew','fixSkew8']:
    d=W+'/logs-skew/'+t
    if os.path.isdir(d): cp(d+'/summary.txt',f'{L}/skew/{t}/summary.txt'); 
    if os.path.exists(d+'/analysis.json'): cp(d+'/analysis.json',f'{L}/skew/{t}/analysis.json')
# validation
for t in ['fix','fixB']:
    cp(f'{W}/logs-fix/{t}/summary.txt',f'{L}/validate/hard-expiry-product-fix-only/{t}-summary.txt'); cp(f'{W}/logs-fix/{t}/analysis.json',f'{L}/validate/hard-expiry-product-fix-only/{t}-analysis.json')
    cp(f'{W}/logs-fix2/{t}/summary.txt',f'{L}/validate/hard-expiry-final-patch/{t}-summary.txt'); cp(f'{W}/logs-fix2/{t}/analysis.json',f'{L}/validate/hard-expiry-final-patch/{t}-analysis.json')
    cp(f'{W}/logs-full/{t}/summary.txt',f'{L}/validate/whole-file-final-patch/{t}-summary.txt')
for t in ['cur','curB']:
    if os.path.exists(f'{W}/logs-full-cur/{t}/summary.txt'): cp(f'{W}/logs-full-cur/{t}/summary.txt',f'{L}/rate/whole-file-current-tree/{t}-summary.txt')
for f in ['unit-full.json','unit-full.log','unit-full.exit','unit-full.time','unit-full-attempt1-missing-helm-chart.log','fixtures-full.exit','fixtures-full.log','fixtures-full.time','fixtures-full-run2.exit','fixtures-full-run2.log','fixtures-full-run2.time','eslint.exit','eslint.log','tsc.exit','tsc.log']:
    if os.path.exists(W+'/logs-validate/'+f): cp(W+'/logs-validate/'+f,L+'/validate/'+f)
for f in ['fixtures-full.json','fixtures-full-run2.json']:
    r=json.load(open(W+'/logs-validate/'+f))
    slim={k:r[k] for k in ['numTotalTestSuites','numFailedTestSuites','numPassedTests','numFailedTests','numPendingTests','numTotalTests','success']}
    slim['files']=[{ 'file':t['name'].split('studio-runner/')[-1],'status':t['status'],'tests':[{'name':a['fullName'][:140],'status':a['status'],'durationMs':round(a.get('duration') or 0)} for a in t['assertionResults'] if a['status']!='passed' or 'secret ownership' in a['fullName']]} for t in r['testResults']]
    json.dump(slim,open(L+'/validate/'+f.replace('.json','.slim.json'),'w'),indent=1)
for t in ['cur','curB']:
    d=W+'/logs-full-cur/'+t
    for f in sorted(glob.glob(d+'/run-*.json')):
        r=json.load(open(f))
        bad=[a for tr in r['testResults'] for a in tr['assertionResults'] if a['status']!='passed']
        if bad:
            i=os.path.basename(f)[4:-5]
            cp(f,f'{L}/rate/whole-file-current-tree/failing/{t}-run-{i}.json')
            cp(f'{d}/oracle-{i}-hard-expiry.json',f'{L}/rate/whole-file-current-tree/failing/{t}-oracle-{i}-hard-expiry.json')
# whole-file per-mode table, current tree and final patch
def table(dirs,label):
    modes=collections.defaultdict(lambda:[0,0,[]])
    for d in dirs:
        for f in sorted(glob.glob(d+'/run-*.json')):
            r=json.load(open(f))
            for tr in r['testResults']:
                for a in tr['assertionResults']:
                    m=a['title'].split(': ')[-1]; modes[m][0]+=1; modes[m][2].append(a['duration'])
                    if a['status']!='passed': modes[m][1]+=1
    return {m:{'runs':v[0],'failed':v[1],'durationMs':{'min':round(min(v[2])),'median':round(statistics.median(v[2])),'max':round(max(v[2]))}} for m,v in modes.items()}
json.dump({'current_tree_whole_file':table([W+'/logs-full-cur/cur',W+'/logs-full-cur/curB'],'cur'),'final_patch_whole_file':table([W+'/logs-full/fix',W+'/logs-full/fixB'],'fix')},open(L+'/whole-file-per-mode.json','w'),indent=1)
print('collected into',D)

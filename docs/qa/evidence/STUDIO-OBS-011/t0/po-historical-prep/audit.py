"""Read-only historical PO audit; writes only this script's evidence directory."""
from pathlib import Path
from collections import Counter
import datetime,hashlib,json,re,subprocess,os
ROOT=Path.cwd();OUT=ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/po-historical-prep'
def sha(p):
 p=Path(p); return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
def load(p): return json.loads(Path(p).read_text())
def save(n,a): (OUT/n).write_text(json.dumps(a,indent=2,ensure_ascii=False)+'\n')
def section(t,n):
 m=re.search(r'^## '+re.escape(n)+r'\s*$',t,re.M)
 if not m:return None
 nxt=re.search(r'^## ',t[m.end():],re.M)
 end=m.end()+nxt.start() if nxt else len(t)
 return t[m.start():end]
protected=['Story','Acceptance Criteria','Tasks / Subtasks','Dev Notes','File List','Known limitations','Dev Agent Record','QA Results']
base={s:f'docs/stories/STUDIO-OBSERVED/STUDIO-OBS-{s}.story.md' for s in ['008','015']}
watch=list(base.values())+['docs/stories/STUDIO-OBSERVED/README.md','.ai/STUDIO-OBS-015-close.json','.ai/STUDIO-OBS-015-close.drift-annotation.json']+[f'.aiox/sdc/STUDIO-OBS-{s}/state.json' for s in base]
before={p:sha(p) for p in watch}
a={'createdUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'author':'Pax (@po), historical assessment only','writesLimitedTo':str(OUT.relative_to(ROOT)),'budget':{'declaredUsd':500,'actualSpend':'unavailable'},'stories':{},'cliChecks':{},'noLifecycleOrAdministrativeWrites':True}
# Fresh capture uses the existing read-only git/file collector and only an off-tree output.
p=subprocess.run(['python3','.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py',str(OUT/'current-source-capture.json')],capture_output=True,text=True)
a['captureCommand']={'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
current=load(OUT/'current-source-capture.json');currentmap={x['path']:x['sha256'] for x in current['files']}
manifestPaths={'008':'docs/qa/evidence/STUDIO-OBS-008/execution-20261017/final-gates/capture-final.json','015':'docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates07/capture-after.json'}
for s,story in base.items():
 t=Path(story).read_text();m=load(manifestPaths[s]);oldmap={x['path']:x['sha256'] for x in m['files']}
 oldDist=m['dist'];newDist=current['dist'];distOld={x['path']:x['sha256'] for x in oldDist['files']};distNew={x['path']:x['sha256'] for x in newDist['files']}
 drift={'changed':[{'path':p,'reviewedSha256':v,'currentSha256':currentmap.get(p)} for p,v in oldmap.items() if p in currentmap and currentmap[p]!=v],'missing':[p for p in oldmap if p not in currentmap],'added':[p for p in currentmap if p not in oldmap],'distChanged':[p for p,v in distOld.items() if distNew.get(p)!=v],'distAdded':[p for p in distNew if p not in distOld]}
 save(s+'-source-drift.json',drift)
 a['stories'][s]={'storyPath':story,'storySha256':sha(story),'status':re.search(r'^\| Status \| (.*?) \|',t,re.M)[1],'protectedSectionSha256':{n:hashlib.sha256(v.encode()).hexdigest() for n in protected if (v:=section(t,n)) is not None},'unchecked': [{'line':i+1,'text':l} for i,l in enumerate(t.splitlines()) if '[ ]' in l],'fileListPresent':bool(section(t,'File List')),'historicalManifest':{'path':manifestPaths[s],'sha256':sha(manifestPaths[s]),'sourceDigest':m['digest'],'distDigest':m['dist']['digest'],'sourceCount':len(m['files'])},'currentSourceDigest':current['digest'],'currentDistDigest':current['dist']['digest'],'currentEqualsHistorical':current['digest']==m['digest'] and current['dist']['digest']==m['dist']['digest'],'driftCounts':{k:len(v) for k,v in drift.items()},'closureMarkersStory':re.findall(r'\[closure-key: (STUDIO-OBS-'+s+r':[^\]]+)\]',t),'closureMarkersIndex':re.findall(r'\[closure-key: (STUDIO-OBS-'+s+r':[^\]]+)\]',Path('docs/stories/STUDIO-OBSERVED/README.md').read_text())}
 for phase in ['develop','review','close']:
  cmd=['node','tools/aiox-local.cjs','sdc','verify',story,phase,'--json'];r=subprocess.run(cmd,capture_output=True,text=True)
  save(s+'-'+phase+'-cli.json',{'command':cmd,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
  try: parsed=json.loads(r.stdout)
  except ValueError: parsed=None
  a['cliChecks'][s+'-'+phase]={'exit':r.returncode,'result':parsed.get('result') if parsed else None}
close=load('.ai/STUDIO-OBS-015-close.json')
a['015HistoricalCloseIntegrity']={'closeFileSha256':sha('.ai/STUDIO-OBS-015-close.json'),'storyEqualsRecordedAfter':sha(base['015'])==close['storySha256After'],'protectedSectionComparisons':{k:{'actual':a['stories']['015']['protectedSectionSha256'].get(k),'recorded':v['after'],'equal':a['stories']['015']['protectedSectionSha256'].get(k)==v['after']} for k,v in close['protectedSectionSha256'].items()},'rowRemovalRestoresRecordedBefore':hashlib.sha256(''.join(l for l in Path(base['015']).read_text().splitlines(keepends=True) if close['closureKey'] not in l).encode()).hexdigest()==close['storySha256Before'],'evidenceHashesRechecked':[{'path':v['path'],'recordedSha256':v['sha256'],'actualSha256':sha(v['path']),'equal':sha(v['path'])==v['sha256']} for v in close['evidenceHashes']],'originalQaDoneSnapshotGap':close['restoresExactQaReviewedStoryNote'],'idempotencyFixtureNotExecutedHistorically':close['idempotency']['note']}
# Recount historic collector archives; no tests run.
receipts={'008':'docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution/obs008-final-check01-results.json','015':'docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/final-gate-attempt06-20261017T1307-results.json'}
for s,p in receipts.items():
 r=load(p);cases=r['testcases'];key=lambda x:(x['task'],x['class'],x['name'])
 a['stories'][s]['historicalCollectorRecount']={'path':p,'sha256':sha(p),'exit':r['exit'],'recordedCounts':r['counts'],'recounted':dict(Counter(x['status'] for x in cases)),'recountByTask':{k:dict(Counter(x['status'] for x in cases if x['task']==k)) for k in r['explicitTestTasks']},'skipsExactMultiset':Counter(key(x) for x in cases if x['status']=='SKIP')==Counter(key(x) for x in r['expectedHistoricalSkips']),'sourceStable':r['sourceStable'],'testInputStable':r['testInputStable'],'distStable':r['distStable'],'taskCollectionComplete':r['taskCollectionComplete']}
c008=load(receipts['008'])['testcases'];c015=load(receipts['015'])['testcases'];k=lambda x:(x['task'],x['class'],x['name']);a['historicCaseDelta008Vs015']={'removed':len(Counter(map(k,c015))-Counter(map(k,c008))),'added':len(Counter(map(k,c008))-Counter(map(k,c015)))}
# Search content rather than assuming filename. Exclude copied sandbox trees; record precise scope.
searchRoots=['.ai','docs/stories/STUDIO-OBSERVED','docs/qa/evidence/STUDIO-OBS-008','docs/qa/evidence/STUDIO-OBSERVED-NEXT','.aiox/sdc/STUDIO-OBS-008']
hits=[];seen=0
for top in searchRoots:
 for rt,ds,fs in os.walk(top):
  ds[:]=[d for d in ds if not d.endswith(('-artifact-before','-artifact-after')) and d not in ['node_modules','repo','.git','candidate','administrative-before','administrative-after']]
  for f in fs:
   p=Path(rt)/f
   if p.suffix not in ['.md','.json','.yaml','.yml','.txt'] or p.stat().st_size>2000000: continue
   seen+=1;t=p.read_text(errors='replace')
   if re.search(r'\[closure-key:\s*STUDIO-OBS-008:',t):hits.append(str(p))
a['008ClosureSearch']={'roots':searchRoots,'filesSearched':seen,'exclude':'copied artifact/sandbox/administrative snapshots, binary/non-text and >2MB artifacts','keyedAdministrativeClosureHits':hits,'misleadingCloseLabels':'obs008-be-close01..10 are backend implementation verification labels, not PO closure; f1/f1-closure.md is the implementation join gate'}
a['008AdministrativeDisposition']={'result':'HARD_FAIL_NO_ADMINISTRATIVE_PATCH','reason':'QA verdict provenance does not match the current story revision: historical source/dist binding differs from current source/dist; canonical po-close-story requires verified current-revision binding before every administrative write. CLI only checks fields/verdict/story binding, not hash equality.','alreadyQaDonePreserved':True,'historicalQaVerdict':'CONCERNS, accepted, no new QA verdict','additionalUncertainty':'008 QA reviewed story hash 81950a... is recorded but original pre-QA/Done-time protected-story copies were not found in the assessed scope; later root T5/QA box changes are documented in CLAUDE-RESUME-STATE.md but not independently byte-diffable against a saved original snapshot.'}
a['trackedFilesBefore']=before;a['trackedFilesAfter']={p:sha(p) for p in watch};a['watchedArtifactsUnchanged']=a['trackedFilesBefore']==a['trackedFilesAfter']
refs=['.aiox-core/development/tasks/po-close-story.md','.aiox-core/core/sdc/phase-verify.js','.aiox-core/core/sdc/story-meta.js','.aiox-core/core/sdc/progress.js','.aiox-core/core/sdc/index.js','.aiox-core/cli/commands/sdc/index.js','docs/qa/evidence/STUDIO-OBSERVED-NEXT/RESUME-HANDOFF-20261018-CODEX.md','docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/CLAUDE-RESUME-STATE.md','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md','docs/stories/STUDIO-OBSERVED/STUDIO-OBS-011.story.md','docs/qa/gates/STUDIO-OBS-008-single-path-studio-ui.yml','docs/qa/gates/STUDIO-OBS-015-incremental-re-learn-from-the-first-changed-step.yml','docs/qa/evidence/STUDIO-OBS-008/qa-gate-20261017/gate.md','docs/qa/evidence/STUDIO-OBS-008/qa-gate-20261017/gate.json','docs/qa/evidence/STUDIO-OBS-015/execution-20261015/po-recording85-decision-user-c/decision.json']
a['referenceHashes']={p:sha(p) for p in refs}
save('audit.json',a)
print(json.dumps({'currentSource':current['digest'],'currentDist':current['dist']['digest'],'drift':{s:a['stories'][s]['driftCounts'] for s in base},'015SectionHashesEqual':all(v['equal'] for v in a['015HistoricalCloseIntegrity']['protectedSectionComparisons'].values()),'015HistoricEvidenceHashMismatches':[v['path'] for v in a['015HistoricalCloseIntegrity']['evidenceHashesRechecked'] if not v['equal']],'008ClosureHits':hits,'watchedUnchanged':a['watchedArtifactsUnchanged']}))

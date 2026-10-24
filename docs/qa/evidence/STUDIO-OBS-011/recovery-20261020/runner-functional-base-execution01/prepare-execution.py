from pathlib import Path
import os,json,hashlib,subprocess,stat,datetime,shutil
R=Path.cwd();O=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-execution01';P=R/'docs/qa/evidence/STUDIO-OBS-011/recovery-20261020/runner-functional-base-successor-preparation';I=R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/business-and-status-integration01'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def wj(n,d):(O/n).write_text(json.dumps(d,indent=2)+'\n')
env=os.environ.copy();env['PATH']='/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:'+env['PATH'];env['OBS011_RT_FINAL_COMPOSITION']='ALL_PREDECESSORS_APPLIED_LANE_IDLE'
commands=json.loads((P/'commands-successor.json').read_text());S=Path(commands['sandboxProposal']);assert not S.exists()
for c in commands['commands'][:9]:
 label=c['argv'][2];E=R/'docs/qa/evidence/STUDIO-OBS-011/execution';assert not any(E.glob(label+'*')),label
pins={P/'manifest.json':'40d1eb22977f71aa65b6b34a2db771595908cffd7d8e2404ef9d604b04f6267b',P/'candidate/prepare-current-sandbox.py':'e38a3fd99798d55d2e46bb2fb1ce0d4c3b9a4b799f5d0c8cfdc16d79af5edaef',P/'candidate/copy-back-binding.json':'95427bbdaf0cc709d50341a7c9d2f7d5e223c56ff54bc6c48ec2e52f7a2cf621',P/'independent-qa/review.md':'438e5dee85a3163307f65e3ed7cb8664a9e9758561a532831b2a732ac6b6f398',P/'independent-qa/manifest.json':'22033e65feafbb18f42bdf0325e9ea47d6f367bfb0b189b9f40119786e721c11',I/'nine-target-application-binding.json':'a83003b9b275cf84d383dbaf45222b23e6c40e867c8503e6a6c0e723f152e915',I/'root-adoption.json':'b6d2020e4c2f6bc5941ef7ab3647ff2e228f7af48a5bf474d76ec103f1cf4485'}
for p,h in pins.items():assert sha(p)==h,(p,sha(p))
for r in json.loads((P/'manifest.json').read_text())['artifacts']:assert sha(P/r['path'])==r['sha256']
binding=json.loads((P/'candidate/copy-back-binding.json').read_text());integ=json.loads((I/'nine-target-application-binding.json').read_text())
for r in integ['rows']:assert sha(R/r['path'])==r['actualAfterSha256'] and oct(stat.S_IMODE((R/r['path']).stat().st_mode))==r['actualAfterMode']
for r in binding['paths']:assert sha(R/r['path'])==r['beforeSha256'] and sha(R/r['candidatePath'])==r['afterSha256']
for r in binding['carriedUntouched']+binding['businessPredecessors']:assert sha(R/r['path'])==r['sha256']
carry=json.loads((P/'selftest-carry.json').read_text())
for r in carry['checkerFixtureAllowanceAndBeforeSourceBindings']:assert sha(R/r['path'])==r['sha256']
assert sha(R/carry['carry']['resultsPath'])==carry['carry']['resultsSha256']
for r in carry['dependencyAndCanonicalCliIdentity']:
 p=R/'studio-runner/node_modules'/r['relativePath'];assert sha(p)==r['actualSha256'] and oct(stat.S_IMODE(p.stat().st_mode))==r['mode']
node=subprocess.run(['node','--version'],env=env,capture_output=True,text=True,check=True);pnpm=subprocess.run(['pnpm','--version'],env=env,capture_output=True,text=True,check=True);assert node.stdout.strip()=='v24.20.0' and pnpm.stdout.strip()=='10.33.0'
wj('runtime-cli-identity.json',{'node':node.stdout.strip(),'pnpm':pnpm.stdout.strip(),'nodeExecutable':shutil.which('node',path=env['PATH']),'pnpmExecutable':shutil.which('pnpm',path=env['PATH']),'canonicalAndTypescriptPins':carry['dependencyAndCanonicalCliIdentity']})
argv=['python3',str(R/'.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py'),str(O/'actual-before.json')]
r=subprocess.run(argv,cwd=R,env=env,capture_output=True,text=True);(O/'actual-before-capture.log').write_text(r.stdout+r.stderr);assert r.returncode==0
actual=json.loads((O/'actual-before.json').read_text());assert actual['digest']=='3e1801b434eb8a3a1b096b65bd3701cb76859b5607121c5062631d0377facd4f' and len(actual['files'])==1812 and actual['dist']['digest']=='698a936537f3be1de45436c4459390fee5628b31e6790e1aa2b183cfaf814210' and len(actual['dist']['files'])==238
wj('root-integration-admission.json',{'state':'ROOT_ADMITTED_FRESH_FUNCTIONAL_BASE_PHASE1_ONLY','atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actualBusinessAndStatusApplication':str(I.relative_to(R)/'nine-target-application-binding.json'),'actualBusinessAndStatusApplicationSha256':sha(I/'nine-target-application-binding.json'),'rootAdoptionSha256':sha(I/'root-adoption.json'),'finalActualSourceDigest':actual['digest'],'finalSelectedSourceCount':1812,'actualDistDigest':actual['dist']['digest'],'actualDistMembership':238,'sourceQaSha256':sha(P/'independent-qa/review.md'),'renewalExecutionQa':'e90d95d56fbb2f2aff30a3511628f78ecd38da6a4238b214c1abf72f07f67496','renewalAcceptedApplication':'88dc647a0df62e44a77c2ea6ec19caa03ccc16a5596d83006474ff2d6e17d806','benchmarkRootAcceptance':'27653e35da8d307972178e8e1af6b2ff94d6e1267d75a4c7d80410311f2c3973','sourceHelperSha256':sha(P/'candidate/prepare-current-sandbox.py'),'bindingSha256':sha(P/'candidate/copy-back-binding.json'),'allNineActualAfterBuffersAndModesVerified':True,'quietLaneOwner':'gateway_implementation','newMeasuredEmitAcceptance':'UNBOUND_PENDING_ROOT_NEW_DISPOSITION','privateFullFixture':'UNBOUND_UNEXECUTED','rtCopyback':'UNBOUND_UNEXECUTED','actualBuild':'UNBOUND_UNEXECUTED','noHistoricalCatalogAdmission':True})
wj('selftest-carry-verified.json',{'existingEightControlsCarried':True,'rerun':False,'all13CheckerAndFiveCliTypescriptPinsExact':True,'pins':carry})
wj('approval-pins.json',[{'path':str(p.relative_to(R)),'sha256':h} for p,h in pins.items()])
cap=commands['futureCapture']['argv'];r=subprocess.run(cap,cwd=R,env=env,capture_output=True,text=True);(O/'catalog-capture.log').write_text(r.stdout+r.stderr);wj('catalog-capture-command.json',{'argv':cap,'exit':r.returncode});assert r.returncode==0
catalog=O/'fresh-copy-catalog.json';cat=json.loads(catalog.read_text());fresh=sha(catalog)
old=json.loads((R/'docs/qa/evidence/STUDIO-OBS-009/recovery-20261020/benchmark-hard-gate-execution01/actual-copy-catalog-before.json').read_text());x={r['path']:r for r in old['files']};y={r['path']:r for r in cat['files']};assert x.keys()==y.keys();changed=[{'path':p,'historicalBefore':x[p],'actualCurrent':y[p]} for p in x if x[p]!=y[p]];assert {r['path'] for r in changed}=={r['path'] for r in binding['businessPredecessors']}
wj('catalog-current-versus-historical-provenance.json',{'admission':'New measured catalog only; historical comparison is provenance, not hash admission','newCatalogSha256':fresh,'files':len(cat['files']),'sameMembership':True,'changes':changed})
seed=commands['futureSeed']['argv'];seed=[fresh if a=='<MEASURED_NEW_FUNCTIONAL_BASE_CATALOG_SHA256>' else a for a in seed]
wj('seed-start.json',{'argv':seed,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sandboxAbsentBeforeStart':True})
with (O/'seed.log').open('w') as log:
 p=subprocess.Popen(seed,cwd=R,env=env,stdout=log,stderr=subprocess.STDOUT);wj('seed-process.json',{'pid':p.pid,'argv':seed});code=p.wait()
wj('seed-terminal.json',{'exit':code,'atUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()});assert code==0
shutil.copy2(S/'seed-receipt.json',O/'seed-receipt.json')
print(json.dumps({'seedExit':code,'seedReceiptSha256':sha(O/'seed-receipt.json'),'freshCatalogSha256':fresh,'files':len(cat['files']),'node':node.stdout.strip(),'pnpm':pnpm.stdout.strip(),'sandbox':str(S)}))

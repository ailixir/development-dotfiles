"""Finite exact sealed-source/caller/reuse review, no target execution."""
from pathlib import Path
import ast,hashlib,json,shlex,stat
S=Path('docs/qa/evidence/STUDIO-OBS-011/t0/early/gateway80-failed-red-resource-prep/resume6')
O=Path('docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/gateway80-failed-red-resource-code06-exact-review')
checks=[];pins=[]
def sha(b):return hashlib.sha256(b).hexdigest()
def load(p):return json.loads(p.read_bytes())
def check(n,v):
    checks.append({'id':n,'passed':bool(v)})
    if not v:raise AssertionError(n)
def bind(p,r):
    b=p.read_bytes();check('PIN-'+str(p),sha(b)==r['sha256'] and len(b)==r['bytes'] and stat.S_IMODE(p.stat().st_mode)==r['mode']);pins.append(dict(path=str(p),sha256=sha(b),bytes=len(b),mode=r['mode']))
    if p.suffix=='.json':json.loads(b)
    return b
raw=(S/'manifest.json').read_bytes();check('SUBJECT',sha(raw)=='b751602e38355042033e1a1b86ad0996c30a0377e56fae064f1eb383866e7976' and len(raw)==56818)
m=json.loads(raw);check('258-UNIQUE-PAYLOADS',len(m['files'])==258 and len({r['path'] for r in m['files']})==258)
cache={r['path']:bind(S/r['path'],r) for r in m['files']}
actual={str(p.relative_to(S)) for p in S.rglob('*') if p.is_file()};check('EXACT-MEMBERSHIP',actual==set(cache)|{'manifest.json','SHA256SUMS'})
checksum={}
for line in (S/'SHA256SUMS').read_text().splitlines():
    h,name=line.split('  ',1);check('CHECKSUM-'+name,sha((S/name).read_bytes())==h);checksum[name]=h
check('259-CHECKSUM-ROWS-ACYCLIC',len(checksum)==259 and set(checksum)==set(cache)|{'manifest.json'} and 'SHA256SUMS' not in checksum)
receipt=load(S/'input-read-receipt.json')
for r in receipt['inputs']:
    check('PUBLIC-INPUT-'+r['path'],'/runtime/' not in r['path'] and 'preexisting-baseline.json' not in r['path']);bind(Path(r['path']),r)
check('FULL-ROOT-CONDITIONS',sha(cache['complete-root-all-findings-adoption.json'])=='7abc98e0eb0dadbff1a21476cc38faff0c551e4ea59bff78c288ebd785560b7d')
for name in ['protocol.py','failed_gateway.py','entry.py','factory.py','installer.py','install-cli.py','control-author.py','control-author-cli.py','custody.py']:
    ast.parse(cache[name]);check('AST-'+name,True)
bindings=load(S/'source-bindings.json')
for r in bindings['files']:check('RUNTIME-CALLER-PIN-'+r['path'],sha(cache[r['path']])==r['sha256'] and len(cache[r['path']])==r['bytes'])
final=load(S/'final-binding-receipt.json');correction=load(S/'shell-quote-correction.json')
for row in final['shellTokens']:
    name=row['path'];text=cache[name].decode();argument=shlex.split(text.split('-B -c ',1)[1])[0]
    old=cache[name+'.before-shell-quote-fix.txt'].decode().split("-B -c '",1)[1].rsplit("\n' ",1)[0]
    check('FINAL-SHELL-HASH-'+name,sha(cache[name])==row['finalSha256'] and sha(argument.encode())==row['actualArgumentSha256'] and len(argument.encode())==row['actualSingleQuotedArgumentBytes'])
    check('WHOLE-INTENDED-PYTHON-AST-'+name,ast.dump(ast.parse(argument),include_attributes=False)==ast.dump(ast.parse(old),include_attributes=False))
    p=next(n for n in ast.parse(cache['protocol.py']).body if isinstance(n,ast.ClassDef) and n.name=='FailureSink')
    q=next(n for n in ast.parse(argument).body if isinstance(n,ast.ClassDef) and n.name=='FailureSink')
    check('SINK-AST-'+name,ast.dump(p,include_attributes=False)==ast.dump(q,include_attributes=False))
check('FOUR-SHELL-BINDINGS',len(final['shellTokens'])==4 and correction['sourceExecutionAfterCorrection'] is False)
runtime_old=cache['failed_gateway-attempt10.py.txt'];check('ONE-LINE-RUNTIME-DELTA',runtime_old.replace(b'            typed.extend(rows)',b'            typed=P.actor_union(self.k,[*typed,*rows],allow_pending=True)')==cache['failed_gateway.py'])
check('LATE4-COMPONENT-REUSE',len(final['fourHistoricalDenials'])==4 and all(r['status']==1 and r['primary']=={'namespace':'PROTOCOL_HOLD','reason':'FRESHNESS_OR_CLOCK_REVERSE','stage':'FINAL_GUARDED_ACCEPTANCE'} for r in final['fourHistoricalDenials']))
historical=[b for b in cache.values() if sha(b)==final['pureJSReuse']['executedHistoricalHelperSha256']]
check('JS10-EXACT-DEPENDENCY-PREFIX',bool(historical) and historical[0][:9627]==cache['operator-completion.js'][:9627] and final['pureJSReuse']['checks']==10)
attempt=load(S/'critical-attempt13.json');status=load(S/'critical-attempt13-tool-status.json')
check('AUTHOR39-13-OBSERVED0',attempt['passed']==39 and attempt['failure'] is None and len(attempt['operatorSteps'])==13 and status['finalExitCode']==0 and status['nestedTerminalChunkId'] is None)
check('FINAL-GUARD-BYTES-NOT-AUTHOR-RERUN',final['currentExecution']['guardBytesChangedAfterRun'] is True and final['currentExecution']['finalGuardPythonASTExact'] is True)
check('CUSTODY-LITERAL-PRIOR',cache['custody.py']==(S.parent/'resume5/custody.py').read_bytes())
critical=load(O/'critical-results.json');js=load(O/'operator-results.json')
check('OWN19-CURRENT-COMPOSITION',critical['passed']==19 and len(critical['caseGroups'])==4 and critical['actualTargetEffects']==0 and critical['unexpectedBoundaryEvents']==[])
check('OWN7-PURE-JS-3-EXCHANGES',js['passed']==7 and len(js['steps'])==3 and js['toolsInsideHelper']==0 and js['nodeProcesses']==0)
for name,h in critical['targetHashes'].items():check('OWN-CURRENT-TARGET-'+name,sha(cache[name])==h)
def function(name,symbol):
    t=ast.parse(cache[name]);return next(n for n in t.body if isinstance(n,ast.FunctionDef) and n.name==symbol)
install=function('install-cli.py','execute');source=ast.get_source_segment(cache['install-cli.py'].decode(),install)
check('INITIAL-ROSTER-GAP-SOURCE-RECORDED',"typedPriorActors=P.actor_union(contract,[*contract['knownPostBaseActors'],row],allow_pending=True)" in source and "typedActorRosterComplete=True" in source and 'actualPriorActors' not in source)
k=load(S/'contract.json');check('NO-INITIAL-OUTSIDE-FACT-SLOT','actualPriorActors' not in k['authorityAllowedFields'])
check('LATER-SETUP-CARRIER-IMPLEMENTED','actual_extra_actors(request[\'actualPriorActors\'],k)' in cache['control-author.py'].decode() and "evidence.includes('/failed-red-resource-disposition03/')" in cache['operator-completion.js'].decode())
check('CAPS-EXACT-DISTINCTION','len(rows)<=8192' in cache['protocol.py'].decode() and 'len(rows)<=256' in (S.parent/'resume5/protocol.py').read_text() and 'len(rows)<=8192' in cache['protocol.py'].decode())
print(json.dumps({'kind':'ARIA_SOURCE06_FINITE_SOURCE_CALLER_REUSE_REVIEW','passed':len(checks),'failed':0,'checks':checks,'pins':pins,'uniqueNamedPins':len({r['path'] for r in pins}),'sourceTargetFunctionsExecuted':0,'initialAuthorizationCoverageGap':True,'currentOutsideCarrierSupportedUnderFakes':True,'caps':{'source05':256,'source06Attempt10AndFinal':8192,'incrementalDedupCapIncreased':False},'actualTargetEffects':0},indent=2))

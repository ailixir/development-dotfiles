"""Independent bounded FOLD-rulings audit; no native, imports of entrypoints or product writes."""
from pathlib import Path
import re,json,hashlib
R=Path.cwd();D=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/fold-final-draft/resume2';O=R/'docs/qa/evidence/STUDIO-OBS-011/t0/qa/fold-final-rulings-review';A=R/'docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/resume2/fold-final-review'
h=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert h(A/'rulings.md')=='58f98e530825e2d1604981beadb00f4c6fe2ee0b2eca58184590ff6981062d50'
assert h(A/'review.md')=='6db2a45dbd51ff5b54165665d25ec0d5edfdaef2eb864411b27f52399b04fedf'
# Tokenizer preserves literal tokens, drops comments/space, and supports balanced bodies.
pattern=re.compile(r'(?P<comment>//[^\n]*|/\*.*?\*/)|(?P<literal>""".*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|(?P<word>[A-Za-z_$][\w$]*|\d+)|(?P<other>\S)',re.S)
def tokens(s):return [m.group() for m in pattern.finditer(s) if not m.group('comment')]
def member(s,signature):
 start=s.index(signature);a=s.index('{',start);depth=0
 for m in pattern.finditer(s,a):
  if m.group('comment') or m.group('literal'):continue
  if m.group()=='{':depth+=1
  elif m.group()=='}':
   depth-=1
   if not depth:return s[start:m.end()]
 raise AssertionError('unterminated member')
client_path='backend/src/main/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClient.java'
s=(D/'final-candidates'/client_path).read_text();old=(R/client_path).read_text()
ctor_sigs=['public HttpRunnerDispatchClient(\n      ObjectMapper objectMapper,\n      StudioExecutionProperties properties,\n      StudioRunnerProperties runner)', 'public HttpRunnerDispatchClient(\n      ObjectMapper objectMapper,\n      StudioExecutionProperties properties,\n      StudioRunnerProperties runner,\n      StudioRunnerTls tls)']
for signature in ctor_sigs:assert member(s,signature)==member(old,signature)
assert member(s,'public DispatchOutcome send(RunJob job)')==member(old,'public DispatchOutcome send(RunJob job)')
ssl_sig='public HttpRunnerDispatchClient(URI origin, javax.net.ssl.SSLContext tls,'
http_sig='public HttpRunnerDispatchClient(URI origin, HttpClient client,'
ssl=member(s,ssl_sig);http=member(s,http_sig)
assert 'HttpClient.newBuilder' not in ssl and 'HttpClient.newBuilder' not in http
assert 'initializeGuided(origin, tls, token, contracts);' in ssl
assert 'this.httpClient = guidedClient;' in ssl and 'this.validationClient = guidedClient;' in ssl
assert 'this.httpClient = client;' in http and 'this.validationClient = client;' in http
assert 'this.validationToken = token;' in http and 'this.explicitValidationOrigin = true;' in http
assert '@Autowired' not in ssl and '@Autowired' not in http
assert 'public void observeRequestBytes' not in s and 'void observeRequestBytes(' in s
assert 'GuidedPublicationProperties' not in s
# Raw SSL setup retains the retired guided constructor body under exact two field ports.
guided=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/bridge/GuidedRunnerClient.java').read_text()
old_setup=member(guided,'public GuidedRunnerClient(');old_body=old_setup[old_setup.index('{'):].replace('this.origin','this.guidedOrigin').replace('this.client','this.guidedClient')
new_setup=member(s,'private void initializeGuided(URI origin, javax.net.ssl.SSLContext tls,');new_body=new_setup[new_setup.index('{'):]
assert tokens(old_body)==tokens(new_body)
assert tokens(new_body).count('newBuilder')==1
# Validation setup retains both original closed-origin and NEVER/no-retry guards.
val=(R/'backend/src/main/java/com/citi/put/checks/studio/guided/publication/ObservedValidationClient.java').read_text()
val_setup=member(val,'public ObservedValidationClient(')
val_guards=val_setup[val_setup.index('require('):val_setup.index('    this.endpoint')]
new_guards=http[http.index('require('):http.index('    this.validationOrigin')]
assert tokens(val_guards)==tokens(new_guards)
validation=member(s,'public JsonNode validate(')
ordered=['contracts.validateAndCanonical(', 'representation.getBytes(', 'payload.length <= maxValidationBytes','validationToken.get()', 'budget.remaining()', 'Duration.ofMillis(validationTimeoutMs)', 'validationClient.send(']
pos=[validation.index(x) for x in ordered];assert pos==sorted(pos)
assert 'explicitValidationOrigin ? this.validationOrigin' in validation
assert 'require(contracts != null, "RUNTIME_INCOMPATIBLE", 409);' in validation
assert 'require(guidedClient != null && contracts != null, "RUNTIME_INCOMPATIBLE", 409);' in s
# Existing cross-package call arguments must survive the two named type/setup ports.
def newcalls(text,typename):
 ts=tokens(text);found=[]
 for i in range(len(ts)-3):
  if ts[i:i+3]!=['new',typename,'(']:continue
  args=[];current=[];depth=0
  for t in ts[i+3:]:
   if t==')' and depth==0:
    args.append(current);break
   if t==',' and depth==0:args.append(current);current=[];continue
   if t in ['(','[','{']:depth+=1
   if t in [')',']','}']:depth-=1
   current.append(t)
  found.append(args)
 return found
callmap=[]
for before in (D/'virtual-pre-final/backend/src/test').rglob('*.java'):
 path=before.relative_to(D/'virtual-pre-final');after=D/'final-candidates'/path
 if not after.is_file():continue
 b=before.read_text();a=after.read_text();newcalls_all=newcalls(a,'HttpRunnerDispatchClient')
 for typ in ['GuidedRunnerClient','ObservedValidationClient']:
  for args in newcalls(b,typ):
   expected=args if typ=='GuidedRunnerClient' else args[:4]
   assert expected in newcalls_all,(str(path),typ,'supplied-setup-arguments-changed')
   assert len(expected)==4 and expected[1]!=['null']
   callmap.append(dict(path=str(path),priorType=typ,argumentTokenSha256=hashlib.sha256(json.dumps(expected,separators=(',',':')).encode()).hexdigest(),port='URI+SSLContext' if typ=='GuidedRunnerClient' else 'URI+HttpClient',actualCompilation='UNEXECUTED'))
assert callmap and any(x['port']=='URI+HttpClient' for x in callmap)
# Same exact original transport-deadline helper and owned secret path remain source-preserved.
for signature in ['private static long transportDeadline(', 'private static Duration remaining(']:
 assert member(s,signature)==member(guided,signature)
# Exact two TS changes; full source equality after one named literal replacement proves body/cardinality.
ts=[]
for row in json.loads((D/'ts-metadata-proposals.json').read_text()):
 p=row['path'];before=D/'virtual-pre-final'/p;after=D/'final-candidates'/p
 assert h(before)==row['oldSha256'] and h(after)==row['newSha256'] and h(R/p)==row['oldSha256']
 b=before.read_text();a=after.read_text();assert b.count('GuidedRunnerClient')==1
 assert b.replace('GuidedRunnerClient','HttpRunnerDispatchClient',1)==a
 if 'fixtures-tier' in p:assert tokens(b)==tokens(a)
 else:
  bt=tokens(b);at=tokens(a);assert len(bt)==len(at)
  delta=[(x,y) for x,y in zip(bt,at) if x!=y];assert len(delta)==1 and 'GuidedRunnerClient.transportDeadline' in delta[0][0]
 ts.append(dict(path=p,beforeSha256=h(before),afterSha256=h(after),changes='one comment' if 'fixtures-tier' in p else 'one it title literal',functionalBodyUnchanged=True))
rt=R/'studio-runner/src/run/guidedBrowser.ts';rt_candidate=R/'docs/qa/evidence/STUDIO-OBS-011/t0/early/runner-draft/repo/studio-runner/src/run/guidedBrowser.ts'
assert h(rt)=='63f899ef688df31f3608c4a0b10f86ea5e63b710410bb32eb7f4d374cd2d63ae'
assert h(rt_candidate)=='59b4d23a2b06e9ffdf3371221970371c5fd8d4e4fe2df4b9acaf51dd2a0a72f0'
assert 'GuidedRunnerClient.transportDeadline' in rt.read_text().splitlines()[25]
matcher=re.compile(r'\b(?:GuidedRunnerClient|ObservedValidationClient|GuidedPublicationAuthorization)\b')
assert not matcher.search(rt_candidate.read_text())
# Independent prospective complete-root scan, not a shortened current-tree gate.
m=json.loads((D/'full-virtual-tree-map.json').read_text());hits=[];positive=[];count=0
for p,row in m['virtualFinal'].items():
 if not any(p.startswith(prefix) for prefix in ['backend/src/','studio-runner/src/','studio-runner/test/']):continue
 source=R/row['source'];assert h(source)==row['sha256'];count+=1
 for n,line in enumerate(source.read_text().splitlines(),1):
  if matcher.search(line):hits.append(dict(path=p,line=n,text=line))
for prefix in ['backend/src','studio-runner/src','studio-runner/test']:
 for source in (R/prefix).rglob('*'):
  if not source.is_file():continue
  for n,line in enumerate(source.read_text().splitlines(),1):
   if matcher.search(line):positive.append(dict(path=str(source.relative_to(R)),line=n))
assert len(hits)==1 and hits[0]['path']=='studio-runner/src/run/guidedBrowser.ts' and hits[0]['line']==26
manifest=json.loads((D/'atomic-manifest.json').read_text());ops={r['path']:r for r in manifest['operations']}
assert len(ops)==37 and 'studio-runner/src/run/guidedBrowser.ts' not in ops
for row in ts:assert row['path'] in ops and ops[row['path']]['candidateSha256']==row['afterSha256']
command="grep -rnw 'GuidedRunnerClient\\|ObservedValidationClient\\|GuidedPublicationAuthorization' backend/src studio-runner/src studio-runner/test"
assert json.loads((D/'grep-and-RT-ownership.json').read_text())['literalOriginalCommand']==command
assert command in (A/'rulings.md').read_text()
result=dict(scope='THREE_BOUNDED_FOLD_RULINGS_STATIC_ONLY',rulingsSha256=h(A/'rulings.md'),originalSourceReviewSha256=h(A/'review.md'),checkpointSha256=h(D/'CHECKPOINT.md'),atomicManifestSha256=h(D/'atomic-manifest.json'),clientSha256=h(D/'final-candidates'/client_path),ordinaryDispatchPublicConstructorsByteExact=2,ordinaryRunJobSendByteExact=True,guidedSetupBodyTokensExactUnderTwoFieldPorts=True,validationConstructorGuardsTokensExact=True,crossPackageConstructorPorts=callmap,setupClients={'guided':'one new actual client; inactive references alias it','validation':'zero new clients; exact supplied object retained'},validationCanonicalPayloadCapTokenBudgetOrder=True,observerPackagePrivate=True,ts=ts,rtCurrentSha256=h(rt),rtCandidateSha256=h(rt_candidate),prospectiveScanFiles=count,currentPositiveControlMatches=len(positive),prospectiveInterimHits=hits,originalFinalCommand=command,atomicOwnershipPaths=37,rtPathExcludedFromFold=True,metadataFixIndependentAcceptance='REQUIRED_SEPARATELY',nativeCompilerRuntimeExecuted=False,sourceApplied=False,rootAdoptionRequired=True)
(O/'audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))

from pathlib import Path
import json,hashlib,re,difflib,shutil
ROOT=Path.cwd();OUT=Path(__file__).parent;EARLY=OUT.parent;PREP=EARLY/'fold-prep-draft/resume2';INPUT=OUT/'virtual-pre-final';FINAL=OUT/'final-candidates'
base='backend/src/main/java/com/citi/put/checks/studio/';test='backend/src/test/java/com/citi/put/checks/studio/'
plan=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v7.json').read_text())
main=plan['resolvedAliases']['FOLD_PREP_MAIN'];testops=plan['resolvedAliases']['FOLD_TESTS'];origtests=[r for r in testops if not r['path'].endswith('/PublicationGrantClockIT.java')];assert len(origtests)==21
projector=base+'guided/publication/GuidedPublicationResultProjector.java'
legacy=[base+'guided/bridge/GuidedRunnerClient.java',base+'guided/publication/ObservedValidationClient.java',base+'guided/publication/GuidedPublicationAuthorization.java']
clock=test+'guided/publication/PublicationGrantClockIT.java';shared=test+'guided/bridge/support/GuidedBridgeFixture.java'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
provenance={};sources={}
def setinput(rel,source,owner,status='PREPARED_NOT_RUNTIME_RELEASED'):
 assert source.exists(),source
 sources[rel]=source;provenance[rel]={'source':str(source.relative_to(ROOT)),'sha256':sha(source),'owner':owner,'runtimeBaton':status,'mode':oct(source.stat().st_mode & 0o777)}
for rel in main+[r['path'] for r in testops]+legacy+[projector,test+'dispatch/DispatchAuthorizationIT.java',test+'dispatch/HttpRunnerDispatchClientTest.java']:
 source=PREP/'tree'/rel
 setinput(rel,source if source.exists() else ROOT/rel,'11-FOLD-prep' if source.exists() else 'S011 unchanged source','PREPARED_NOT_RUNTIME_RELEASED' if source.exists() else 'READ_ONLY_S011')
for rel in [projector,test+'guided/session/GuidedSessionIT.java']:
 setinput(rel,EARLY/'gsm-b-draft/resume3/repo'/rel,'11-GS-M(b) reviewed forwarded Java')
for rel in [test+'guided/bridge/GuidedBridgeIntegrationTest.java',test+'guided/bridge/GuidedBridgePlannedIT.java',shared]:
 setinput(rel,EARLY/'gs-t2-draft/resume2/candidates'/rel,'11-GS-T2 corrected')
for rel in [test+'guided/session/GuidedServiceTransportFaultIT.java',test+'guided/session/GuidedEvidencePendingAppendJoinedIT.java',test+'guided/translation/GuidedPlanningIntegrationTest.java',test+'guided/translation/GuidedFocusMutationJoinedIT.java']:
 setinput(rel,EARLY/'it-s-draft/resume2/repo'/rel,'11-IT-S corrected four owned ports')
replay=test+'guided/publication/GuidedPublicationReplayIT.java';setinput(replay,EARLY/'it-r-draft/resume2/stages/04-b4/repo'/replay,'11-IT-R fullB4 prospective, no carry selected')
assert provenance[replay]['sha256']=='98aec4f908d92c89a5d50155e35702eb8b8e3c98270d82655f212b328ca0e42c'
left=[]
for folder in ['left-main-draft/repo','left-data-draft/resume2/repo']:
 for p in (EARLY/folder).rglob('*'):
  if p.is_file():
   rel=str(p.relative_to(EARLY/folder));left.append(rel);assert rel not in sources,('LEFT collision',rel)
   setinput(rel,p,'LEFT passthrough, outside FOLD ownership')
# The reviewed GSM main service remains unchanged by fold and cannot be restored from S011.
rel=base+'guided/session/GuidedSessionService.java';setinput(rel,EARLY/'gsm-b-draft/resume3/repo'/rel,'11-GS-M(b) main passthrough')
for rel,p in sources.items():
 target=INPUT/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
 target=FINAL/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
(OUT/'input-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
(OUT/'ownership-before-authoring.json').write_text(json.dumps({'plan':'v7','main17':main,'original21TestOperations':origtests,'clockCleanupAdditional':clock,'projectorBaton':projector,'delete3Main':legacy,'newTestObserver':test+'dispatch/DispatchTestAccess.java','LEFTPassthroughNoOverlap':left,'runtimeBatonsReleased':False},indent=2)+'\n')

def read(rel):return (FINAL/rel).read_text()
def write(rel,s):p=FINAL/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
def matching(s,start,opening='(',closing=')'):
 depth=0;state='normal';i=start
 while i<len(s):
  c=s[i];n=s[i:i+2]
  if state=='line':
   if c=='\n':state='normal'
  elif state=='block':
   if n=='*/':state='normal';i+=1
  elif state in ['string','char']:
   if c=='\\':i+=1
   elif c==('"' if state=='string' else "'"):state='normal'
  elif n=='//':state='line';i+=1
  elif n=='/*':state='block';i+=1
  elif c=='"':state='string'
  elif c=="'":state='char'
  elif c==opening:depth+=1
  elif c==closing:
   depth-=1
   if depth==0:return i
  i+=1
 raise AssertionError('unbalanced')
def remove_ctor(s,name,predicate):
 spans=[]
 for m in re.finditer(r'  public '+name+r'\(',s):
  close=matching(s,s.index('(',m.start()));brace=s.index('{',close);end=matching(s,brace,'{','}')+1
  if predicate(s[m.start():close]):spans.append((m.start(),end))
 for a,b in reversed(spans):s=s[:a]+s[b:]
 return s
# Final producer composition: remove old-active beans atomically, not merely their registration names.
for rel in [base+'guided/publication/GuidedPublicationConfiguration.java',base+'guided/publication/ObservedReplayConfiguration.java',base+'guided/session/GuidedSessionConfiguration.java']:
 write(rel,(PREP/'proposed-final-wiring'/rel).read_text())
rel=base+'guided/publication/GuidedPublicationConfiguration.java';s=read(rel)
for marker in ['  @Bean\n  GuidedPublicationAuthorization publicationAuthorization(', '  @Bean\n  ObservedValidationClient observedValidationClient(']:
 a=s.index(marker);b=s.index('  @Bean',a+len(marker));s=s[:a]+s[b:]
s=s.replace('GuidedPublicationAuthorization authorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization');write(rel,s)
rel=base+'guided/session/GuidedSessionConfiguration.java';s=read(rel);a=s.index('  @Bean\n  @org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(');b=s.index('  @Bean\n  com.citi.put.checks.studio.guided.bridge.GuidedDispatchService',a);s=s[:a]+s[b:];write(rel,s)
# Remove temporary old-type constructor plumbing; one dispatcher operation algorithm remains.
rel=base+'guided/bridge/GuidedDispatchService.java';s=read(rel);s=remove_ctor(s,'GuidedDispatchService',lambda x:'GuidedRunnerClient runner' in x)
a=s.index('  @FunctionalInterface');b=s.index('  private com.citi.put.checks.studio.dispatch.StudioReferenceResolver references;',a)
s=s[:a]+'  private final com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient runner;\n'+s[b:]
s=re.sub(r'    this.sender2 = runner::send;\n    this.sender3 = runner::send;\n    this.sender4 = runner::send;\n    this.secretSender = runner::sendSecret;', '    this.runner = runner;',s)
a=s.index('  private JsonNode send(');b=s.index('  public void installReferences(',a);s=s[:a]+s[b:]
s=re.sub(r'(?<![\w.])send\(', 'runner.send(',s).replace('secretSender.send(', 'runner.sendSecret(');write(rel,s)
rel=base+'guided/publication/GuidedPlanPublisher.java';s=read(rel);s=remove_ctor(s,'GuidedPlanPublisher',lambda x:'ObservedValidationClient' in x)
a=s.index('  @FunctionalInterface');b=s.index('  private final GuidedSessionAccess access;',a)
s=s[:a]+'''  private final com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient validator;
  private final com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization;
'''+s[b:]
s=s.replace('''    this.validator = (request, budget) -> validator.validate(request, budget,
        properties.maxValidationBytes(), properties.validationTimeoutMs());
    this.grantAuthority = authorization::authorizePublication;
    this.receiptAuthority = authorization::authorizeReceiptRead;''','''    this.validator = validator;
    this.authorization = authorization;''')
s=s.replace('receiptAuthority.authorizeReceiptRead(', 'authorization.authorizeReceiptRead(').replace('grantAuthority.authorizePublication(', 'authorization.authorizePublication(')
s=s.replace('outgoing, new PublicationBudget(attempt.validationDeadline(), clock));','outgoing, new PublicationBudget(attempt.validationDeadline(), clock),\n                  properties.maxValidationBytes(), properties.validationTimeoutMs());');write(rel,s)
rel=base+'guided/publication/ObservedReplayAuthorizer.java';s=read(rel);s=remove_ctor(s,'ObservedReplayAuthorizer',lambda x:'GuidedPublicationAuthorization' in x)
a=s.index('  @FunctionalInterface');b=s.index('  private final ObservedReplayProperties properties;',a)
s=s[:a]+'  private final com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization;\n'+s[b:];s=s.replace('this.authorization = authorization::fresh;', 'this.authorization = authorization;');write(rel,s)
rel=projector;s=read(rel).replace('GuidedPublicationAuthorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization');write(rel,s)
# Explicit proposed operation setup constructors, one algorithm per operation, no observer visibility change.
rel=base+'dispatch/HttpRunnerDispatchClient.java';s=read(rel)
s=s.replace('  private HttpClient validationClient;', '  private HttpClient validationClient;\n  private URI validationOrigin;\n  private java.util.function.Supplier<String> validationToken;')
s=s.replace('    this.runner = runner;', '    this.runner = runner;\n    this.validationOrigin = runner != null && runner.isConfigured() ? URI.create(runner.baseUrl()) : null;\n    this.validationToken = () -> runner == null ? null : runner.serviceIdentityToken();',1)
s=s.replace('''    require(contracts != null, "RUNTIME_INCOMPATIBLE", 409);
    URI endpoint = runner != null && runner.isConfigured() ? URI.create(runner.baseUrl()).resolve("/v2/validate-observed") : null;''','''    require(contracts != null, "RUNTIME_INCOMPATIBLE", 409);
    URI endpoint = validationOrigin == null ? null : validationOrigin.resolve("/v2/validate-observed");''')
s=s.replace('(URI.create(runner.baseUrl()).getPath().isEmpty() || URI.create(runner.baseUrl()).getPath().equals("/"))','(validationOrigin.getPath().isEmpty() || validationOrigin.getPath().equals("/"))')
s=s.replace('String credential = runner.serviceIdentityToken();', 'String credential = validationToken.get();')
# initializeGuided raw context overload delegates through same exact implementation as deployed setup.
needle='''  private void initializeGuided(URI origin, StudioRunnerTls tls,
      java.util.function.Supplier<String> token, GuidedContracts contracts) {'''
replacement='''  private void initializeGuided(URI origin, StudioRunnerTls tls,
      java.util.function.Supplier<String> token, GuidedContracts contracts) {
    initializeGuided(origin, tls.sslContext(), token, contracts);
  }

  private void initializeGuided(URI origin, javax.net.ssl.SSLContext tls,
      java.util.function.Supplier<String> token, GuidedContracts contracts) {'''
assert needle in s;s=s.replace(needle,replacement).replace('HttpClient.newBuilder().sslContext(tls.sslContext())','HttpClient.newBuilder().sslContext(tls)')
constructors='''
  /** Explicit guided operation setup; deployed composition remains the TLS constructor above. */
  public HttpRunnerDispatchClient(URI origin, javax.net.ssl.SSLContext tls,
      java.util.function.Supplier<String> token, GuidedContracts contracts) {
    this(new ObjectMapper(), new StudioExecutionProperties(null, null, null, null, null, null, null, null, null, null, null),
        new StudioRunnerProperties(null, null, null));
    initializeGuided(origin, tls, token, contracts);
  }

  /** Explicit validation operation setup; limits are still supplied on each validate call. */
  public HttpRunnerDispatchClient(URI origin, HttpClient client,
      java.util.function.Supplier<String> token, GuidedContracts contracts) {
    this(new ObjectMapper(), new StudioExecutionProperties(null, null, null, null, null, null, null, null, null, null, null),
        new StudioRunnerProperties(null, null, null));
    require(origin == null || origin.getHost() != null && origin.getUserInfo() == null
        && origin.getQuery() == null && origin.getFragment() == null
        && (origin.getPath().isEmpty() || origin.getPath().equals("/"))
        && (origin.getScheme().equals("https") || origin.getScheme().equals("http")),
        "RUNTIME_INCOMPATIBLE", 409);
    require(client.followRedirects() == HttpClient.Redirect.NEVER
        && !Boolean.getBoolean("jdk.httpclient.enableAllMethodRetry"), "RUNTIME_INCOMPATIBLE", 409);
    this.validationOrigin = origin;
    this.validationClient = client;
    this.validationToken = token;
    this.contracts = contracts;
  }
'''
s=s[:s.rfind('\n}')]+constructors+s[s.rfind('\n}'):];write(rel,s)
# Main textual residue and stale imports. Do not delete public dispatch constructors.
for rel in main+[projector]:
 s=read(rel).replace('GuidedRunnerClient','HttpRunnerDispatchClient').replace('ObservedValidationClient','HttpRunnerDispatchClient').replace('GuidedPublicationAuthorization','DispatchAuthorization')
 # trim only imports whose simple name no longer occurs outside that import.
 for line in list(s.splitlines(keepends=True)):
  if line.startswith('import ') and not line.startswith('import static '):
   simple=line.strip().split('.')[-1].rstrip(';')
   if len(re.findall(r'\b'+re.escape(simple)+r'\b',s))==1:s=s.replace(line,'',1)
 write(rel,s)
# Java expression argument splitter for constructor/call migration, preserving all existing expressions.
def splitargs(s,a,b):
 spans=[];start=a;i=a
 while i<b:
  if s[i] in '([{':
   i=matching(s,i,s[i],{'(':')','[':']','{':'}'}[s[i]])
  elif s[i]=='"':
   i+=1
   while i<b and s[i]!='"':i+=2 if s[i]=='\\' else 1
  elif s[i]==',':spans.append((start,i));start=i+1
  i+=1
 spans.append((start,b));return spans
bounds=[]
for record in origtests:
 rel=record['path']
 if record['operation']=='delete':continue
 s=read(rel)
 # Existing explicit validation constructor settings remain identical; properties move to call arguments.
 edits=[]
 for m in re.finditer(r'new ObservedValidationClient\s*\(',s):
  a=s.index('(',m.start());b=matching(s,a);args=splitargs(s,a+1,b);assert len(args)==5
  prop=s[args[4][0]:args[4][1]].strip();prefix=s[max(0,m.start()-120):m.start()];var=re.search(r'(\w+)\s*=\s*$',prefix).group(1)
  pm=re.search(r'new GuidedPublicationProperties\((.*)\)',prop,re.S);assert pm,(rel,prop)
  pa=splitargs(pm[1],0,len(pm[1]));values=[pm[1][x:y].strip() for x,y in pa]
  bounds.append({'path':rel,'receiver':var,'originalPropertiesExpression':prop,'maxValidationBytes':values[4],'validationTimeoutMs':values[2]})
  edits.append((args[3][1],b,'')) # remove comma+fifth expression only
 for a,b,t in reversed(edits):s=s[:a]+t+s[b:]
 # global types, plus precise source package changes.
 s=s.replace('com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient').replace('com.citi.put.checks.studio.guided.publication.ObservedValidationClient','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient').replace('com.citi.put.checks.studio.guided.publication.GuidedPublicationAuthorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization')
 s=s.replace('GuidedRunnerClient','HttpRunnerDispatchClient').replace('ObservedValidationClient','HttpRunnerDispatchClient')
 if rel.endswith('ObservedGrantClockIT.java'):s=s.replace('GuidedPublicationAuthorization','PublicationGrantAuthority')
 else:s=s.replace('GuidedPublicationAuthorization','DispatchAuthorization')
 needed=[]
 if 'HttpRunnerDispatchClient' in s and not '/dispatch/' in rel:needed.append('com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient')
 if 'DispatchAuthorization' in s:needed.append('com.citi.put.checks.studio.dispatch.DispatchAuthorization')
 for imp in needed:
  line='import '+imp+';'
  if line not in s:s=s.replace('\n\n','\n\n'+line+'\n',1)
 # Redirect only non-dispatch-package observer calls through the test-side accessor.
 if '/dispatch/' not in rel:
  s=re.sub(r'(\w+)\.observeRequestBytes\(([^;]+)\);',r'DispatchTestAccess.observeRequestBytes(\1, \2);',s)
  if 'DispatchTestAccess.' in s and 'import com.citi.put.checks.studio.dispatch.DispatchTestAccess;' not in s:s=s.replace('\n\n','\n\nimport com.citi.put.checks.studio.dispatch.DispatchTestAccess;\n',1)
 # Validation per-call limits use exact old per-test constructor settings.
 if rel.endswith('ObservedArtifactLowererTest.java'):
  for receiver,maxbytes,timeout in [('client','8388608','15000'),('tight','1','15000')]:
   edits=[]
   for m in re.finditer(r'\b'+receiver+r'\.validate\s*\(',s):
    a=s.index('(',m.start());b=matching(s,a);args=splitargs(s,a+1,b)
    if len(args)==2:edits.append((b,', '+maxbytes+', '+timeout))
   for at,t in reversed(edits):s=s[:at]+t+s[at:]
 if rel==replay:
  s=s.replace('validator.validate(outgoing, budget)', 'validator.validate(outgoing, budget,\n                    ownedApplicationContext.getBean(GuidedPublicationProperties.class).maxValidationBytes(),\n                    ownedApplicationContext.getBean(GuidedPublicationProperties.class).validationTimeoutMs())')
  # R-C5 authority diagnostic points to collaborator executing the same actual fresh checks.
  s=s.replace('com.citi.put.checks.studio.dispatch.DispatchAuthorization"','com.citi.put.checks.studio.guided.publication.PublicationGrantAuthority"')
 if rel.endswith('RunnerTlsClientCertIT.java'):
  s=s.replace('field(bridge, "client")','field(bridge, "guidedClient")').replace('field(validation, "client")','field(validation, "validationClient")')
 # Collapse duplicate identical import lines only (two former classes now share one folded class).
 lines=s.splitlines(keepends=True);seen=set();out=[]
 for line in lines:
  if line.startswith('import '):
   if line in seen:continue
   seen.add(line)
  out.append(line)
 write(rel,''.join(out))
(OUT/'validation-constructor-call-map.json').write_text(json.dumps(bounds,indent=2)+'\n')
# Exact ClockIT cleanup from prepared baton, assertions/scope unchanged.
write(clock,(PREP/'final-clock-test-baton'/clock).read_text())
observer=test+'dispatch/DispatchTestAccess.java';write(observer,'''package com.citi.put.checks.studio.dispatch;

/** Test-only access to the package-private owned-byte observer; no production SPI is added. */
public final class DispatchTestAccess {
  private DispatchTestAccess() {}

  public static void observeRequestBytes(HttpRunnerDispatchClient client,
      java.util.function.Consumer<byte[]> observer) {
    client.observeRequestBytes(observer);
  }
}
''')
# Delete retirement operations from final tree only; keep preimages for complete atomic deletion patch.
for rel in legacy+[r['path'] for r in origtests if r['operation']=='delete']:(FINAL/rel).unlink()
# Two metadata-only proposed runner-test ownership additions; RT source remains a separate owner's baton.
tsmap=[]
for rel in ['studio-runner/test/fixtures-tier/guidedCloseBound.test.ts','studio-runner/test/guided/runtime.test.ts']:
 setinput(rel,ROOT/rel,'PROPOSED FOLD-final TS metadata-only addition','PROPOSED_NOT_ADOPTED');p=INPUT/rel;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/rel,p)
 old=(ROOT/rel).read_text();new=old.replace('GuidedRunnerClient','HttpRunnerDispatchClient');assert old!=new
 write(rel,new);tsmap.append({'path':rel,'oldSha256':hashlib.sha256(old.encode()).hexdigest(),'newSha256':hashlib.sha256(new.encode()).hexdigest(),'oldLines':[x for x in old.splitlines() if 'GuidedRunnerClient' in x],'newLines':[x for x in new.splitlines() if 'HttpRunnerDispatchClient' in x],'ownership':'PROPOSED_REQUIRES_ROOT_ARIA_QA_ADOPTION'})
(OUT/'ts-metadata-proposals.json').write_text(json.dumps(tsmap,indent=2)+'\n')
(OUT/'input-provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print('Authored complete prospective final tree and deletions, based on prepared incoming versions; runtime unverified')

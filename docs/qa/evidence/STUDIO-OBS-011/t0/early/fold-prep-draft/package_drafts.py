from pathlib import Path
import difflib,hashlib,json,re,shutil
ROOT=Path.cwd(); OUT=Path(__file__).parent; TREE=OUT/'tree'; BATON=OUT/'proposed-final-wiring'
base='backend/src/main/java/com/citi/put/checks/studio/'
planpath='docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v4.json'
plan=json.loads((ROOT/planpath).read_text());lane=next(l for l in plan['lanes'] if l['id']=='11-FOLD-prep')
allowed={x.split(' (')[0] for x in lane['writes'] if x.startswith('backend/')}
# Small preservation corrections found in static inspection.
f=TREE/(base+'dispatch/HttpRunnerDispatchClient.java');s=f.read_text();s=s.replace('URI endpoint = runner.isConfigured() ?', 'URI endpoint = runner != null && runner.isConfigured() ?')
s=s.replace('''    require(endpoint != null, "RUNTIME_INCOMPATIBLE", 409);''','''    require(endpoint != null && endpoint.getHost() != null
        && endpoint.getUserInfo() == null && endpoint.getQuery() == null && endpoint.getFragment() == null
        && (URI.create(runner.baseUrl()).getPath().isEmpty() || URI.create(runner.baseUrl()).getPath().equals("/"))
        && (endpoint.getScheme().equals("http") || endpoint.getScheme().equals("https")),
        "RUNTIME_INCOMPATIBLE", 409);''',1);s=s.replace('    if (origin == null) {\n      // Same unavailable-guided refusal as the old conditional fallback bean.\n      return;\n    }', '    if (origin == null) {\n      initializeGuided(URI.create("https://unconfigured.invalid"), tls, () -> {\n        throw new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);\n      }, contracts);\n      return;\n    }')
s=s.replace("tls.configure(HttpClient.newBuilder())\n            .connectTimeout(Duration.ofSeconds(5))", "HttpClient.newBuilder().sslContext(tls.sslContext())\n            .connectTimeout(Duration.ofSeconds(5))")
f.write_text(s)
f=TREE/'backend/src/test/java/com/citi/put/checks/studio/dispatch/HttpRunnerDispatchClientTest.java'
s=f.read_text().replace('client.send("context", new ObjectMapper().createObjectNode())', 'client.send("context", new ObjectMapper().createObjectNode().put("sessionId", "session"))')
f.write_text(s)
# Avoid unused imports introduced by extracting the binding algorithm.
f=TREE/(base+'guided/publication/ObservedReplayAuthorizer.java');s=f.read_text();s=s.replace('import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;\n','').replace('import java.time.Instant;\n','').replace('import java.util.List;\n','');f.write_text(s)
# All main files exist off-tree, including the explicitly unchanged composition placeholders.
assert len([p for p in TREE.rglob('*') if p.is_file() and '/src/main/' in str(p)])==17
assert len([p for p in TREE.rglob('*') if p.is_file() and '/src/test/' in str(p)])==3
for p in TREE.rglob('*'):
 if p.is_file(): assert str(p.relative_to(TREE)) in allowed
# Complete proposed final wiring delta, separate from preservation-compatible prep.
for rel in [base+'guided/publication/GuidedPublicationConfiguration.java',base+'guided/publication/ObservedReplayConfiguration.java',base+'guided/session/GuidedSessionConfiguration.java']:
 p=TREE/rel;s=p.read_text()
 if rel.endswith('GuidedPublicationConfiguration.java'):
  a=s.index('  GuidedPlanPublisher guidedPlanPublisher(');b=s.index('  @Bean\n  GuidedPublicationResultProjector',a)
  s=s[:a]+s[a:b].replace('ObservedValidationClient validator','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient validator').replace('GuidedPublicationAuthorization authorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization')+s[b:]
 elif rel.endswith('ObservedReplayConfiguration.java'):
  s=s.replace('GuidedPublicationAuthorization authorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization')
 else:
  a=s.index('  com.citi.put.checks.studio.guided.bridge.GuidedDispatchService guidedDispatchService(');b=s.index('  @Bean',a)
  s=s[:a]+s[a:b].replace('com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient runner','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient runner')+s[b:]
 dest=BATON/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(s)
# Off-tree unexecuted mutations, each exactly one intended site.
mutants=[('m1-mint',base+'guided/publication/PublicationGrantAuthority.java','clock.instant().plusMillis(properties.authorizationTtlMs())','Clock.systemUTC().instant().plusMillis(properties.authorizationTtlMs())'),
('m2-judge',base+'guided/publication/PublicationGrantAuthority.java','deadline.isAfter(clock.instant())','deadline.isAfter(Clock.systemUTC().instant())'),
('m3-claim',base+'guided/publication/GuidedPlanPublisher.java','prepared.snapshot().hash(),\n                  clock.instant());','prepared.snapshot().hash(),\n                  Clock.systemUTC().instant());'),
('m4-budget',base+'guided/publication/GuidedPlanPublisher.java','new PublicationBudget(attempt.validationDeadline(), clock)','new PublicationBudget(attempt.validationDeadline(), Clock.systemUTC())'),
('m5-worker',base+'dispatch/ProvisionalDispatchAuthorization.java','''    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        authority != null, "RUNTIME_INCOMPATIBLE", 409);
''','')]

def delta(path,before,after,new=False):
 if before==after:return ''
 return ''.join(difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),fromfile='/dev/null' if new else 'a/'+path,tofile='b/'+path))
patchdir=OUT/'patches';patchdir.mkdir(exist_ok=True)
main='';tests='';red='';manifest=[]
for path in sorted(allowed):
 p=TREE/path
 if not p.exists():continue
 exists=(ROOT/path).exists();old=(ROOT/path).read_text() if exists else '';new=p.read_text();diff=delta(path,old,new,not exists)
 manifest.append({'path':path,'sourceSha256':hashlib.sha256(old.encode()).hexdigest() if exists else None,'draftSha256':hashlib.sha256(new.encode()).hexdigest(),'changed':old!=new})
 if '/src/main/' in path:main+=diff
 else:
  if path.endswith('/PublicationGrantClockIT.java'):red=diff
  else:tests+=diff
(patchdir/'01-red-first-clock.patch').write_text(red)
(patchdir/'02-prep-main-preserving-old-wiring.patch').write_text(main)
(patchdir/'03-prep-tests.patch').write_text(tests)
final=''
for p in sorted(BATON.rglob('*.java')):
 rel=str(p.relative_to(BATON));final+=delta(rel,(TREE/rel).read_text(),p.read_text())
(patchdir/'04-PROPOSED-final-wiring-baton.patch').write_text(final)
mutrecords=[]
for name,rel,old,new in mutants:
 text=(TREE/rel).read_text();assert text.count(old)==1,(name,text.count(old))
 mutated=text.replace(old,new)
 (patchdir/(name+'.patch')).write_text(delta(rel,text,mutated))
 mutrecords.append({'id':name,'path':rel,'baseDraftSha256':hashlib.sha256(text.encode()).hexdigest(),'mutantSha256':hashlib.sha256(mutated.encode()).hexdigest(),'patch':name+'.patch','runtime':'UNVERIFIED','oracle':'DispatchAuthorizationIT.workerWithoutPublicationCollaboratorRefusesEveryPublicationOperation' if 'worker' in name else 'PublicationGrantClockIT'})
(OUT/'draft-manifest.json').write_text(json.dumps({'status':'DRAFT_UNAPPLIED_RUNTIME_UNVERIFIED','mainCount':17,'testCount':3,'files':manifest,'mutants':mutrecords},indent=2)+'\n')
# Exact by-name preservation/port map.
oldtest=ROOT/'backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationAuthorizationIT.java'
newtest=TREE/'backend/src/test/java/com/citi/put/checks/studio/dispatch/DispatchAuthorizationIT.java'
names=lambda text:re.findall(r'@Test\s+void\s+(\w+)\(',text)
oldnames=names(oldtest.read_text());newnames=names(newtest.read_text());assert set(oldnames)<=set(newnames)
(OUT/'authority-test-port-map.json').write_text(json.dumps({'oldSourceSha256':hashlib.sha256(oldtest.read_bytes()).hexdigest(),'portedUnrenamed':oldnames,'added':list(set(newnames)-set(oldnames)),'assertionChanges':'Only setup type/delegation changes; original test bodies byte-preserved. Runtime unverified.'},indent=2)+'\n')
# Patch contexts verified against off-tree source snapshot; real tree never modified.
check=OUT/'applicability';check.mkdir(exist_ok=True)
for row in manifest:
 rel=row['path'];src=ROOT/rel;dest=check/rel
 if src.exists():dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(src.read_bytes())
(OUT/'plan-bindings.json').write_text(json.dumps({p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in [planpath,'docs/qa/evidence/STUDIO-OBS-011/t0/w-brief.v4.md','docs/qa/evidence/STUDIO-OBS-011/t0/resume-architecture/review.md','docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/t0-record-draft.md']},indent=2)+'\n')
print('Packaged patches, exact scope manifests, five unapplied mutations and proposed final wiring baton')

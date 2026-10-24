"""Off-tree draft generator; never writes outside this receipt directory."""
from pathlib import Path
import hashlib,json,difflib,re
ROOT=Path.cwd(); OUT=Path(__file__).parent; TREE=OUT/'tree'
base='backend/src/main/java/com/citi/put/checks/studio/'
plan=json.loads((ROOT/'docs/qa/evidence/STUDIO-OBS-011/t0/lanes.v4.json').read_text())
lane=next(l for l in plan['lanes'] if l['id']=='11-FOLD-prep')
allowed={x.split(' (')[0] for x in lane['writes'] if x.startswith('backend/')}
inputs={}
def read(path):
 p=ROOT/path; data=p.read_bytes(); inputs[path]=hashlib.sha256(data).hexdigest(); return data.decode()
def load(path): return read(base+path)
def write(path,data):
 assert path in allowed,path
 p=TREE/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(data)
def save(path,data):write(base+path,data)
# Fold transport algorithms, keeping operation-specific settings.
h=load('dispatch/HttpRunnerDispatchClient.java');g=load('guided/bridge/GuidedRunnerClient.java');v=load('guided/publication/ObservedValidationClient.java')
h=h.replace('import com.citi.put.checks.studio.StudioExecutionProperties;', '''import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.publication.PublicationBudget;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import org.springframework.transaction.support.TransactionSynchronizationManager;''')
h=h.replace('  private StudioDispatchMetrics metrics;', '''  private StudioDispatchMetrics metrics;
  private HttpClient validationClient;
  private HttpClient guidedClient;
  private URI guidedOrigin;
  private java.util.function.Supplier<String> token;
  private GuidedContracts contracts;''')
needle='''            .connectTimeout(properties.admissionTimeoutOrDefault())
            .build();'''
h=h.replace(needle,needle+'''
    this.validationClient = builder
        .connectTimeout(runner.connectTimeout() == null ? Duration.ofSeconds(2) : runner.connectTimeout())
        .version(HttpClient.Version.HTTP_1_1)
        .build();''',1)
start=g.index('  /**\n   * STUDIO-OBS-014');stop=g.index('  private final URI origin;')
constants=g[start:stop].replace('LOG =','GUIDED_LOG =').replace('LoggerFactory.getLogger(GuidedRunnerClient.class)','LoggerFactory.getLogger(HttpRunnerDispatchClient.class)')
start=g.index('  public JsonNode send(String operation');methods=g[start:g.rfind('\n}')]
methods=methods.replace('  private java.util.function.Consumer<byte[]> requestBytesObserver;\n\n  void observeRequestBytes(java.util.function.Consumer<byte[]> observer) {\n    this.requestBytesObserver = observer;\n  }\n\n','')
methods=methods.replace('origin.resolve(', 'guidedOrigin.resolve(').replace('          client.sendAsync(', '          guidedClient.sendAsync(').replace('    LOG.warn(', '    GUIDED_LOG.warn(')
# Preserve absence refusal before all serialization.
methods=methods.replace('    long deadline = transportDeadline(callerDeadline);','''    require(guidedClient != null && contracts != null, "RUNTIME_INCOMPATIBLE", 409);
    long deadline = transportDeadline(callerDeadline);''')
ctor=g[g.index('    require(\n        origin.getScheme()'):g.index('\n  public JsonNode send(String operation')]
ctor=ctor[:ctor.rfind('\n  }')].replace('    this.origin = origin;','    this.guidedOrigin = origin;').replace('    this.client =','    this.guidedClient =').replace('HttpClient.newBuilder()\n            .sslContext(tls)','tls.configure(HttpClient.newBuilder())')
initializers='''
  /** Explicit operation setup for test doubles; deployed setup uses the same TLS identity. */
  public HttpRunnerDispatchClient(ObjectMapper mapper, StudioExecutionProperties execution,
      StudioRunnerProperties runner, StudioRunnerTls tls, GuidedContracts contracts,
      URI origin, java.util.function.Supplier<String> token) {
    this(mapper, execution, runner, tls);
    initializeGuided(origin, tls, token, contracts);
  }

  @Autowired
  void initializeOperations(StudioRunnerTls tls, GuidedContracts contracts,
      org.springframework.core.env.Environment environment) {
    this.contracts = contracts;
    String origin = environment.getProperty("studio.guided-authoring.runner-origin");
    if (origin == null) {
      // Same unavailable-guided refusal as the old conditional fallback bean.
      return;
    }
    String tokenFile = environment.getRequiredProperty("studio.guided-authoring.controller-token-file");
    initializeGuided(URI.create(origin), tls, () -> {
      try {
        return java.nio.file.Files.readString(java.nio.file.Path.of(tokenFile)).strip();
      } catch (IOException failure) {
        throw new GuidedSessionException("UNAUTHENTICATED", 401);
      }
    }, contracts);
  }

  private void initializeGuided(URI origin, StudioRunnerTls tls,
      java.util.function.Supplier<String> token, GuidedContracts contracts) {
'''+ctor+'\n  }\n'
validate=v[v.index('  public JsonNode validate('):v.rfind('\n}')]
validate=validate.replace('validate(JsonNode request, PublicationBudget budget)', 'validate(JsonNode request, PublicationBudget budget, int maxValidationBytes, long validationTimeoutMs)')
validate=validate.replace('    require(\n        !Transaction', '''    require(contracts != null, "RUNTIME_INCOMPATIBLE", 409);
    URI endpoint = runner.isConfigured() ? URI.create(runner.baseUrl()).resolve("/v2/validate-observed") : null;
    require(!Boolean.getBoolean("jdk.httpclient.enableAllMethodRetry"), "RUNTIME_INCOMPATIBLE", 409);
    require(
        !Transaction''',1).replace('properties.maxValidationBytes()','maxValidationBytes').replace('properties.validationTimeoutMs()','validationTimeoutMs').replace('String credential = token.get();','String credential = runner.serviceIdentityToken();').replace('          client.send(', '          validationClient.send(')
h=h[:h.rfind('\n}')]+ '\n'+constants+initializers+validate+'\n'+methods+'\n}\n';save('dispatch/HttpRunnerDispatchClient.java',h)
# Sole validation point: keep TLS Wiring enforcement; remove shape-only sentinel.
c=load('dispatch/StudioRunnerConfiguration.java')
c=re.sub(r'\n  @Bean\n  StudioRunnerValidated studioRunnerValidated\([\s\S]*?\n  }','',c)
c=re.sub(r'\n  (?:public )?(?:static )?(?:final )?(?:class|record) StudioRunnerValidated[\s\S]*?\n  }','',c)
save('dispatch/StudioRunnerConfiguration.java',c)
tls=load('dispatch/StudioRunnerTls.java').replace('or for {@code\n   * GuidedRunnerClient}\'s constructor.', 'or for the folded guided transport.')
save('dispatch/StudioRunnerTls.java',tls)
# New authority algorithm identical except the four deliberately identified clock wires.
a=load('guided/publication/GuidedPublicationAuthorization.java')
a=a.replace('GuidedPublicationAuthorization','PublicationGrantAuthority')
save('guided/publication/PublicationGrantAuthority.java',a)
d=load('dispatch/DispatchAuthorization.java')
# defaults preserve existing lambdas and implementors outside the exact prep write set.
marker='  /** The dispatcher observed'
methods='''  default com.citi.put.checks.security.BffAuthenticationToken fresh(
      org.springframework.security.core.Authentication caller,
      jakarta.servlet.http.HttpServletRequest request,
      String expectedPrincipal, String csiId, boolean execution) {
    throw new com.citi.put.checks.studio.guided.session.GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
  }

  default com.citi.put.checks.studio.guided.publication.PublicationContracts.Grant authorizePublication(
      org.springframework.security.core.Authentication caller,
      jakarta.servlet.http.HttpServletRequest request,
      com.citi.put.checks.studio.guided.publication.PublicationContracts.Snapshot snapshot,
      com.fasterxml.jackson.databind.JsonNode currentSession) {
    throw new com.citi.put.checks.studio.guided.session.GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
  }

  default void authorizeReceiptRead(org.springframework.security.core.Authentication caller,
      jakarta.servlet.http.HttpServletRequest request,
      com.citi.put.checks.studio.guided.publication.PublicationContracts.Receipt receipt) {
    throw new com.citi.put.checks.studio.guided.session.GuidedSessionException("RUNTIME_INCOMPATIBLE", 409);
  }

'''
d=d.replace(marker,methods+marker);save('dispatch/DispatchAuthorization.java',d)
p=load('dispatch/ProvisionalDispatchAuthorization.java')
insert='''  private org.springframework.beans.factory.ObjectProvider<
      com.citi.put.checks.studio.guided.publication.PublicationGrantAuthority> publication;

  @Autowired
  public void initializePublicationAuthority(org.springframework.beans.factory.ObjectProvider<
      com.citi.put.checks.studio.guided.publication.PublicationGrantAuthority> publication) {
    this.publication = publication;
  }

  private com.citi.put.checks.studio.guided.publication.PublicationGrantAuthority publication() {
    var authority = publication == null ? null : publication.getIfAvailable();
    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        authority != null, "RUNTIME_INCOMPATIBLE", 409);
    return authority;
  }

  @Override
  public com.citi.put.checks.security.BffAuthenticationToken fresh(
      org.springframework.security.core.Authentication caller,
      jakarta.servlet.http.HttpServletRequest request,
      String expectedPrincipal, String csiId, boolean execution) {
    return publication().fresh(caller, request, expectedPrincipal, csiId, execution);
  }

  @Override
  public com.citi.put.checks.studio.guided.publication.PublicationContracts.Grant authorizePublication(
      org.springframework.security.core.Authentication caller,
      jakarta.servlet.http.HttpServletRequest request,
      com.citi.put.checks.studio.guided.publication.PublicationContracts.Snapshot snapshot,
      com.fasterxml.jackson.databind.JsonNode currentSession) {
    return publication().authorizePublication(caller, request, snapshot, currentSession);
  }

  @Override
  public void authorizeReceiptRead(org.springframework.security.core.Authentication caller,
      jakarta.servlet.http.HttpServletRequest request,
      com.citi.put.checks.studio.guided.publication.PublicationContracts.Receipt receipt) {
    publication().authorizeReceiptRead(caller, request, receipt);
  }

'''
p=p.replace('  private final StudioRepository tests;',insert+'  private final StudioRepository tests;');save('dispatch/ProvisionalDispatchAuthorization.java',p)
# Transitional private functional methods allow unchanged old constructors to compile.
pub=load('guided/publication/GuidedPlanPublisher.java')
pub=pub.replace('  private final ObservedValidationClient validator;','''  @FunctionalInterface
  private interface Validator { JsonNode validate(JsonNode request, PublicationBudget budget); }
  @FunctionalInterface
  private interface GrantAuthority {
    PublicationContracts.Grant authorizePublication(Authentication caller, HttpServletRequest request,
        PublicationContracts.Snapshot snapshot, JsonNode session);
  }
  @FunctionalInterface
  private interface ReceiptAuthority {
    void authorizeReceiptRead(Authentication caller, HttpServletRequest request, PublicationContracts.Receipt receipt);
  }
  private final Validator validator;''').replace('  private final GuidedPublicationAuthorization authorization;', '  private final GrantAuthority grantAuthority;\n  private final ReceiptAuthority receiptAuthority;')
start=pub.index('  public GuidedPlanPublisher(');end=pub.index('\n  public PublicationContracts.Receipt finalizeForUser',start)
oldctor=pub[start:end]
# Store method refs in original constructor and duplicate common constructor for new types; same unchanged operational body.
oldctor=oldctor.replace('this.validator = validator;', 'this.validator = validator::validate;').replace('this.authorization = authorization;', 'this.grantAuthority = authorization::authorizePublication;\n    this.receiptAuthority = authorization::authorizeReceiptRead;')
newctor=oldctor.replace('ObservedValidationClient validator','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient validator').replace('GuidedPublicationAuthorization authorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization').replace('this.validator = validator::validate;', '''this.validator = (request, budget) -> validator.validate(request, budget,
        properties.maxValidationBytes(), properties.validationTimeoutMs());''')
pub=pub[:start]+oldctor+'\n'+newctor+pub[end:]
pub=pub.replace('authorization.authorizeReceiptRead(', 'receiptAuthority.authorizeReceiptRead(').replace('authorization.authorizePublication(', 'grantAuthority.authorizePublication(')
save('guided/publication/GuidedPlanPublisher.java',pub)
conf=load('guided/publication/GuidedPublicationConfiguration.java')
conf=conf.replace('import java.time.Clock;\n','')
conf=conf.replace('      GuidedPublicationProperties properties) {\n    return new GuidedPublicationAuthorization(core, ownership, Clock.systemUTC(), properties);', '      GuidedPublicationProperties properties, JdbcTemplate jdbc) {\n    return new GuidedPublicationAuthorization(core, ownership, new DatabaseClock(jdbc), properties);')
# Old bean still present/wired; new only in same !worker configuration.
conf=conf.replace('  @Bean\n  ObservedValidationClient observedValidationClient(', '''  @Bean
  PublicationGrantAuthority publicationGrantAuthority(CoreServiceClient core,
      CsiOwnershipEvaluator ownership, GuidedPublicationProperties properties, JdbcTemplate jdbc) {
    return new PublicationGrantAuthority(core, ownership, new DatabaseClock(jdbc), properties);
  }

  @Bean
  ObservedValidationClient observedValidationClient(''')
# Only publisher params, never projector (baton/read-only).
s=conf.index('  GuidedPlanPublisher guidedPlanPublisher(');e=conf.index('  @Bean\n  GuidedPublicationResultProjector',s)
x=conf[s:e].replace('ObservedValidationClient validator','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient validator').replace('GuidedPublicationAuthorization authorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization').replace('ObservedReplayProperties replay)', 'ObservedReplayProperties replay, JdbcTemplate jdbc)').replace('Clock.systemUTC()', 'new DatabaseClock(jdbc)')
conf=conf[:s]+x+conf[e:];save('guided/publication/GuidedPublicationConfiguration.java',conf)
# Builder shares JSON construction; preserve different original expiry-check order by accepting flag.
auth=load('guided/publication/ObservedReplayAuthorizer.java');sched=load('guided/publication/ObservedReplayAuthorization.java')
bs=auth.index('    Instant issued =');be=auth.index('\n  }',bs)
body=auth[bs:be].replace('return new ObservedReplayAuthorization.Prepared(binding);','return new ObservedReplayAuthorization.Prepared(binding);')
body=body.replace('    UUID executionId =', '''    if (checkBeforePins) {
      ceiling = PublicationContracts.millisecond(ceiling);
      require(ceiling.isAfter(clock.instant()), "AUTHORIZATION_EXPIRED", 409);
    }
    UUID executionId =''').replace('    ceiling = PublicationContracts.millisecond(ceiling);\n    require(ceiling.isAfter(clock.instant()), "AUTHORIZATION_EXPIRED", 409);\n    ObjectNode grant =', '''    if (!checkBeforePins) {
      ceiling = PublicationContracts.millisecond(ceiling);
      require(ceiling.isAfter(clock.instant()), "AUTHORIZATION_EXPIRED", 409);
    }
    ObjectNode grant =''')
builder='''package com.citi.put.checks.studio.guided.publication;

import static com.citi.put.checks.studio.guided.publication.GuidedPlanBuilder.text;
import static com.citi.put.checks.studio.guided.session.GuidedSessionException.require;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** One binding shape for foreground and scheduled authority; never resolves secrets. */
final class ObservedReplayBindingBuilder {
  private final GuidedContracts contracts;
  private final ObservedReplayPins pins;
  private final ObservedReplayProperties properties;
  private final Clock clock;

  ObservedReplayBindingBuilder(GuidedContracts contracts, ObservedReplayPins pins,
      ObservedReplayProperties properties, Clock clock) {
    this.contracts = contracts;
    this.pins = pins;
    this.properties = properties;
    this.clock = clock;
  }

  ObservedReplayAuthorization.Prepared build(UUID testId, UUID revisionId, String principal,
      String csiId, ObjectNode verified, boolean checkBeforePins) {
'''+body+'\n  }\n}\n'
save('guided/publication/ObservedReplayBindingBuilder.java',builder)
auth=auth[:bs]+'''    return new ObservedReplayBindingBuilder(contracts, pins, properties, clock)
        .build(testId, revisionId, principal, csiId, verified, false);'''+auth[be:]
# Authorizer old/new construction via fresh callable and identical operational logic.
auth=auth.replace('  private final GuidedPublicationAuthorization authorization;', '''  @FunctionalInterface
  private interface FreshAuthority {
    BffAuthenticationToken fresh(Authentication caller, HttpServletRequest request,
        String principal, String csi, boolean execute);
  }
  private final FreshAuthority authorization;''')
s=auth.index('  public ObservedReplayAuthorizer(');e=auth.index('\n  public ObservedReplayAuthorization.Prepared authorize(',s)
old=auth[s:e].replace('this.authorization = authorization;', 'this.authorization = authorization::fresh;')
new=old.replace('GuidedPublicationAuthorization authorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization')
auth=auth[:s]+old+'\n'+new+auth[e:];save('guided/publication/ObservedReplayAuthorizer.java',auth)
s=sched.index('    Instant issued =',sched.index('  public Prepared prepareScheduled('));e=sched.index('\n  }',s)
sched=sched[:s]+'''    return new ObservedReplayBindingBuilder(contracts, pins, properties, clock)
        .build(testId, revisionId, principal, csiId, verified, true);'''+sched[e:];save('guided/publication/ObservedReplayAuthorization.java',sched)
conf=load('guided/publication/ObservedReplayConfiguration.java').replace('GuidedPublicationAuthorization authorization','com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization');save('guided/publication/ObservedReplayConfiguration.java',conf)
# Emit exact input manifest and patch after additional consumer/test drafts are added.
OUT.joinpath('input-hashes.json').write_text(json.dumps(inputs,indent=2)+'\n')
print('Generated',len(list(TREE.rglob('*.java'))),'off-tree Java drafts')

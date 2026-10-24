from generate_drafts import *
# Correct marker deletion, preserving EnableConfigurationProperties as the only composition.
save('dispatch/StudioRunnerConfiguration.java','''package com.citi.put.checks.studio.dispatch;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Binds runner properties; StudioRunnerTls.Wiring owns the profile-aware validation. */
@Configuration
@EnableConfigurationProperties(StudioRunnerProperties.class)
public class StudioRunnerConfiguration {}
''')
p=TREE/(base+'dispatch/HttpRunnerDispatchClient.java');h=p.read_text().replace('runner.connectTimeout() == null ? Duration.ofSeconds(2) : runner.connectTimeout()', 'runner == null || runner.connectTimeout() == null ? Duration.ofSeconds(2) : runner.connectTimeout()');p.write_text(h)
# Keep old production consumers wired until final, as required by existing spy-backed FOLD_TESTS.
conf=(TREE/(base+'guided/publication/GuidedPublicationConfiguration.java')).read_text()
s=conf.index('  GuidedPlanPublisher guidedPlanPublisher(');e=conf.index('  @Bean\n  GuidedPublicationResultProjector',s)
conf=conf[:s]+conf[s:e].replace('com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient validator','ObservedValidationClient validator').replace('com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization','GuidedPublicationAuthorization authorization')+conf[e:]
save('guided/publication/GuidedPublicationConfiguration.java',conf)
conf=load('guided/publication/ObservedReplayConfiguration.java');save('guided/publication/ObservedReplayConfiguration.java',conf)
# Compatibility delegates only; the operation implementation stays singular.
dispatch=load('guided/bridge/GuidedDispatchService.java')
dispatch=dispatch.replace('  private final GuidedRunnerClient runner;', '''  @FunctionalInterface
  private interface Send {
    JsonNode send(String operation, JsonNode body, String key, java.time.Instant deadline);
  }
  @FunctionalInterface
  private interface SendSecret {
    JsonNode send(JsonNode body, JsonNode metadata,
        com.citi.put.checks.studio.secrets.SecretValue secret, java.time.Instant deadline);
  }
  private final Send sender;
  private final SendSecret secretSender;''')
s=dispatch.index('  public GuidedDispatchService(');e=dispatch.index('  public void installReferences(',s)
old=dispatch[s:e].replace('this.runner = runner;', 'this.sender = runner::send;\n    this.secretSender = runner::sendSecret;')
new=old.replace('GuidedRunnerClient runner','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient runner')
wrappers='''  private JsonNode send(String operation, JsonNode body) {
    return send(operation, body, java.util.UUID.randomUUID().toString());
  }

  private JsonNode send(String operation, JsonNode body, String key) {
    return sender.send(operation, body, key, null);
  }

  private JsonNode send(String operation, JsonNode body, String key, java.time.Instant deadline) {
    return sender.send(operation, body, key, deadline);
  }

'''
dispatch=dispatch[:s]+old+new+wrappers+dispatch[e:]
dispatch=dispatch.replace('runner.send(', 'send(').replace('runner.sendSecret(', 'secretSender.send(').replace('GuidedRunnerClient.definiteContextRefusal', 'com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient.definiteContextRefusal')
save('guided/bridge/GuidedDispatchService.java',dispatch)
prep=load('guided/bridge/GuidedPreparationStore.java').replace('authenticated by GuidedRunnerClient', 'authenticated by the runner transport')
save('guided/bridge/GuidedPreparationStore.java',prep)
translation=load('guided/translation/GuidedTranslationService.java').replace('com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient','com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient')
save('guided/translation/GuidedTranslationService.java',translation)
# Existing conditional/fallback old bean wiring is deliberately byte-identical during prep.
config=load('guided/session/GuidedSessionConfiguration.java');save('guided/session/GuidedSessionConfiguration.java',config)
readme=load('guided/session/README.md').replace('`GuidedProductionSessionAccess.AccountAccess` remains the fail-closed OBS-007 account-provider handoff', '`GuidedProductionSessionAccess` retains the fail-closed secret-use authorization boundary')
# Keep old client name while it remains the active prep bean; final updates after atomically swapping.
save('guided/session/README.md',readme)
# Preserve by-name authority tests, exercising dispatch delegation instead of an independent seam.
test='backend/src/test/java/com/citi/put/checks/studio/'
authit=read(test+'guided/publication/GuidedPublicationAuthorizationIT.java').replace('package com.citi.put.checks.studio.guided.publication;', '''package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.guided.publication.PublicationGrantAuthority;
import com.citi.put.checks.studio.guided.publication.PublicationContracts;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationProperties;''').replace('class GuidedPublicationAuthorizationIT','class DispatchAuthorizationIT').replace('private GuidedPublicationAuthorization authorization;', 'private ProvisionalDispatchAuthorization authorization;')
authit=authit.replace('''    authorization =
        new GuidedPublicationAuthorization(''', '''    var authority =
        new PublicationGrantAuthority(''')
needle='''                true, 3, 15000, 5000, PublicationContracts.MAX_VALIDATION_BYTES));'''
authit=authit.replace(needle,needle+'''
    authorization = new ProvisionalDispatchAuthorization(null, null);
    var beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
    beans.registerSingleton("publicationGrantAuthority", authority);
    authorization.initializePublicationAuthority(beans.getBeanProvider(PublicationGrantAuthority.class));''')
authit=authit[:authit.rfind('\n}')]+'''
  @Test
  void workerWithoutPublicationCollaboratorRefusesEveryPublicationOperation() {
    var worker = new ProvisionalDispatchAuthorization(null, null);
    var beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
    worker.initializePublicationAuthority(beans.getBeanProvider(PublicationGrantAuthority.class));
    for (org.assertj.core.api.ThrowableAssert.ThrowingCallable operation : List.<org.assertj.core.api.ThrowableAssert.ThrowingCallable>of(
        () -> worker.fresh(owner, request, "owner", "1234", true),
        () -> worker.authorizePublication(owner, request, null, null),
        () -> worker.authorizeReceiptRead(owner, request, receipt()))) {
      assertThatThrownBy(operation).isInstanceOfSatisfying(GuidedSessionException.class, failure -> {
        assertThat(failure.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
        assertThat(failure.status()).isEqualTo(409);
      });
    }
    core.verify(0, getRequestedFor(urlEqualTo("/api/v1/users/me")));
  }
}
'''
write(test+'dispatch/DispatchAuthorizationIT.java',authit)
# Add cases to the existing client test; all preexisting test methods/assertions are unchanged.
clientit=read(test+'dispatch/HttpRunnerDispatchClientTest.java')
clientit=clientit[:clientit.rfind('\n}')]+'''
  @Test
  void foldedValidationUsesItsOwnEndpointCredentialAndPerCallByteLimit() throws Exception {
    var contracts = org.mockito.Mockito.mock(com.citi.put.checks.studio.guided.session.GuidedContracts.class);
    var mapper = new ObjectMapper();
    var request = mapper.createObjectNode().put("attemptId", "attempt").put("claimId", "claim")
        .put("snapshotHash", "snapshot").put("basisHash", "basis");
    request.putObject("requiredProfile");
    request.putObject("requiredBuild");
    var verdict = request.deepCopy();
    verdict.set("profile", request.path("requiredProfile"));
    verdict.set("build", request.path("requiredBuild"));
    org.mockito.Mockito.when(contracts.validateAndCanonical("v3/replay-validation", request)).thenReturn("{}");
    org.mockito.Mockito.when(contracts.parseWire(org.mockito.ArgumentMatchers.any(byte[].class))).thenReturn(verdict);
    client.initializeOperations(StudioRunnerTls.unconfigured(), contracts, new org.springframework.mock.env.MockEnvironment());
    wireMock.stubFor(post(urlPathEqualTo("/v2/validate-observed"))
        .willReturn(aResponse().withStatus(200).withBody("{}")));
    var budget = new com.citi.put.checks.studio.guided.publication.PublicationBudget(
        java.time.Instant.now().plusSeconds(5), java.time.Clock.systemUTC());
    assertThat(client.validate(request, budget, 2, 500)).isEqualTo(verdict);
    wireMock.verify(1, postRequestedFor(urlPathEqualTo("/v2/validate-observed"))
        .withHeader("Authorization", com.github.tomakehurst.wiremock.client.WireMock.equalTo("Bearer test-runner-token")));
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.validate(request, budget, 1, 500))
        .hasMessage("BUDGET_EXCEEDED");
    wireMock.verify(1, postRequestedFor(urlPathEqualTo("/v2/validate-observed")));
  }

  @Test
  void absentRunnerOriginDoesNotBorrowDispatchBaseUrlForGuidedOperations() {
    var contracts = new com.citi.put.checks.studio.guided.session.GuidedContracts();
    client.initializeOperations(StudioRunnerTls.unconfigured(), contracts, new org.springframework.mock.env.MockEnvironment());
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> client.send("context", new ObjectMapper().createObjectNode()))
        .isInstanceOfSatisfying(com.citi.put.checks.studio.guided.session.GuidedSessionException.class, failure -> {
          assertThat(failure.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
          assertThat(failure.status()).isEqualTo(409);
        });
    assertThat(wireMock.getAllServeEvents()).isEmpty();
  }

  @Test
  void foldedClientPreservesEachTransportConnectTimeoutAndHttpVersion() {
    var contracts = new com.citi.put.checks.studio.guided.session.GuidedContracts();
    var configured = new HttpRunnerDispatchClient(new ObjectMapper(),
        new StudioExecutionProperties(true, null, null, null, Duration.ofMillis(500), null, null, null, null, null, null),
        new StudioRunnerProperties("http://localhost:" + wireMock.port(), "test-runner-token", Duration.ofSeconds(2)),
        StudioRunnerTls.unconfigured(), contracts, java.net.URI.create("https://unconfigured.invalid"), () -> "guided-token");
    var dispatch = (HttpClient) org.springframework.test.util.ReflectionTestUtils.getField(configured, "httpClient");
    var validation = (HttpClient) org.springframework.test.util.ReflectionTestUtils.getField(configured, "validationClient");
    var guided = (HttpClient) org.springframework.test.util.ReflectionTestUtils.getField(configured, "guidedClient");
    assertThat(dispatch.connectTimeout()).contains(Duration.ofMillis(500));
    assertThat(dispatch.version()).isEqualTo(HttpClient.newHttpClient().version());
    assertThat(validation.connectTimeout()).contains(Duration.ofSeconds(2));
    assertThat(validation.version()).isEqualTo(HttpClient.Version.HTTP_1_1);
    assertThat(guided.connectTimeout()).contains(Duration.ofSeconds(5));
    assertThat(guided.version()).isEqualTo(HttpClient.Version.HTTP_1_1);
    assertThat(List.of(dispatch.followRedirects(), validation.followRedirects(), guided.followRedirects()))
        .containsOnly(HttpClient.Redirect.NEVER);
  }
}
'''
write(test+'dispatch/HttpRunnerDispatchClientTest.java',clientit)
# Serialize complete manifest here; helper captures read-only predecessors too.
OUT.joinpath('input-hashes.json').write_text(json.dumps(inputs,indent=2)+'\n')
print('Wrote all 17 main drafts and 2 test drafts; PublicationGrantClockIT remains next.')

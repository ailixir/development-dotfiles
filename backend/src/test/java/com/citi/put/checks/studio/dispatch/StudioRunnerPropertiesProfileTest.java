package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.session.GuidedSessionConfiguration;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.mock.env.MockEnvironment;

/**
 * STUDIO-OBS-009 AC-3 (the profile rule) and the startup half of AC-2.
 *
 * <p>{@code StudioRunnerProperties.validate(Environment)} refuses {@code http://} outside the
 * {@code local} and {@code test} profiles, and a runner hop outside those profiles does not start
 * without {@code studio.runner.tls}. Both are asserted twice: against the pure methods, and against
 * a real Spring context built from {@link StudioRunnerConfiguration} and {@link
 * StudioRunnerTls.Wiring} under each profile, so "startup failure under prod and staging" is a
 * context that fails to start, not only a method that throws.
 *
 * <p>Every refusal is paired with the acceptance that differs from it in exactly one input, so a
 * test cannot go green because something else made the context fail.
 */
class StudioRunnerPropertiesProfileTest {

  private static final String HTTP_RUNNER = "http://put-checks-studio-runner:8080";
  private static final String HTTPS_RUNNER = "https://put-checks-studio-runner:8080";
  private static final String TOKEN = "profile-test-runner-token-never-in-a-message";

  private static final RunnerTestTls CA = RunnerTestTls.shared();

  // ---- the pure rule ----

  static Stream<Arguments> deployedProfiles() {
    return Stream.of(
        Arguments.of((Object) new String[] {"prod"}),
        Arguments.of((Object) new String[] {"staging"}),
        Arguments.of((Object) new String[] {"dev"}),
        Arguments.of((Object) new String[] {"api", "prod"}),
        Arguments.of((Object) new String[] {"worker", "staging"}),
        Arguments.of((Object) new String[] {"uat"}),
        // No active profile is the strictest case, not an exemption.
        Arguments.of((Object) new String[] {}));
  }

  static Stream<Arguments> plaintextProfiles() {
    return Stream.of(
        Arguments.of((Object) new String[] {"local"}),
        Arguments.of((Object) new String[] {"test"}),
        Arguments.of((Object) new String[] {"local", "api"}),
        Arguments.of((Object) new String[] {"test", "worker"}));
  }

  @ParameterizedTest
  @MethodSource("deployedProfiles")
  void aPlaintextRunnerUrlIsRefusedOutsideLocalAndTest(String[] profiles) {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles(profiles);

    assertThatThrownBy(() -> properties(HTTP_RUNNER).validate(environment))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("studio.runner.base-url must be an https URL")
        .hasMessageContaining("local and test")
        .satisfies(failure -> assertThat(failure.getMessage()).doesNotContain(TOKEN));
    // The one different input: the same profiles accept the https URL.
    assertThatCode(() -> properties(HTTPS_RUNNER).validate(environment)).doesNotThrowAnyException();
    assertThat(StudioRunnerProperties.plaintextAllowed(environment)).isFalse();
  }

  @ParameterizedTest
  @MethodSource("plaintextProfiles")
  void aPlaintextRunnerUrlIsAcceptedInLocalAndTest(String[] profiles) {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles(profiles);

    assertThatCode(() -> properties(HTTP_RUNNER).validate(environment)).doesNotThrowAnyException();
    assertThat(StudioRunnerProperties.plaintextAllowed(environment)).isTrue();
  }

  @Test
  void theSchemeCheckIsNotFooledByALookAlikeScheme() {
    MockEnvironment prod = new MockEnvironment();
    prod.setActiveProfiles("prod");

    // The shape check wants a lower-case http(s) scheme in every profile.
    assertThatThrownBy(() -> properties("HTTPS://runner:8080").validate(prod))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("absolute http(s) URL");
    assertThatThrownBy(() -> properties("httpx://runner:8080").validate(prod))
        .isInstanceOf(IllegalStateException.class);
    // A host that merely starts with "https" is still a plaintext URL.
    assertThatThrownBy(() -> properties("http://https.example:8080").validate(prod))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("must be an https URL");
  }

  @Test
  void aRunnerThatIsNotConfiguredHasNoUrlToRefuseInAnyProfile() {
    MockEnvironment prod = new MockEnvironment();
    prod.setActiveProfiles("prod");

    assertThatCode(() -> new StudioRunnerProperties("", "", Duration.ofSeconds(2)).validate(prod))
        .doesNotThrowAnyException();
    assertThatCode(
            () -> new StudioRunnerProperties(null, null, Duration.ofSeconds(2)).validate(prod))
        .doesNotThrowAnyException();
  }

  @Test
  void theShapeChecksStillApplyBesideTheProfileRule() {
    MockEnvironment local = new MockEnvironment();
    local.setActiveProfiles("local");

    assertThatThrownBy(() -> properties("ftp://runner").validate(local))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("absolute http(s) URL");
    assertThatThrownBy(
            () -> new StudioRunnerProperties(HTTPS_RUNNER, TOKEN, Duration.ZERO).validate(local))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("connect-timeout");
  }

  // ---- the real context ----

  @ParameterizedTest
  @MethodSource("deployedProfiles")
  void startupFailsOutsideLocalAndTestForAPlaintextRunnerUrl(String[] profiles) {
    contextFor(profiles)
        .withPropertyValues(with("studio.runner.base-url=" + HTTP_RUNNER))
        .run(
            context -> {
              assertThat(context).hasFailed();
              assertThat(rootMessage(context.getStartupFailure()))
                  .contains("studio.runner.base-url must be an https URL");
            });
    // The same context, profile and TLS settings, differing only in the scheme, starts.
    contextFor(profiles)
        .withPropertyValues(with("studio.runner.base-url=" + HTTPS_RUNNER))
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThat(context.getBean(StudioRunnerTls.class).isConfigured()).isTrue();
            });
  }

  @ParameterizedTest
  @MethodSource("plaintextProfiles")
  void startupSucceedsInLocalAndTestForAPlaintextRunnerUrlWithNoTlsAtAll(String[] profiles) {
    contextFor(profiles)
        .withPropertyValues("studio.runner.base-url=" + HTTP_RUNNER)
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              StudioRunnerTls tls = context.getBean(StudioRunnerTls.class);
              assertThat(tls.isConfigured()).isFalse();
              assertThat(tls.toString()).isEqualTo("StudioRunnerTls[unconfigured]");
            });
  }

  @Test
  void aConfiguredRunnerHopOutsideLocalAndTestDoesNotStartWithoutTlsSettings() {
    // dispatch / validation hop
    contextFor("prod")
        .withPropertyValues("studio.runner.base-url=" + HTTPS_RUNNER)
        .run(
            context -> {
              assertThat(context).hasFailed();
              assertThat(rootMessage(context.getStartupFailure()))
                  .contains("studio.runner.tls is not configured")
                  .contains("key-store")
                  .contains("trust-store");
            });
    // guided bridge hop, and the translation controller hop, and the guided connector
    for (String hop :
        new String[] {
          "studio.guided-authoring.runner-origin=https://put-checks-studio-runner:8080",
          "studio.guided-authoring.translation.controller-origin=https://put-checks-api:8443",
          "studio.guided-authoring.connector.port=8443"
        }) {
      contextFor("staging")
          .withPropertyValues(hop)
          .run(
              context -> {
                assertThat(context).as(hop).hasFailed();
                assertThat(rootMessage(context.getStartupFailure()))
                    .as(hop)
                    .contains("studio.runner.tls is not configured");
              });
      // The one different input: the same hop with the settings starts.
      contextFor("staging")
          .withPropertyValues(with(hop))
          .run(context -> assertThat(context).as(hop).hasNotFailed());
    }
  }

  @Test
  void aDeploymentWithNoRunnerHopNeedsNoTlsSettings() {
    contextFor("prod")
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThat(context.getBean(StudioRunnerTls.class).isConfigured()).isFalse();
            });
  }

  @ParameterizedTest
  @MethodSource("plaintextProfiles")
  void aPartialTlsConfigurationFailsInEveryProfileNamingTheMissingPart(String[] profiles) {
    contextFor(profiles)
        .withPropertyValues(
            "studio.runner.tls.key-store=" + CA.keyStore(RunnerTestTls.Identity.BACKEND))
        .run(
            context -> {
              assertThat(context).hasFailed();
              assertThat(rootMessage(context.getStartupFailure()))
                  .contains("studio.runner.tls.key-store-password-file is not configured");
            });
  }

  @Test
  void aDeploymentDescriptorThatRendersEmptyValuesIsTheSameAsNothingConfigured() {
    // application.yml renders `${STUDIO_RUNNER_TLS_KEY_STORE:}` and so on: present but blank.
    contextFor("test")
        .withPropertyValues(
            "studio.runner.tls.key-store=",
            "studio.runner.tls.key-store-password-file=",
            "studio.runner.tls.key-store-type=PKCS12",
            "studio.runner.tls.trust-store=",
            "studio.runner.tls.trust-store-password-file=",
            "studio.runner.tls.trust-store-type=PKCS12")
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThat(context.getBean(StudioRunnerTls.Settings.class).isEmpty()).isTrue();
              assertThat(context.getBean(StudioRunnerTls.class).isConfigured()).isFalse();
            });
  }

  @Test
  void theBoundSettingsBuildTheBackendIdentityFromFilesOnly() {
    contextFor("prod")
        .withPropertyValues(with("studio.runner.base-url=" + HTTPS_RUNNER))
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              StudioRunnerTls tls = context.getBean(StudioRunnerTls.class);
              assertThat(tls.clientCertificateSubject()).isEqualTo("CN=obs009-backend");
              assertThat(tls.toString()).doesNotContain(CA.directory().toString());
            });
  }

  @Test
  void theDeployedDispatchClientAcceptsTheIdentityAndTheTestConstructorStillExists() {
    StudioExecutionProperties execution =
        new StudioExecutionProperties(
            true, null, null, null, Duration.ofMillis(500), null, null, null, null, null, null);
    StudioRunnerProperties runner = properties(HTTPS_RUNNER);

    HttpRunnerDispatchClient deployed =
        new HttpRunnerDispatchClient(new ObjectMapper(), execution, runner, CA.backendTls());
    HttpRunnerDispatchClient local =
        new HttpRunnerDispatchClient(new ObjectMapper(), execution, runner);

    assertThat(deployed.redirectPolicy()).isEqualTo(HttpClient.Redirect.NEVER);
    assertThat(local.redirectPolicy()).isEqualTo(HttpClient.Redirect.NEVER);
  }

  // ---- AC-2: the guided mutual-TLS chain fails closed ----

  /** Every property of a complete API-role chain; the keys are the ones a deployment sets. */
  private static Map<String, String> completeChain() {
    Map<String, String> chain = new LinkedHashMap<>();
    chain.put("studio.guided-authoring.runner-origin", "https://put-checks-studio-runner:8080");
    chain.put(
        "studio.guided-authoring.translation.controller-origin", "https://put-checks-api:8443");
    chain.put("studio.guided-authoring.controller-token-file", "/etc/studio/guided-token/runner");
    chain.put(
        "studio.guided-authoring.translation.controller-token-file",
        "/etc/studio/guided-token/controller");
    chain.put("studio.guided-authoring.mtls-required", "true");
    chain.put(
        "studio.guided-authoring.service-public-key",
        "-----BEGIN PUBLIC KEY-----x-----END PUBLIC KEY-----");
    chain.put("studio.guided-authoring.service-issuer", "studio-guided-issuer");
    chain.put("studio.guided-authoring.connector.port", "8443");
    return chain;
  }

  private static MockEnvironment environment(Map<String, String> chain, String... profiles) {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles(profiles);
    chain.forEach(environment::setProperty);
    return environment;
  }

  @Test
  void aCompleteChainHasNoProblemOutsideLocalAndTest() {
    assertThat(GuidedSessionConfiguration.MtlsChain.problems(environment(completeChain(), "prod")))
        .isEmpty();
    assertThat(
            GuidedSessionConfiguration.MtlsChain.problems(
                environment(completeChain(), "api", "staging")))
        .isEmpty();
  }

  @ParameterizedTest
  @MethodSource("apiChainParts")
  void theApiRoleDoesNotStartWithoutAnyOnePartOfTheChain(String part, String named) {
    Map<String, String> chain = completeChain();
    chain.remove(part);
    if (part.endsWith("mtls-required")) {
      chain.put(part, "false");
    }

    List<String> problems =
        GuidedSessionConfiguration.MtlsChain.problems(environment(chain, "api", "prod"));

    assertThat(problems).hasSize(1);
    assertThat(problems.get(0)).contains(named);
    // And as a real context: the pod does not start, and says which part.
    new ApplicationContextRunner()
        .withUserConfiguration(GuidedSessionConfiguration.MtlsChain.class)
        .withInitializer(context -> context.getEnvironment().setActiveProfiles("api", "prod"))
        .withPropertyValues(
            chain.entrySet().stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .toArray(String[]::new))
        .run(
            context -> {
              assertThat(context).hasFailed();
              assertThat(rootMessage(context.getStartupFailure()))
                  .contains("guided mutual-TLS chain is incomplete")
                  .contains(named);
            });
  }

  static Stream<Arguments> apiChainParts() {
    return Stream.of(
        Arguments.of("studio.guided-authoring.mtls-required", "mtls-required must be true"),
        Arguments.of("studio.guided-authoring.service-public-key", "service-public-key"),
        Arguments.of("studio.guided-authoring.service-issuer", "service-issuer"),
        Arguments.of("studio.guided-authoring.connector.port", "connector.port"),
        Arguments.of("studio.guided-authoring.controller-token-file", "controller-token-file"),
        Arguments.of(
            "studio.guided-authoring.translation.controller-token-file",
            "translation.controller-token-file"));
  }

  @Test
  void aWorkerNeedsTheTokenFilesButNotTheReceivingHalfOfTheChain() {
    Map<String, String> worker = completeChain();
    worker.remove("studio.guided-authoring.mtls-required");
    worker.remove("studio.guided-authoring.service-public-key");
    worker.remove("studio.guided-authoring.service-issuer");
    worker.remove("studio.guided-authoring.connector.port");

    assertThat(GuidedSessionConfiguration.MtlsChain.problems(environment(worker, "worker", "prod")))
        .isEmpty();
    // The same properties on an API pod are an incomplete chain; the role decides.
    assertThat(GuidedSessionConfiguration.MtlsChain.problems(environment(worker, "api", "prod")))
        .hasSize(4);
    worker.remove("studio.guided-authoring.controller-token-file");
    assertThat(GuidedSessionConfiguration.MtlsChain.problems(environment(worker, "worker", "prod")))
        .hasSize(1);
  }

  @Test
  void localTestAndADeploymentWithNoGuidedHopNeedNoChain() {
    assertThat(GuidedSessionConfiguration.MtlsChain.problems(environment(Map.of(), "prod")))
        .isEmpty();
    assertThat(GuidedSessionConfiguration.MtlsChain.problems(environment(Map.of()))).isEmpty();
    for (String profile : new String[] {"local", "test"}) {
      Map<String, String> bare =
          Map.of("studio.guided-authoring.runner-origin", "https://runner:8080");
      assertThat(GuidedSessionConfiguration.MtlsChain.problems(environment(bare, profile)))
          .as(profile)
          .isEmpty();
    }
    // The one different input: the same bare hop under prod is a problem list.
    assertThat(
            GuidedSessionConfiguration.MtlsChain.problems(
                environment(
                    Map.of("studio.guided-authoring.runner-origin", "https://runner:8080"),
                    "prod")))
        .isNotEmpty();
  }

  // ---- the API pod's guided connector ----

  @Test
  void theGuidedConnectorIsAddedOnlyWhenAPortIsSetAndNeverOnAWorker() {
    String[] tls = with("studio.guided-authoring.connector.port=0");
    connectorContext("prod")
        .withPropertyValues(tls)
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory();
              customizer(context).customize(factory);
              assertThat(factory.getAdditionalTomcatConnectors()).isEmpty();
            });
    connectorContext("prod")
        .withPropertyValues(with("studio.guided-authoring.connector.port=8443"))
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              TomcatServletWebServerFactory factory = new TomcatServletWebServerFactory();
              customizer(context).customize(factory);
              assertThat(factory.getAdditionalTomcatConnectors()).hasSize(1);
              assertThat(factory.getAdditionalTomcatConnectors().iterator().next().getScheme())
                  .isEqualTo("https");
            });
    // A worker has no internal guided chain and no connector bean at all.
    connectorContext("worker", "prod")
        .withPropertyValues(with("studio.guided-authoring.connector.port=8443"))
        .run(
            context -> {
              assertThat(context).hasNotFailed();
              assertThat(context.getBeansOfType(WebServerFactoryCustomizer.class)).isEmpty();
            });
    // A connector port with no key store never starts: the identity is required, not defaulted.
    connectorContext("prod")
        .withPropertyValues("studio.guided-authoring.connector.port=8443")
        .run(context -> assertThat(context).hasFailed());
  }

  @SuppressWarnings("unchecked")
  private static WebServerFactoryCustomizer<TomcatServletWebServerFactory> customizer(
      org.springframework.context.ApplicationContext context) {
    return context.getBean("guidedTlsConnectorCustomizer", WebServerFactoryCustomizer.class);
  }

  private static ApplicationContextRunner connectorContext(String... profiles) {
    return new ApplicationContextRunner()
        .withUserConfiguration(
            StudioRunnerConfiguration.class,
            StudioRunnerTls.Wiring.class,
            GuidedSessionConfiguration.GuidedTlsConnector.class)
        .withInitializer(context -> context.getEnvironment().setActiveProfiles(profiles));
  }

  // ---- helpers ----

  private static StudioRunnerProperties properties(String baseUrl) {
    return new StudioRunnerProperties(baseUrl, TOKEN, Duration.ofSeconds(2));
  }

  private static ApplicationContextRunner contextFor(String... profiles) {
    return new ApplicationContextRunner()
        .withUserConfiguration(StudioRunnerConfiguration.class, StudioRunnerTls.Wiring.class)
        .withInitializer(context -> context.getEnvironment().setActiveProfiles(profiles));
  }

  /** The given property plus the {@code studio.runner.tls} keys of the shared backend identity. */
  private static String[] with(String property) {
    return new String[] {
      property,
      "studio.runner.tls.key-store=" + CA.keyStore(RunnerTestTls.Identity.BACKEND),
      "studio.runner.tls.key-store-password-file="
          + CA.keyStorePasswordFile(RunnerTestTls.Identity.BACKEND),
      "studio.runner.tls.trust-store=" + CA.trustStore(),
      "studio.runner.tls.trust-store-password-file=" + CA.trustStorePasswordFile()
    };
  }

  private static String rootMessage(Throwable failure) {
    Throwable cursor = failure;
    StringBuilder all = new StringBuilder();
    while (cursor != null) {
      all.append(cursor.getMessage()).append('\n');
      cursor = cursor.getCause();
    }
    return all.toString();
  }
}

package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.encoder.PatternLayoutEncoder;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.OutputStreamAppender;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.env.MockEnvironment;

/**
 * Story 10.17 AC-9 — the fake vault cannot be reached from a deployed profile, and the provider
 * choice is fail-closed.
 *
 * <p>A silent fallback to a fake vault is the single worst failure mode this story could ship, and
 * it is very much cheaper to make impossible than to detect. Three assertions, and each of them is
 * about what the application <em>does</em> rather than about what the configuration says:
 *
 * <ol>
 *   <li>the context refuses to build when the key is absent or unrecognised, rather than falling
 *       back to anything;
 *   <li>the fake is unreachable outside the development and test profiles, and the failure is a
 *       refusal rather than a substitution;
 *   <li>the selected provider's name appears in a startup line — asserted through a <b>live logback
 *       appender</b>, on captured output. Asserting that a string appears in the source is story
 *       10.8's QUAL-1 defect, and it proves nothing; @po named AC-9 as carrying that exact shape.
 * </ol>
 */
class VaultProviderSelectionTest {

  private final StudioVaultConfiguration configuration = new StudioVaultConfiguration();

  private ByteArrayOutputStream sink;
  private OutputStreamAppender<ILoggingEvent> appender;
  private Level restoreLevel;

  @BeforeEach
  void attachLogSink() {
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    sink = new ByteArrayOutputStream();

    PatternLayoutEncoder encoder = new PatternLayoutEncoder();
    encoder.setContext(context);
    // `%msg` renders every argument through its own toString; `%ex{full}` the whole cause chain.
    encoder.setPattern("%logger %level %msg%n%ex{full}");
    encoder.setCharset(StandardCharsets.UTF_8);
    encoder.start();

    appender = new OutputStreamAppender<>();
    appender.setContext(context);
    appender.setEncoder(encoder);
    appender.setOutputStream(sink);
    appender.setImmediateFlush(true);
    appender.start();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).addAppender(appender);

    restoreLevel = context.getLogger("com.citi.put.checks").getLevel();
    context.getLogger("com.citi.put.checks").setLevel(Level.TRACE);
  }

  @AfterEach
  void detachLogSink() {
    LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
    context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME).detachAppender(appender);
    context.getLogger("com.citi.put.checks").setLevel(restoreLevel);
    appender.stop();
  }

  private String captured() {
    return new String(sink.toByteArray(), StandardCharsets.UTF_8);
  }

  private static StudioSecretsProperties properties(String provider) {
    return new StudioSecretsProperties(new StudioSecretsProperties.Vault(provider, null), Map.of());
  }

  private static MockEnvironment profiles(String... active) {
    MockEnvironment environment = new MockEnvironment();
    environment.setActiveProfiles(active);
    return environment;
  }

  /** The fixture guard: the appender is live before any assertion about output is trusted. */
  @Test
  void theAppenderIsLiveBeforeAnyAssertionAboutOutputIsTrusted() {
    LoggerFactory.getLogger(StudioVaultConfiguration.class).warn("vault-sink-probe-4c81");
    assertThat(captured())
        .as("the appender captured nothing, so every assertion on captured output below is vacuous")
        .contains("vault-sink-probe-4c81");
  }

  @Test
  void refusesToStartWhenNoProviderIsNamed() {
    for (String absent : new String[] {null, "", "   "}) {
      assertThatThrownBy(
              () -> configuration.studioVaultProvider(properties(absent), profiles("test")))
          .as("provider=%s must refuse to start rather than fall back", absent)
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("studio.secrets.vault.provider");
    }
  }

  @Test
  void refusesToStartOnAnUnrecognisedProviderRatherThanSubstitutingOne() {
    assertThatThrownBy(
            () -> configuration.studioVaultProvider(properties("hashicorp"), profiles("test")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("is not a provider this build knows")
        .hasMessageContaining("not substituted");
  }

  @Test
  void refusesTheFakeOutsideTheDevelopmentProfiles() {
    for (String[] deployed :
        new String[][] {{"prod"}, {"staging"}, {"api", "prod"}, {"worker", "staging"}, {}}) {
      assertThatThrownBy(
              () -> configuration.studioVaultProvider(properties("fake"), profiles(deployed)))
          .as("profiles %s must not be able to reach the fake vault", (Object) deployed)
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("confined to");
    }
  }

  @Test
  void buildsTheFakeOnlyForTheDevelopmentProfilesAndSaysSoOutLoud() {
    for (String profile : StudioVaultConfiguration.DEVELOPMENT_PROFILES) {
      StudioVaultProvider provider =
          configuration.studioVaultProvider(properties("fake"), profiles(profile));
      assertThat(provider.name()).isEqualTo(FakeStudioVaultProvider.NAME);
    }

    // Asserted on the bytes a log file would have received, not on the source of the line.
    String output = captured();
    assertThat(output)
        .as("a deployment running on a fake vault must say so out loud")
        .contains(StudioVaultConfiguration.STARTUP_MESSAGE_PREFIX + FakeStudioVaultProvider.NAME);
    assertThat(output).contains("not a real vault");
  }

  @Test
  void aMalformedDevelopmentSeedIsAStartupFailureRatherThanAnAbsentReference() {
    // An operator who mistyped a seed key should see it now, not as a run whose password field was
    // empty. The shape of the key is part of the configuration contract.
    assertThatThrownBy(
            () ->
                configuration.studioVaultProvider(
                    new StudioSecretsProperties(
                        new StudioSecretsProperties.Vault(
                            "fake",
                            new StudioSecretsProperties.Vault.Fake(Map.of("not-a-key", "value"))),
                        Map.of()),
                    profiles("test")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("KIND|csi|environment|name");
  }

  @Test
  void entitlementPolicyIsFailClosedAtEveryGap() {
    StudioSecretUseAuthorization authorization =
        configuration.studioSecretUseAuthorization(
            new StudioSecretsProperties(
                new StudioSecretsProperties.Vault("fake", null),
                Map.of("owner@citi.com|60406|Production", "LOGIN_PW")));

    assertThat(authorization.mayUse("owner@citi.com", "60406", "Production", "LOGIN_PW")).isTrue();
    // …and every way of being slightly wrong is false, not true.
    assertThat(authorization.mayUse("owner@citi.com", "60406", "Production", "OTHER")).isFalse();
    assertThat(authorization.mayUse("owner@citi.com", "60999", "Production", "LOGIN_PW")).isFalse();
    assertThat(authorization.mayUse("owner@citi.com", "60406", "dev", "LOGIN_PW")).isFalse();
    assertThat(authorization.mayUse("stranger@citi.com", "60406", "Production", "LOGIN_PW"))
        .isFalse();
    assertThat(authorization.mayUse(null, "60406", "Production", "LOGIN_PW")).isFalse();
  }
}

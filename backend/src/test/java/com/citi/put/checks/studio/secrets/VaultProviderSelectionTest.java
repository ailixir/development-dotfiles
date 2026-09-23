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
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

/**
 * Story 10.17 AC-9 — provider choice is fail-closed and production code cannot select a test
 * double.
 *
 * <p>A silent fallback to a fake vault is the single worst failure mode this story could ship, and
 * it is very much cheaper to make impossible than to detect. Three assertions, and each of them is
 * about what the application <em>does</em> rather than about what the configuration says:
 *
 * <ol>
 *   <li>the context refuses to build when the key is absent or unrecognised, rather than falling
 *       back to anything;
 *   <li>the fake provider name is unknown to production configuration;
 *   <li>the selected provider's name appears in a startup line — asserted through a <b>live logback
 *       appender</b>, on captured output. Asserting that a string appears in the source is story
 *       10.8's QUAL-1 defect, and it proves nothing; @po named AC-9 as carrying that exact shape.
 * </ol>
 */
class VaultProviderSelectionTest {

  @TempDir Path temp;

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
      assertThatThrownBy(() -> configuration.studioVaultProvider(properties(absent)))
          .as("provider=%s must refuse to start rather than fall back", absent)
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("studio.secrets.vault.provider");
    }
  }

  @Test
  void refusesToStartOnAnUnrecognisedProviderRatherThanSubstitutingOne() {
    assertThatThrownBy(() -> configuration.studioVaultProvider(properties("not-a-provider")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("is not a provider this build knows")
        .hasMessageContaining("not substituted");
  }

  @Test
  void buildsTheExplicitDefaultOffProviderWithoutCallingAnExternalVault() {
    StudioVaultProvider provider = configuration.studioVaultProvider(properties("none"));

    assertThat(provider).isInstanceOf(DisabledStudioVaultProvider.class);
    assertThat(
            provider.read(
                StudioVaultProvider.ReferenceKind.SECRET, "60406", "Production", "LOGIN_PW"))
        .isEmpty();
  }

  @Test
  void buildsTheRealHashicorpProviderOnlyWithCompleteSecureConfiguration() throws Exception {
    Path token = temp.resolve("token");
    Files.writeString(token, "mounted-token");
    StudioSecretsProperties.Vault.Hashicorp hashicorp =
        new StudioSecretsProperties.Vault.Hashicorp(
            "https://vault.internal.example",
            "team-a",
            "secret",
            null,
            "value",
            token.toString(),
            Duration.ofSeconds(1),
            Duration.ofSeconds(2),
            4096);
    StudioVaultProvider provider =
        configuration.studioVaultProvider(
            new StudioSecretsProperties(
                new StudioSecretsProperties.Vault("hashicorp", hashicorp), Map.of()));

    assertThat(provider).isInstanceOf(HashicorpStudioVaultProvider.class);
    assertThat(provider.name()).isEqualTo("hashicorp");
  }

  @Test
  void refusesTheTestDoubleNameInEveryProfileBecauseItIsNotShipped() {
    assertThatThrownBy(
            () -> configuration.studioVaultProvider(properties(FakeStudioVaultProvider.NAME)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("is not a provider this build knows");
  }

  @Test
  void entitlementPolicyIsFailClosedAtEveryGap() {
    StudioSecretUseAuthorization authorization =
        configuration.studioSecretUseAuthorization(
            new StudioSecretsProperties(
                new StudioSecretsProperties.Vault("none", null),
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

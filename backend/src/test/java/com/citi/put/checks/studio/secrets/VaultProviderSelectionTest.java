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
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;
import org.yaml.snakeyaml.Yaml;

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
    return new StudioSecretsProperties(new StudioSecretsProperties.Vault(provider, null));
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
                StudioVaultProvider.ReferenceKind.SECRET,
                VaultScope.of("60406", "Production", java.util.UUID.randomUUID()),
                "LOGIN_PW"))
        .isEmpty();
  }

  /**
   * AC-V7-2: with provider {@code none}, saving and listing are refused as "not configured" — a
   * distinct answer from an outage — and no other store is consulted.
   */
  @Test
  void theDefaultOffProviderRefusesToSaveOrListAsNotConfigured() {
    StudioVaultProvider provider = configuration.studioVaultProvider(properties("none"));
    VaultScope scope = VaultScope.of("60406", "Production", java.util.UUID.randomUUID());

    assertThatThrownBy(
            () ->
                provider.create(scope, "LOGIN_PW", "x".toCharArray(), List.of("https://a.example")))
        .isInstanceOf(VaultNotConfiguredException.class)
        .isNotInstanceOf(VaultProviderUnavailableException.class);
    assertThatThrownBy(() -> provider.listSecretNames(scope))
        .isInstanceOf(VaultNotConfiguredException.class);
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
            new StudioSecretsProperties(new StudioSecretsProperties.Vault("hashicorp", hashicorp)));

    assertThat(provider).isInstanceOf(HashicorpStudioVaultProvider.class);
    assertThat(provider.name()).isEqualTo("hashicorp");
  }

  /**
   * AC-V7-3: only the provider, the address and the token file are needed. The default path
   * template (which includes {@code {testId}}) passes validation, and the selection is logged.
   */
  @Test
  void connectsWithOnlyTheThreeRequiredSettingsAndTheDefaultTestScopedTemplate() throws Exception {
    Path token = temp.resolve("token");
    Files.writeString(token, "mounted-token");
    StudioSecretsProperties.Vault.Hashicorp hashicorp =
        new StudioSecretsProperties.Vault.Hashicorp(
            "https://vault.internal.example",
            null,
            null,
            null,
            null,
            token.toString(),
            null,
            null,
            null);

    StudioVaultProvider provider =
        configuration.studioVaultProvider(
            new StudioSecretsProperties(new StudioSecretsProperties.Vault("hashicorp", hashicorp)));

    assertThat(provider).isInstanceOf(HashicorpStudioVaultProvider.class);
    assertThat(hashicorp.pathTemplateOrDefault())
        .isEqualTo("studio/{csiId}/{environment}/{testId}/{kind}/{referenceName}");
    assertThat(captured()).contains(StudioVaultConfiguration.STARTUP_MESSAGE_PREFIX + "hashicorp");
  }

  /** AC-V3-2 / D2: every template that could let save and run address different paths. */
  @Test
  void refusesAPathTemplateThatIsNotTestScopedOrDoesNotEndWithTheReferenceName() throws Exception {
    Path token = temp.resolve("token");
    Files.writeString(token, "mounted-token");
    for (String template :
        List.of(
            // the pre-V3 default, which has no test id
            "studio/{csiId}/{environment}/{kind}/{referenceName}",
            // the name is not the last segment, so there is no list prefix
            "studio/{csiId}/{environment}/{testId}/{referenceName}/{kind}",
            // the name twice
            "studio/{csiId}/{environment}/{testId}/{kind}/{referenceName}/{referenceName}",
            // the name glued to another segment
            "studio/{csiId}/{environment}/{testId}/{kind}-{referenceName}")) {
      StudioSecretsProperties.Vault.Hashicorp hashicorp =
          new StudioSecretsProperties.Vault.Hashicorp(
              "https://vault.internal.example",
              null,
              null,
              template,
              null,
              token.toString(),
              null,
              null,
              null);
      assertThatThrownBy(
              () ->
                  configuration.studioVaultProvider(
                      new StudioSecretsProperties(
                          new StudioSecretsProperties.Vault("hashicorp", hashicorp))))
          .as("template %s must refuse to start", template)
          .isInstanceOf(IllegalStateException.class)
          .hasMessageContaining("path-template");
    }
  }

  /**
   * F17: the Helm chart passes its {@code studioVault.pathTemplate} to every pod unconditionally,
   * so a chart value this build refuses would stop every pod the moment {@code hashicorp} is
   * selected. Checked here as well as in the chart's own render test.
   */
  @Test
  @SuppressWarnings("unchecked")
  void theHelmChartsDefaultPathTemplatePassesStartupValidation() throws Exception {
    Path values = Path.of("..", "helm-chart", "put-checks", "values.yaml");
    Map<String, Object> chart =
        (Map<String, Object>) new Yaml().load(Files.readString(values, StandardCharsets.UTF_8));
    Map<String, Object> studioVault = (Map<String, Object>) chart.get("studioVault");
    String template = (String) studioVault.get("pathTemplate");

    assertThat(template).contains("{testId}");
    StudioVaultConfiguration.validatePathTemplate(template);
    assertThat(studioVault.get("provider")).isEqualTo("none");
  }

  @Test
  void refusesTheTestDoubleNameInEveryProfileBecauseItIsNotShipped() {
    assertThatThrownBy(
            () -> configuration.studioVaultProvider(properties(FakeStudioVaultProvider.NAME)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("is not a provider this build knows");
  }
}

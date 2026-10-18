package com.citi.put.checks.config.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.EnumerablePropertySource;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * STUDIO-OBS-015 ruling E-1: json-schema-validator writes every validated instance and its whole
 * root document at DEBUG, which SecretMasker does not cover. Production pins {@code com.networknt}
 * at WARN, which silences it even under ROOT TRACE, and no profile may lower that cap.
 */
class SchemaValidatorLogCapTest {

  private static final String VALIDATION_BASIS =
      "v3/replay-validation#/definitions/ValidationBasis";

  private final LoggerContext context = (LoggerContext) LoggerFactory.getILoggerFactory();
  private final Logger root = context.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
  private final Logger networknt = context.getLogger("com.networknt");

  /** Runs the probe validation with the given levels and returns every networknt event. */
  private List<ILoggingEvent> validateUnder(Level rootLevel, Level networkntLevel, String canary) {
    Level savedRoot = root.getLevel();
    Level savedNetworknt = networknt.getLevel();
    ListAppender<ILoggingEvent> appender = new ListAppender<>();
    appender.setContext(context);
    appender.start();
    networknt.addAppender(appender);
    try {
      root.setLevel(rootLevel);
      networknt.setLevel(networkntLevel);
      var probe = new ObjectMapper().createObjectNode().put("probe", canary);
      assertThatThrownBy(() -> new GuidedContracts().validate(VALIDATION_BASIS, probe))
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("INVALID_CONTRACT");
      return List.copyOf(appender.list);
    } finally {
      networknt.detachAppender(appender);
      appender.stop();
      networknt.setLevel(savedNetworknt);
      root.setLevel(savedRoot);
    }
  }

  @Test
  void networkntDebugWritesWholeValidatedDocuments() {
    String canary = "NNT-CANARY-" + UUID.randomUUID();
    List<ILoggingEvent> events = validateUnder(Level.INFO, Level.DEBUG, canary);

    var leaking =
        events.stream()
            .map(ILoggingEvent::getFormattedMessage)
            .filter(message -> message.contains(canary))
            .toList();
    assertThat(leaking).as("the hazard this cap closes").isNotEmpty();
    assertThat(SecretMasker.mask(leaking.getFirst()))
        .as("SecretMasker does not cover document values")
        .contains(canary);
  }

  @Test
  void productionCapSilencesItUnderRootTrace() {
    String canary = "NNT-CANARY-" + UUID.randomUUID();
    assertThat(validateUnder(Level.TRACE, Level.WARN, canary)).isEmpty();
  }

  @Test
  void applicationYamlPinsTheCapAndNoProfileLowersIt() throws Exception {
    var loader = new YamlPropertySourceLoader();
    var base = loader.load("application", new ClassPathResource("application.yml"));
    assertThat(base)
        .anySatisfy(
            source ->
                assertThat(source.getProperty("logging.level.com.networknt")).isEqualTo("WARN"));
    for (String profile : List.of("api", "dev", "local", "prod", "staging", "test", "worker")) {
      String file = "application-" + profile + ".yml";
      for (PropertySource<?> source : loader.load(file, new ClassPathResource(file))) {
        assertThat(((EnumerablePropertySource<?>) source).getPropertyNames())
            .as("%s must not lower the com.networknt cap", file)
            .noneMatch(
                name ->
                    name.equals("logging.level.com.networknt")
                        || name.startsWith("logging.level.com.networknt."));
      }
    }
  }
}

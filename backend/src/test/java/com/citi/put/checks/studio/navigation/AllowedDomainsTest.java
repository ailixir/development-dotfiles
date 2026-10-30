package com.citi.put.checks.studio.navigation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * STUDIO-FLEX-001: the allow-list rule, run over every case of the vectors file the runner also
 * consumes (configuration, environment form, URL-to-host extraction, matching), and over the
 * allow-all option (environment form, matching, startup).
 */
class AllowedDomainsTest {
  private static final JsonNode VECTORS = load();

  private static JsonNode load() {
    try {
      return new ObjectMapper()
          .readTree(
              Files.readString(
                  Path.of("..", "docs", "specs", "studio", "allowed-domains-vectors.json")));
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
  }

  private static List<String> strings(JsonNode array) {
    List<String> list = new ArrayList<>();
    array.forEach(node -> list.add(node.asText()));
    return list;
  }

  @Test
  void theVectorsFileIsTheOneTheLimitsComeFrom() {
    assertThat(VECTORS.path("limits").path("maxEntries").asInt())
        .isEqualTo(AllowedDomains.MAX_ENTRIES);
    assertThat(VECTORS.path("configCases").size()).isGreaterThan(50);
    assertThat(VECTORS.path("envCases").size()).isGreaterThan(10);
    assertThat(VECTORS.path("hostCases").size()).isGreaterThan(50);
    assertThat(VECTORS.path("matchCases").size()).isGreaterThan(80);
    assertThat(VECTORS.path("allowAllEnvCases").size()).isGreaterThan(15);
    assertThat(VECTORS.path("allowAllMatchCases").size()).isGreaterThan(25);
  }

  @Test
  void everyAllowAllEnvironmentCase() {
    for (JsonNode c : VECTORS.path("allowAllEnvCases")) {
      String value = c.path("value").isNull() ? null : c.path("value").asText();
      String name = c.path("name").asText();
      if (c.path("valid").asBoolean()) {
        assertThat(AllowedDomains.parseAllowAll(value))
            .as(name)
            .isEqualTo(c.path("allowAll").asBoolean());
      } else {
        assertThatThrownBy(() -> AllowedDomains.parseAllowAll(value))
            .as(name)
            .isInstanceOf(IllegalArgumentException.class);
      }
    }
  }

  @Test
  void everyAllowAllMatchCase() {
    for (JsonNode c : VECTORS.path("allowAllMatchCases")) {
      // The configured list is a valid list in every case and is ignored for matching.
      AllowedDomains domains = new AllowedDomains(strings(c.path("entries")), true);
      assertThat(domains.allows(c.path("url").asText()))
          .as(c.path("name").asText())
          .isEqualTo(c.path("match").asBoolean());
    }
  }

  @Test
  void everyConfigurationCase() {
    for (JsonNode c : VECTORS.path("configCases")) {
      List<String> entries = strings(c.path("entries"));
      String name = c.path("name").asText();
      if (c.path("valid").asBoolean()) {
        assertThat(new AllowedDomains(entries).entries()).as(name).isEqualTo(entries);
      } else {
        assertThatThrownBy(() -> new AllowedDomains(entries))
            .as(name)
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining(c.path("reason").asText());
      }
    }
  }

  @Test
  void everyEnvironmentCase() {
    for (JsonNode c : VECTORS.path("envCases")) {
      String value = c.path("value").isNull() ? null : c.path("value").asText();
      String name = c.path("name").asText();
      if (c.path("valid").asBoolean()) {
        assertThat(AllowedDomains.parse(value).entries())
            .as(name)
            .isEqualTo(strings(c.path("entries")));
      } else {
        assertThatThrownBy(() -> AllowedDomains.parse(value))
            .as(name)
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining(c.path("reason").asText());
      }
    }
  }

  @Test
  void everyHostExtractionCase() {
    for (JsonNode c : VECTORS.path("hostCases")) {
      String expected = c.path("host").isNull() ? null : c.path("host").asText();
      assertThat(AllowedDomains.hostOf(c.path("url").asText()))
          .as(c.path("name").asText())
          .isEqualTo(expected);
    }
  }

  @Test
  void everyMatchCase() {
    for (JsonNode c : VECTORS.path("matchCases")) {
      assertThat(new AllowedDomains(strings(c.path("entries"))).allows(c.path("url").asText()))
          .as(c.path("name").asText())
          .isEqualTo(c.path("match").asBoolean());
    }
  }

  @Test
  void noneDeniesAndNullNeverMatches() {
    assertThat(AllowedDomains.none().allows("https://citi.com/")).isFalse();
    assertThat(new AllowedDomains(List.of("citi.com")).allows(null)).isFalse();
  }

  @Test
  void theBoundPropertyDefaultsToDenyAllAndParsesTheEnvironmentForm() {
    assertThat(new AllowedDomains.Properties("", "false").domains().entries()).isEmpty();
    assertThat(new AllowedDomains.Properties("localhost,example.com", "false").domains().entries())
        .containsExactly("localhost", "example.com");
    assertThatThrownBy(() -> new AllowedDomains.Properties("Example.com", "false").domains())
        .hasMessageContaining("UPPERCASE");
  }

  private final ApplicationContextRunner startup =
      new ApplicationContextRunner().withUserConfiguration(AllowedDomainsConfiguration.class);

  @Test
  void startupFailsOnAnInvalidListAndAnUnsetListIsDenyAll() {
    startup.run(
        context -> {
          assertThat(context).hasNotFailed();
          assertThat(context.getBean(AllowedDomains.class).entries()).isEmpty();
        });
    startup
        .withPropertyValues("studio.navigation.allowed-domains=localhost,example.com")
        .run(
            context ->
                assertThat(context.getBean(AllowedDomains.class).entries())
                    .containsExactly("localhost", "example.com"));
    for (String invalid :
        List.of(
            "*.citi.com",
            "Citi.com",
            "127.0.0.1",
            "https://citi.com",
            "citi.com:443",
            "citi.com,www.citi.com",
            "citi.com, localhost")) {
      startup
          .withPropertyValues("studio.navigation.allowed-domains=" + invalid)
          .run(context -> assertThat(context).as(invalid).hasFailed());
    }
  }

  @Test
  void anExplicitFalseAndTheListConstructorsLeaveTheListRuleUntouched() {
    // The deployment default (application.yml, ON for now) is not under test here: the programmatic
    // constructors and an explicit false are plain list mode.
    assertThat(AllowedDomains.none().allowAll()).isFalse();
    assertThat(new AllowedDomains(List.of("citi.com")).allowAll()).isFalse();
    AllowedDomains off = new AllowedDomains(List.of("citi.com"), false);
    assertThat(off.allows("https://www.citi.com/")).isTrue();
    assertThat(off.allows("https://other.example/")).isFalse();
    assertThat(new AllowedDomains.Properties("", "false").domains().allows("https://citi.com/"))
        .isFalse();
  }

  @Test
  void allowAllAdmitsAnyDnsHostButNothingTheListParseRefuses() {
    AllowedDomains all = new AllowedDomains.Properties("", "true").domains();
    assertThat(all.allowAll()).isTrue();
    assertThat(all.entries()).isEmpty();
    assertThat(all.allows("https://anything.example:8443/x?y#z")).isTrue();
    for (String refused :
        List.of(
            "http://10.0.0.1/",
            "http://[::1]/",
            "https://user@citi.com/",
            "ftp://citi.com/",
            "about:blank",
            "https://citi.com./",
            "")) {
      assertThat(all.allows(refused)).as(refused).isFalse();
    }
    assertThat(all.allows(null)).isFalse();
  }

  @Test
  void anInvalidListFailsEvenWhenAllowAllIsOn() {
    assertThatThrownBy(() -> new AllowedDomains.Properties("*.citi.com", "true").domains())
        .hasMessageContaining("WILDCARD");
  }

  @Test
  void startupAcceptsOnlyTrueOrFalseForAllowAllAndWarnsOnceWhenOn() {
    Logger logger = (Logger) LoggerFactory.getLogger(AllowedDomainsConfiguration.class);
    ListAppender<ILoggingEvent> appender = new ListAppender<>();
    appender.start();
    logger.addAppender(appender);
    try {
      startup
          .withPropertyValues("studio.navigation.allow-all-domains=false")
          .run(context -> assertThat(context.getBean(AllowedDomains.class).allowAll()).isFalse());
      assertThat(appender.list).noneMatch(e -> e.getLevel() == Level.WARN);

      startup
          .withPropertyValues(
              "studio.navigation.allow-all-domains=true",
              "studio.navigation.allowed-domains=citi.com")
          .run(
              context -> {
                AllowedDomains domains = context.getBean(AllowedDomains.class);
                assertThat(domains.allowAll()).isTrue();
                assertThat(domains.allows("https://elsewhere.example/")).isTrue();
              });
      assertThat(appender.list)
          .filteredOn(e -> e.getLevel() == Level.WARN)
          .hasSize(1)
          .allSatisfy(
              e -> {
                assertThat(e.getFormattedMessage())
                    .isEqualTo("Studio navigation allowed to all domains (allow-all-domains=true)");
                assertThat(e.getFormattedMessage()).doesNotContain("citi.com", "http");
              });
    } finally {
      logger.detachAppender(appender);
    }
    // Padded values are covered by everyAllowAllEnvironmentCase: the test property helper trims
    // them.
    for (String invalid : List.of("TRUE", "True", "1", "yes", "on", "maybe")) {
      startup
          .withPropertyValues("studio.navigation.allow-all-domains=" + invalid)
          .run(context -> assertThat(context).as(invalid).hasFailed());
    }
  }
}

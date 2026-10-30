package com.citi.put.checks.studio.support;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.spi.ILoggingEvent;
import com.citi.put.checks.studio.guided.audit.StudioActionAudit;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * STUDIO-OBS-014 AC-4 "no regression in grounded cases, counted" (po-qa014-rulings a1): a
 * test-side, assertion-backed tally of every action-guard decision a joined class's real
 * translation path makes. No product seam: each decision leaves a durable or audited trace.
 *
 * <ul>
 *   <li><b>passed</b>: a translated click/press/check proposal the guard let through is reserved as
 *       one {@code studio_guided_obligation_admissions} row (only the translation path writes it;
 *       directly built ledger proposals never do).
 *   <li><b>refused</b>: every guard refusal emits one {@code GUIDED_ACTION_REFUSED} audit event at
 *       the decision (the only emitter is the guard), with its closed {@code reasonCode}.
 * </ul>
 *
 * <p>Per test it asserts that a refusal occurs only in a test listed as planting one; an unplanted
 * refusal fails that test (AC-4). Per class it writes {@code build/guard-tally/<class>.json} with
 * every recorded test by name and the totals, for the S4 run record.
 */
public final class GuardDecisionTally {

  private static final ObjectMapper JSON = new ObjectMapper();
  private static final Set<String> GUARDED_KINDS = Set.of("click", "press", "check");
  private static final Map<String, List<ObjectNode>> RECORDS = new ConcurrentHashMap<>();

  private GuardDecisionTally() {}

  /** The single output root supplied unconditionally by the owning Gradle Test task. */
  public static Path buildDirectory() {
    String configured = System.getProperty("checks.test.buildDirectory");
    if (configured == null || configured.isBlank()) {
      throw new IllegalStateException("Gradle test build directory missing");
    }
    Path root = Path.of(configured);
    if (!root.isAbsolute()) {
      throw new IllegalStateException("Gradle test build directory must be absolute");
    }
    return root.normalize();
  }

  /** The session ids that exist now; pass the result to {@link #record} after the test. */
  public static Set<String> sessions(JdbcTemplate jdbc) {
    return new HashSet<>(
        jdbc.queryForList("SELECT session_id FROM studio_guided_sessions", String.class));
  }

  /**
   * Records one test's guard decisions and asserts that any refusal was planted.
   *
   * @param before the session ids that existed before the test ({@link #sessions})
   * @param audit the audit events the test emitted (only this test's)
   * @param planted the test names (method names) of this class that plant a guard refusal
   */
  public static void record(
      Class<?> testClass,
      String testName,
      JdbcTemplate jdbc,
      Set<String> before,
      List<ILoggingEvent> audit,
      Set<String> planted) {
    Set<String> created = sessions(jdbc);
    created.removeAll(before);
    ObjectNode row = JSON.createObjectNode().put("test", testName).put("sessions", created.size());
    ObjectNode passed = row.putObject("passed");
    GUARDED_KINDS.forEach(kind -> passed.put(kind, 0));
    for (String session : created) {
      for (String kind :
          jdbc.queryForList(
              "SELECT proposal->'operation'->>'kind' FROM studio_guided_obligation_admissions"
                  + " WHERE session_id=?",
              String.class,
              session)) {
        if (GUARDED_KINDS.contains(kind)) {
          passed.put(kind, passed.path(kind).asInt() + 1);
        }
      }
    }
    ObjectNode refused = row.putObject("refused");
    int refusals = 0;
    for (ILoggingEvent event : audit) {
      if (!event
          .getFormattedMessage()
          .equals(StudioActionAudit.EventType.GUIDED_ACTION_REFUSED.name())) {
        continue;
      }
      String reason = "none";
      for (Object argument : event.getArgumentArray()) {
        String field = String.valueOf(argument);
        if (field.startsWith("reasonCode=")) {
          reason = field.substring("reasonCode=".length());
        }
      }
      refused.put(reason, refused.path(reason).asInt() + 1);
      refusals++;
    }
    RECORDS
        .computeIfAbsent(
            testClass.getSimpleName(),
            ignored -> java.util.Collections.synchronizedList(new java.util.ArrayList<>()))
        .add(row);
    assertThat(refusals == 0 || planted.contains(testName))
        .as(
            "AC-4: %s made %d unplanted guard refusal(s) %s; only %s plant one",
            testName, refusals, refused, planted)
        .isTrue();
  }

  /**
   * Writes the class's tally (every recorded test by name, and totals) under the owning Gradle test
   * build directory.
   */
  public static void write(Class<?> testClass) throws Exception {
    List<ObjectNode> rows = List.copyOf(RECORDS.getOrDefault(testClass.getSimpleName(), List.of()));
    ObjectNode out = JSON.createObjectNode().put("class", testClass.getName());
    out.put("testsRecorded", rows.size());
    ArrayNode tests = out.putArray("tests");
    ObjectNode totals = out.putObject("totals");
    ObjectNode passed = totals.putObject("passed");
    GUARDED_KINDS.forEach(kind -> passed.put(kind, 0));
    ObjectNode refused = totals.putObject("refused");
    for (ObjectNode row : rows) {
      tests.add(row);
      row.path("passed")
          .fields()
          .forEachRemaining(
              e -> passed.put(e.getKey(), passed.path(e.getKey()).asInt() + e.getValue().asInt()));
      row.path("refused")
          .fields()
          .forEachRemaining(
              e ->
                  refused.put(e.getKey(), refused.path(e.getKey()).asInt() + e.getValue().asInt()));
    }
    Path directory = buildDirectory().resolve("guard-tally");
    Files.createDirectories(directory);
    Files.writeString(
        directory.resolve(testClass.getSimpleName() + ".json"),
        JSON.writerWithDefaultPrettyPrinter().writeValueAsString(out));
  }
}

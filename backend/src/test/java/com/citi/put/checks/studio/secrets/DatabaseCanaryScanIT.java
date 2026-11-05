package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.RecordingRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.RunJob;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * STUDIO-OBS-009 AC-4 (design I-B7): a database-wide canary scan after a full run returns zero
 * hits.
 *
 * <p>The run is the replay path end to end through the real application and a real PostgreSQL: a
 * secret is saved over HTTP (and refused, duplicated and mis-addressed saves are attempted with the
 * same value in the body), a test that declares the secret is accepted and dispatched (the value is
 * resolved and handed to the runner double, which proves it is present where it belongs), the
 * runner is admitted, reports STARTED and a terminal FINAL, and the execution is read back through
 * the API. Then <b>every column of every base table in schema {@code public}</b> is searched for
 * the canary in each form a copy could take: raw, URL-encoded, JSON unicode-escaped, hexadecimal,
 * and Base64 at all three byte alignments (standard and URL-safe).
 *
 * <p>The scan is shown to see before it is trusted to say nothing: a control table holding the
 * canary in a {@code text}, {@code varchar}, {@code jsonb}, {@code bytea}, {@code text[]} and a
 * Base64 column must be reported column by column, and the control is dropped before the real scan.
 * Coverage is asserted too, so a schema change that hid the sensitive tables from the scan fails
 * the test instead of passing it.
 *
 * <p>The guided path is scanned by {@link CanaryScan#hits}, which lane F's co-run calls after its
 * own guided run; this test does not start a runner. The ED-02 Vault policy half of AC-4 is not
 * here: see {@code VaultPolicyIT}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
class DatabaseCanaryScanIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60499";
  private static final String OWNER = "canary-owner@citi.com";
  private static final String STRANGER = "canary-stranger@citi.com";
  private static final String ENVIRONMENT = "Production";
  private static final String RUNNER = "studio-runner-canary";
  private static final String SECRET_NAME = "LOGIN_PW";

  /** Spaces, slash, plus, equals, percent, ampersand, angle brackets and non-ASCII, no quote. */
  private static final String CANARY = "Obs009 Cn/ry+9f2c=%ü&<x>-never-stored";

  @TestConfiguration
  static class Doubles {

    @Bean
    @Primary
    FakeStudioVaultProvider fakeVault() {
      return new FakeStudioVaultProvider(Map.of());
    }

    @Bean
    @Primary
    RecordingRunnerDispatchClient recordingRunnerDispatchClient() {
      return new RecordingRunnerDispatchClient();
    }
  }

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private FakeStudioVaultProvider vault;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private AdmissionCasService admissionService;
  @Autowired private ProgressReportService progressService;
  @Autowired private ObservedReplayAuthorization observedAuthorization;

  private StudioExecutionFixtures fixtures;

  @BeforeEach
  void setUp() {
    vault.clear();
    runner.reset();
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(STRANGER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
  }

  // ---- the scanner sees before it is trusted to say nothing ----

  @Test
  void theScannerReportsAPlantedCopyInEveryColumnTypeAndEveryEncoding() {
    jdbc.execute("DROP TABLE IF EXISTS obs009_canary_control");
    jdbc.execute(
        "CREATE TABLE obs009_canary_control (t text, v varchar(200), j jsonb, b bytea, a text[],"
            + " e text, u text, x text, h text, ju text)");
    try {
      byte[] raw = CANARY.getBytes(StandardCharsets.UTF_8);
      jdbc.update(
          "INSERT INTO obs009_canary_control VALUES (?, ?, ?::jsonb, ?, ?::text[], ?, ?, ?, ?, ?)",
          CANARY,
          CANARY,
          "{\"k\":\"" + CANARY + "\"}",
          raw,
          "{\"" + CANARY + "\"}",
          Base64.getEncoder()
              .encodeToString(("prefix-" + CANARY + "-suffix").getBytes(StandardCharsets.UTF_8)),
          URLEncoder.encode(CANARY, StandardCharsets.UTF_8),
          Base64.getUrlEncoder()
              .withoutPadding()
              .encodeToString(("xy" + CANARY).getBytes(StandardCharsets.UTF_8)),
          HexFormat.of().formatHex(raw),
          CANARY.replace("ü", "\\u00fc"));

      Set<String> hits = new TreeSet<>(CanaryScan.hits(jdbc, CANARY));

      assertThat(hits)
          .contains(
              "obs009_canary_control.t",
              "obs009_canary_control.v",
              "obs009_canary_control.j",
              "obs009_canary_control.b",
              "obs009_canary_control.a",
              "obs009_canary_control.e",
              "obs009_canary_control.u",
              "obs009_canary_control.x",
              "obs009_canary_control.h",
              "obs009_canary_control.ju");
    } finally {
      jdbc.execute("DROP TABLE IF EXISTS obs009_canary_control");
    }
  }

  // ---- the full run ----

  @Test
  void aFullRunLeavesTheCanaryInNoColumnOfTheDatabase() throws Exception {
    // 1. Saves that must leave nothing behind: a stranger, an absent test, an outage, a duplicate.
    UUID declaring =
        fixtures.seedTest("Canary draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        declaring,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of(SECRET_NAME)));
    assertThat(create(declaring, stranger()).getStatusCode().value()).isEqualTo(403);
    assertThat(create(UUID.randomUUID(), owner()).getStatusCode().value()).isEqualTo(403);
    vault.makeUnavailable();
    assertThat(create(declaring, owner()).getStatusCode().value()).isEqualTo(503);
    vault.clear();

    // 2. The real save, and a duplicate of it.
    assertThat(create(declaring, owner()).getStatusCode().value()).isEqualTo(201);
    assertThat(create(declaring, owner()).getStatusCode().value()).isEqualTo(409);

    // 3. Accept and dispatch: the value reaches the runner double and nowhere else.
    Authentication caller = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
    UUID execution =
        studioService
            .executeTest(declaring, caller, null, ObservedPublicationFixture.request(caller))
            .executionId();
    var delivered = new java.util.concurrent.atomic.AtomicBoolean();
    runner.onSend(job -> delivered.set(job.resolvedSecrets().get(SECRET_NAME).matches(CANARY)));
    dispatcher.dispatch(execution);
    assertThat(delivered).as("the canary was resolved and handed to the runner").isTrue();
    RunJob sent =
        runner.sent().stream()
            .filter(job -> execution.equals(job.executionId()))
            .findFirst()
            .orElseThrow();
    assertThat(sent.resolvedSecrets().get(SECRET_NAME).matches(CANARY))
        .as("owned value erased after send")
        .isFalse();

    // 4. The runner is admitted, starts, and finishes.
    UUID attempt =
        UUID.fromString(
            observedAuthorization.binding(execution).orElseThrow().path("attemptId").asText());
    UUID admission = UUID.randomUUID();
    ObservedPublicationFixture.admitObserved(
        observedAuthorization, admissionService, execution, RUNNER, admission);
    Instant browserStartedAt = Instant.parse("2026-09-10T10:00:02Z");
    progressService.apply(execution, started(execution, attempt, admission, 1, browserStartedAt));
    progressService.apply(execution, terminal(execution, attempt, admission, 2, browserStartedAt));

    // 5. The API view of the finished execution carries no value either.
    ResponseEntity<String> view =
        restTemplate.exchange(
            "/api/v1/studio/executions/" + execution,
            HttpMethod.GET,
            new HttpEntity<>(owner()),
            String.class);
    assertThat(view.getStatusCode().value()).isEqualTo(200);
    for (String form : CanaryScan.forms(CANARY).values()) {
      assertThat(view.getBody()).doesNotContain(form);
    }

    // 6. The scan: wide enough to be meaningful, and empty.
    CanaryScan.Coverage coverage = CanaryScan.coverage(jdbc);
    assertThat(coverage.tables())
        .contains("ui_test_executions", "studio_dispatch_ledger", "studio_secret_use_audit");
    assertThat(coverage.tables().size()).isGreaterThan(30);
    assertThat(coverage.columns()).isGreaterThan(200);
    assertThat(CanaryScan.hits(jdbc, CANARY)).isEmpty();
  }

  // ---- the run ----

  private RunnerReport started(
      UUID execution, UUID attempt, UUID admission, long sequence, Instant browserStartedAt) {
    return new RunnerReport(
        execution,
        attempt,
        admission,
        RUNNER,
        RunnerReport.STARTED,
        sequence,
        Instant.now(),
        browserStartedAt,
        List.of(),
        List.of(new RunnerLogEntry(0.0, "info", "browser started")),
        false,
        Map.of("playwright", "1.63.0"),
        null,
        null,
        null,
        Map.of());
  }

  private RunnerReport terminal(
      UUID execution, UUID attempt, UUID admission, long sequence, Instant browserStartedAt) {
    return new RunnerReport(
        execution,
        attempt,
        admission,
        RUNNER,
        RunnerReport.FINAL,
        sequence,
        Instant.now(),
        browserStartedAt,
        List.of(new RunnerStepState(0, StepResult.PASS, 120.0, 4300.0, 4180.0, null)),
        List.of(
            new RunnerLogEntry(0.0, "info", "browser started"),
            new RunnerLogEntry(null, "info", "run PASSED")),
        false,
        Map.of("playwright", "1.63.0"),
        new RunOutcome(RunOutcome.PASSED, null, null, null),
        new RunnerEvidence(
            "studio/video.webm", "studio/manifest.result.json", RunnerEvidence.STORED, false),
        null,
        Map.of());
  }

  // ---- HTTP ----

  private ResponseEntity<String> create(UUID test, HttpHeaders headers) throws Exception {
    String body =
        objectMapper.writeValueAsString(
            Map.of(
                "name",
                SECRET_NAME,
                "value",
                CANARY,
                "allowedOrigins",
                List.of("https://login.app.example")));
    return restTemplate.exchange(
        "/api/v1/studio/tests/" + test + "/secrets",
        HttpMethod.POST,
        new HttpEntity<>(body, headers),
        String.class);
  }

  private static HttpHeaders stranger() {
    return identity(STRANGER, "");
  }

  private static HttpHeaders owner() {
    return identity(OWNER, CSI_ID + ":owner");
  }

  private static HttpHeaders identity(String email, String ownership) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", "uid-" + email);
    headers.set("X-User-Email", email);
    headers.set("X-User-Roles", "");
    headers.set("X-User-Csi-Ownership", ownership);
    return ObservedPublicationFixture.withSession(headers);
  }

  /**
   * The scanner, public so that the co-run can call it after a guided run (STUDIO-OBS-009 AC-4,
   * AC-11). It searches every column of every base table in schema {@code public}.
   */
  public static final class CanaryScan {

    private CanaryScan() {}

    /** What the scan covers. */
    public record Coverage(Set<String> tables, int columns) {}

    /**
     * The forms a copy of {@code canary} could take, by name. Base64 appears at all three byte
     * alignments, reduced to the characters fully determined by the value.
     *
     * @param canary the plaintext
     * @return label to needle, in a stable order
     */
    public static Map<String, String> forms(String canary) {
      byte[] raw = canary.getBytes(StandardCharsets.UTF_8);
      Map<String, String> forms = new LinkedHashMap<>();
      forms.put("raw", canary);
      String url = URLEncoder.encode(canary, StandardCharsets.UTF_8);
      forms.put("url", url);
      forms.put("urlPercent", url.replace("+", "%20"));
      forms.put("jsonUnicode", canary.replace("ü", "\\u00fc"));
      forms.put("hex", HexFormat.of().formatHex(raw));
      for (int pad = 0; pad < 3; pad++) {
        byte[] data = new byte[pad + raw.length];
        System.arraycopy(raw, 0, data, pad, raw.length);
        int start = (pad * 8 + 5) / 6;
        int end = (data.length * 8) / 6;
        forms.put(
            "base64+" + pad,
            Base64.getEncoder().withoutPadding().encodeToString(data).substring(start, end));
        forms.put(
            "base64url+" + pad,
            Base64.getUrlEncoder().withoutPadding().encodeToString(data).substring(start, end));
      }
      return forms;
    }

    /**
     * The tables and column count the scan reaches.
     *
     * @param jdbc the database to scan
     * @return the base tables of schema {@code public} and how many columns they have
     */
    public static Coverage coverage(JdbcTemplate jdbc) {
      Set<String> tables = new LinkedHashSet<>();
      int columns = 0;
      for (Map<String, Object> column : columns(jdbc)) {
        tables.add((String) column.get("table_name"));
        columns++;
      }
      return new Coverage(tables, columns);
    }

    /**
     * Every {@code table.column} of schema {@code public} that holds any form of the canary.
     *
     * @param jdbc the database to scan
     * @param canary the plaintext to look for
     * @return the hits; empty when the canary is nowhere
     */
    public static List<String> hits(JdbcTemplate jdbc, String canary) {
      Map<String, String> forms = forms(canary);
      Set<String> hits = new TreeSet<>();
      for (Map<String, Object> column : columns(jdbc)) {
        String table = (String) column.get("table_name");
        String name = (String) column.get("column_name");
        boolean bytes = "bytea".equals(column.get("data_type"));
        String quotedTable = '"' + table + '"';
        String quotedName = '"' + name + '"';
        for (String needle : forms.values()) {
          String predicate =
              bytes
                  ? "position(convert_to(?, 'UTF8') in " + quotedName + ") > 0"
                  : "strpos(" + quotedName + "::text, ?) > 0";
          Integer count =
              jdbc.queryForObject(
                  "SELECT count(*) FROM " + quotedTable + " WHERE " + predicate,
                  Integer.class,
                  needle);
          if (count != null && count > 0) {
            hits.add(table + "." + name);
            break;
          }
        }
      }
      return new ArrayList<>(hits);
    }

    private static List<Map<String, Object>> columns(JdbcTemplate jdbc) {
      List<Map<String, Object>> columns =
          jdbc.queryForList(
              "SELECT c.table_name, c.column_name, c.data_type FROM information_schema.columns c"
                  + " JOIN information_schema.tables t ON t.table_schema = c.table_schema"
                  + " AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'"
                  + " WHERE c.table_schema = 'public' ORDER BY c.table_name, c.ordinal_position");
      assertThat(columns).as("the scan must have columns to scan").isNotEmpty();
      return columns;
    }
  }
}

package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.46 — server-side search, filter and sort of the two Studio lists, against the real
 * schema.
 *
 * <p>Each case checks the filter or order it names <em>and</em> that the CSI scope still holds: the
 * other CSI always has a row that would match, so a filter that replaced the scope instead of
 * narrowing it would be visible in {@code data} and in {@code totalElements}.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioListQueryIT {

  private static final String OWNER = "list-query-owner@citi.com";
  private static final String MINE = "60461";
  private static final String THEIRS = "60462";
  private static final String MINE_VIEWER = MINE + ":viewer";
  private static final Instant T0 = Instant.parse("2026-06-12T09:00:00Z");

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;

  @BeforeEach
  void setUp() {
    jdbc.update("DELETE FROM studio_dispatch_ledger WHERE csi_id IN (?, ?)", MINE, THEIRS);
    jdbc.update(
        "DELETE FROM ui_test_executions WHERE ui_test_id IN"
            + " (SELECT id FROM ui_tests WHERE csi_id IN (?, ?))",
        MINE,
        THEIRS);
    jdbc.update("DELETE FROM ui_tests WHERE csi_id IN (?, ?)", MINE, THEIRS);
    seedUser();
    seedCsi(MINE, "List mine");
    seedCsi(THEIRS, "List theirs");
  }

  // ── GET /tests: filters ──────────────────────────────────────────────────

  @Test
  void qMatchesNameOrDescriptionCaseInsensitivelyWithinTheScope() throws Exception {
    UUID byName = seedTest(MINE, "Checkout LOGIN flow", null, "Production");
    UUID byDescription = seedTest(MINE, "Smoke", "covers the login page", "Production");
    seedTest(MINE, "Payments", "unrelated", "Production");
    seedTest(THEIRS, "Their login", null, "Production");

    JsonNode page = getOk("/api/v1/studio/tests?q=Login", MINE_VIEWER);

    assertThat(ids(page)).containsExactlyInAnyOrder(byName, byDescription);
    assertThat(page.path("totalElements").asLong()).isEqualTo(2L);
  }

  @Test
  void qTreatsLikeWildcardsAsLiterals() throws Exception {
    UUID literal = seedTest(MINE, "50% off_banner", null, "Production");
    seedTest(MINE, "500 offers", null, "Production");

    assertThat(ids(getOk("/api/v1/studio/tests?q=50%", MINE_VIEWER))).containsExactly(literal);
    assertThat(ids(getOk("/api/v1/studio/tests?q=off_", MINE_VIEWER))).containsExactly(literal);
  }

  @Test
  void environmentFiltersExactly() throws Exception {
    UUID uat = seedTest(MINE, "On UAT", null, "UAT");
    seedTest(MINE, "On Production", null, "Production");
    seedTest(THEIRS, "Theirs on UAT", null, "UAT");

    JsonNode page = getOk("/api/v1/studio/tests?environment=UAT", MINE_VIEWER);

    assertThat(ids(page)).containsExactly(uat);
    assertThat(page.path("totalElements").asLong()).isEqualTo(1L);
  }

  @Test
  void lastRunFiltersOnTheProjectionAndNeverMeansNoFinishedRun() throws Exception {
    UUID passed = seedTest(MINE, "Passed", null, "Production");
    UUID failed = seedTest(MINE, "Failed", null, "Production");
    UUID errored = seedTest(MINE, "Errored", null, "Production");
    UUID never = seedTest(MINE, "Never", null, "Production");
    UUID theirsNever = seedTest(THEIRS, "Theirs never", null, "Production");
    project(passed, "PASSED", T0);
    project(failed, "FAILED", T0);
    project(errored, "ERROR", T0);

    assertThat(ids(getOk("/api/v1/studio/tests?lastRun=PASSED", MINE_VIEWER)))
        .containsExactly(passed);
    assertThat(ids(getOk("/api/v1/studio/tests?lastRun=failed", MINE_VIEWER)))
        .containsExactly(failed);
    assertThat(ids(getOk("/api/v1/studio/tests?lastRun=ERROR", MINE_VIEWER)))
        .containsExactly(errored);
    assertThat(ids(getOk("/api/v1/studio/tests?lastRun=NEVER", MINE_VIEWER)))
        .containsExactly(never)
        .doesNotContain(theirsNever);
  }

  @Test
  void deletedDraftsStayHiddenWhateverTheFilter() throws Exception {
    UUID deleted = seedTest(MINE, "Deleted login", null, "Production");
    jdbc.update("UPDATE ui_tests SET deleted_at = now() WHERE id = ?", deleted);

    assertThat(ids(getOk("/api/v1/studio/tests?q=login&lastRun=NEVER", MINE_VIEWER))).isEmpty();
  }

  @Test
  void anExplicitCsiFilterStillCannotWidenTheScope() throws Exception {
    seedTest(THEIRS, "Theirs", null, "Production");

    JsonNode page = getOk("/api/v1/studio/tests?csiId=" + THEIRS + "&q=Theirs", MINE_VIEWER);

    assertThat(page.path("totalElements").asLong()).isZero();
  }

  // ── GET /tests: sort ─────────────────────────────────────────────────────

  @Test
  void theDefaultOrderIsUpdatedAtDescendingWithIdBreakingTies() throws Exception {
    UUID oldest = seedTest(MINE, "Oldest", null, "Production", T0);
    UUID tieA = seedTest(MINE, "Tie A", null, "Production", T0.plusSeconds(60));
    UUID tieB = seedTest(MINE, "Tie B", null, "Production", T0.plusSeconds(60));
    List<UUID> ties = sortedDescending(tieA, tieB);

    List<UUID> order = ids(getOk("/api/v1/studio/tests", MINE_VIEWER));

    assertThat(order).containsExactly(ties.get(0), ties.get(1), oldest);
    assertThat(ids(getOk("/api/v1/studio/tests?sort=updatedAt,desc", MINE_VIEWER)))
        .isEqualTo(order);
  }

  @Test
  void tiesPageDeterministicallyWithoutDuplicatesOrGaps() throws Exception {
    List<UUID> seeded = new ArrayList<>();
    for (int i = 0; i < 5; i++) {
      seeded.add(seedTest(MINE, "Same instant " + i, null, "Production", T0));
    }
    List<UUID> paged = new ArrayList<>();
    for (int page = 0; page < 3; page++) {
      paged.addAll(
          ids(
              getOk(
                  "/api/v1/studio/tests?size=2&page=" + page + "&sort=updatedAt,asc",
                  MINE_VIEWER)));
    }

    assertThat(paged).containsExactlyElementsOf(sortedAscending(seeded));
  }

  @Test
  void nameSortsCaseInsensitively() throws Exception {
    UUID beta = seedTest(MINE, "beta", null, "Production");
    UUID alpha = seedTest(MINE, "Alpha", null, "Production");
    UUID charlie = seedTest(MINE, "Charlie", null, "Production");

    assertThat(ids(getOk("/api/v1/studio/tests?sort=name,asc", MINE_VIEWER)))
        .containsExactly(alpha, beta, charlie);
    assertThat(ids(getOk("/api/v1/studio/tests?sort=name,desc", MINE_VIEWER)))
        .containsExactly(charlie, beta, alpha);
  }

  @Test
  void lastRunAtSortsNeverRunDraftsLastInBothDirections() throws Exception {
    UUID early = seedTest(MINE, "Early", null, "Production");
    UUID late = seedTest(MINE, "Late", null, "Production");
    UUID never = seedTest(MINE, "Never", null, "Production");
    project(early, "PASSED", T0);
    project(late, "FAILED", T0.plusSeconds(3600));

    assertThat(ids(getOk("/api/v1/studio/tests?sort=lastRunAt,desc", MINE_VIEWER)))
        .containsExactly(late, early, never);
    assertThat(ids(getOk("/api/v1/studio/tests?sort=lastRunAt,asc", MINE_VIEWER)))
        .containsExactly(early, late, never);
  }

  @Test
  void anUnknownTestSortIsABadRequest() throws Exception {
    ResponseEntity<String> response = get("/api/v1/studio/tests?sort=createdAt,desc", MINE_VIEWER);

    assertThat(response.getStatusCode().value()).isEqualTo(400);
    assertThat(objectMapper.readTree(response.getBody()).path("error").asText())
        .isEqualTo(StudioListQuery.INVALID_QUERY);
    assertThat(get("/api/v1/studio/tests?lastRun=MAYBE", MINE_VIEWER).getStatusCode().value())
        .isEqualTo(400);
  }

  // ── GET /executions: filters ─────────────────────────────────────────────

  @Test
  void statusSeparatesCancelledFromOtherErrorsLikeTheMfe() throws Exception {
    UUID test = seedTest(MINE, "Runs", null, "Production");
    UUID passed = seedExecution(test, MINE, "PASSED", null, 1000, T0);
    UUID error = seedExecution(test, MINE, "ERROR", "TIMEOUT", 2000, T0.plusSeconds(1));
    UUID bareError = seedExecution(test, MINE, "ERROR", null, null, T0.plusSeconds(2));
    UUID cancelled = seedExecution(test, MINE, "ERROR", "CANCELLED", null, T0.plusSeconds(3));
    UUID running = seedExecution(test, MINE, "RUNNING", null, null, T0.plusSeconds(4));
    seedExecution(
        seedTest(THEIRS, "Theirs", null, "Production"), THEIRS, "ERROR", "CANCELLED", null, T0);

    assertThat(executionIds(getOk("/api/v1/studio/executions?status=PASSED", MINE_VIEWER)))
        .containsExactly(passed);
    assertThat(executionIds(getOk("/api/v1/studio/executions?status=ERROR", MINE_VIEWER)))
        .containsExactlyInAnyOrder(error, bareError);
    JsonNode cancelledPage = getOk("/api/v1/studio/executions?status=CANCELLED", MINE_VIEWER);
    assertThat(executionIds(cancelledPage)).containsExactly(cancelled);
    assertThat(cancelledPage.path("totalElements").asLong()).isEqualTo(1L);
    assertThat(executionIds(getOk("/api/v1/studio/executions?status=running", MINE_VIEWER)))
        .containsExactly(running);
    assertThat(executionIds(getOk("/api/v1/studio/executions?status=PENDING", MINE_VIEWER)))
        .isEmpty();
  }

  @Test
  void csiIdNarrowsTheScopeAndNeverWidensIt() throws Exception {
    UUID mineRun =
        seedExecution(seedTest(MINE, "Mine", null, "Production"), MINE, "PASSED", null, 1, T0);
    UUID theirRun =
        seedExecution(
            seedTest(THEIRS, "Theirs", null, "Production"), THEIRS, "PASSED", null, 1, T0);

    // A viewer of MINE asking for THEIRS gets nothing, not THEIRS.
    JsonNode widened = getOk("/api/v1/studio/executions?csiId=" + THEIRS, MINE_VIEWER);
    assertThat(widened.path("totalElements").asLong()).isZero();

    // A reader of both narrows to the one asked for.
    String both = MINE_VIEWER + "," + THEIRS + ":viewer";
    assertThat(executionIds(getOk("/api/v1/studio/executions?csiId=" + THEIRS, both)))
        .containsExactly(theirRun);

    // An unrestricted administrator narrows the same way.
    assertThat(executionIds(getAsAdmin("/api/v1/studio/executions?csiId=" + MINE)))
        .containsExactly(mineRun);
  }

  @Test
  void qMatchesTheVisibleTestNameOnly() throws Exception {
    UUID checkout = seedTest(MINE, "Checkout Smoke", null, "Production");
    UUID other = seedTest(MINE, "Payments", "checkout in description only", "Production");
    UUID deleted = seedTest(MINE, "Checkout retired", null, "Production");
    UUID match = seedExecution(checkout, MINE, "PASSED", null, 1, T0);
    seedExecution(other, MINE, "PASSED", null, 1, T0);
    seedExecution(deleted, MINE, "PASSED", null, 1, T0);
    seedExecution(
        seedTest(THEIRS, "Checkout theirs", null, "Production"), THEIRS, "PASSED", null, 1, T0);
    jdbc.update("UPDATE ui_tests SET deleted_at = now() WHERE id = ?", deleted);

    JsonNode page = getOk("/api/v1/studio/executions?q=CHECKOUT", MINE_VIEWER);

    assertThat(executionIds(page)).containsExactly(match);
    assertThat(page.path("totalElements").asLong()).isEqualTo(1L);
  }

  // ── GET /executions: sort ────────────────────────────────────────────────

  @Test
  void theDefaultOrderIsAcceptedAtDescendingWithIdBreakingTies() throws Exception {
    UUID test = seedTest(MINE, "Runs", null, "Production");
    UUID first = seedExecution(test, MINE, "PASSED", null, 1, T0);
    UUID tieA = seedExecution(test, MINE, "PASSED", null, 1, T0.plusSeconds(10));
    UUID tieB = seedExecution(test, MINE, "PASSED", null, 1, T0.plusSeconds(10));
    List<UUID> ties = sortedDescending(tieA, tieB);

    List<UUID> order = executionIds(getOk("/api/v1/studio/executions", MINE_VIEWER));

    assertThat(order).containsExactly(ties.get(0), ties.get(1), first);
    assertThat(executionIds(getOk("/api/v1/studio/executions?sort=acceptedAt,asc", MINE_VIEWER)))
        .containsExactly(first, ties.get(1), ties.get(0));
  }

  @Test
  void durationSortsUnfinishedRunsLastInBothDirections() throws Exception {
    UUID test = seedTest(MINE, "Runs", null, "Production");
    UUID quick = seedExecution(test, MINE, "PASSED", null, 850, T0);
    UUID slow = seedExecution(test, MINE, "FAILED", null, 125_000, T0.plusSeconds(1));
    UUID running = seedExecution(test, MINE, "RUNNING", null, null, T0.plusSeconds(2));

    assertThat(executionIds(getOk("/api/v1/studio/executions?sort=durationMs,asc", MINE_VIEWER)))
        .containsExactly(quick, slow, running);
    assertThat(executionIds(getOk("/api/v1/studio/executions?sort=durationMs,desc", MINE_VIEWER)))
        .containsExactly(slow, quick, running);
  }

  @Test
  void anUnknownExecutionSortOrStatusIsABadRequest() throws Exception {
    ResponseEntity<String> sort = get("/api/v1/studio/executions?sort=createdAt,desc", MINE_VIEWER);
    ResponseEntity<String> status = get("/api/v1/studio/executions?status=DONE", MINE_VIEWER);

    assertThat(sort.getStatusCode().value()).isEqualTo(400);
    assertThat(status.getStatusCode().value()).isEqualTo(400);
    assertThat(objectMapper.readTree(status.getBody()).path("error").asText())
        .isEqualTo(StudioListQuery.INVALID_QUERY);
  }

  // ── testName ─────────────────────────────────────────────────────────────

  @Test
  void listItemsCarryTheTestNameAndNullForADeletedTest() throws Exception {
    UUID live = seedTest(MINE, "Live test", null, "Production");
    UUID gone = seedTest(MINE, "Gone test", null, "Production");
    UUID liveRun = seedExecution(live, MINE, "PASSED", null, 1, T0);
    UUID liveRun2 = seedExecution(live, MINE, "FAILED", null, 1, T0.plusSeconds(1));
    UUID goneRun = seedExecution(gone, MINE, "PASSED", null, 1, T0.plusSeconds(2));
    jdbc.update("UPDATE ui_tests SET deleted_at = now() WHERE id = ?", gone);

    JsonNode page = getOk("/api/v1/studio/executions", MINE_VIEWER);

    assertThat(itemOf(page, liveRun).path("testName").asText()).isEqualTo("Live test");
    assertThat(itemOf(page, liveRun2).path("testName").asText()).isEqualTo("Live test");
    JsonNode goneItem = itemOf(page, goneRun);
    assertThat(goneItem.has("testName")).isTrue();
    assertThat(goneItem.path("testName").isNull()).isTrue();
  }

  @Test
  void theSingleReadCarriesTheTestNameToo() throws Exception {
    UUID test = seedTest(MINE, "Single read", null, "Production");
    UUID run = seedExecution(test, MINE, "PASSED", null, 1, T0);

    JsonNode snapshot = getOk("/api/v1/studio/executions/" + run, MINE_VIEWER);

    assertThat(snapshot.path("testName").asText()).isEqualTo("Single read");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static List<UUID> sortedAscending(List<UUID> ids) {
    // PostgreSQL orders uuid by its bytes, which is the order of the canonical text form.
    return ids.stream().sorted(Comparator.comparing(UUID::toString)).toList();
  }

  private static List<UUID> sortedDescending(UUID left, UUID right) {
    return sortedAscending(List.of(left, right)).reversed();
  }

  private static List<UUID> ids(JsonNode page) {
    List<UUID> ids = new ArrayList<>();
    page.path("data").forEach(item -> ids.add(UUID.fromString(item.path("id").asText())));
    return ids;
  }

  private static List<UUID> executionIds(JsonNode page) {
    List<UUID> ids = new ArrayList<>();
    page.path("data").forEach(item -> ids.add(UUID.fromString(item.path("executionId").asText())));
    return ids;
  }

  private static JsonNode itemOf(JsonNode page, UUID executionId) {
    for (JsonNode item : page.path("data")) {
      if (executionId.toString().equals(item.path("executionId").asText())) {
        return item;
      }
    }
    throw new AssertionError("execution " + executionId + " is not on the page");
  }

  private JsonNode getOk(String path, String csiOwnership) throws Exception {
    ResponseEntity<String> response = get(path, csiOwnership);
    assertThat(response.getStatusCode().value()).as(response.getBody()).isEqualTo(200);
    return objectMapper.readTree(response.getBody());
  }

  private ResponseEntity<String> get(String path, String csiOwnership) {
    HttpHeaders headers = headers("viewer");
    headers.set("X-User-Csi-Ownership", csiOwnership);
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), String.class);
  }

  private JsonNode getAsAdmin(String path) throws Exception {
    ResponseEntity<String> response =
        restTemplate.exchange(
            path, HttpMethod.GET, new HttpEntity<>(headers("checks-admin")), String.class);
    assertThat(response.getStatusCode().value()).isEqualTo(200);
    return objectMapper.readTree(response.getBody());
  }

  private static HttpHeaders headers(String role) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    headers.set("X-User-Id", OWNER);
    headers.set("X-User-Email", OWNER);
    headers.set("X-User-Roles", role);
    return headers;
  }

  private void project(UUID testId, String status, Instant at) {
    jdbc.update(
        "UPDATE ui_tests SET last_run_status = ?, last_run_at = ? WHERE id = ?",
        status,
        Timestamp.from(at),
        testId);
  }

  private UUID seedExecution(
      UUID testId,
      String csiId,
      String status,
      String errorCode,
      Integer durationMs,
      Instant acceptedAt) {
    UUID executionId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_test_executions"
            + " (id, ui_test_id, status, error_code, duration_ms, started_at, csi_id)"
            + " VALUES (?, ?, ?, ?, ?, ?, ?)",
        executionId,
        testId,
        status,
        errorCode,
        durationMs,
        Timestamp.from(acceptedAt),
        csiId);
    jdbc.update(
        "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id,"
            + " csi_id, state) VALUES (?, ?, ?, ?, 'DONE')",
        executionId,
        Timestamp.from(acceptedAt),
        testId,
        csiId);
    return executionId;
  }

  private UUID seedTest(String csiId, String name, String description, String environment) {
    return seedTest(csiId, name, description, environment, Instant.now());
  }

  private UUID seedTest(
      String csiId, String name, String description, String environment, Instant updatedAt) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests (id, name, description, csi_id, environment, browser, steps,"
            + " variables, timeout_seconds, wait_strategy, created_by, created_at, updated_at)"
            + " VALUES (?, ?, ?, ?, ?, 'chromium', CAST('[\"Go to the home page\"]' AS jsonb),"
            + " CAST('[]' AS jsonb), 30, 'networkidle', ?, ?, ?)",
        id,
        name,
        description,
        csiId,
        environment,
        OWNER,
        Timestamp.from(updatedAt),
        Timestamp.from(updatedAt));
    return id;
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'List Query Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String csiId, String name) {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, ?, 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        csiId,
        name,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }
}

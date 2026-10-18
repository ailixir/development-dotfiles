package com.citi.put.checks.studio.guided.policy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-014 AC-1 (rulings AR-2 a, h; S-8): the governed observation policy against the V19
 * tables on the Flyway head, through the service. The approval records are synthetic; the external
 * Security approval is never marked obtained.
 *
 * <p>The four HTTP routes, the start-time freeze in a live session and the runner-side hash check
 * join this class in the S3 cutover unit (C2b), when their contract lands.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import(ObservedPublicationFixture.FreshAuthority.class)
class ObservationPolicyIT {

  private static final String APPROVERS = "studio-policy-approvers";

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    registry.add("studio.guided-authoring.policy.approver-groups", () -> APPROVERS);
    registry.add("studio.guided-authoring.translation.applications", () -> APP);
    registry.add("studio.guided-authoring.translation.environments", () -> "Development");
  }

  private static final String APP = ObservedPublicationFixture.APPLICATION;
  private static final String ENV = "Production";
  private static final String OWNER = "policy-owner@citi.com";
  private static final String APPROVER = "policy-approver@citi.com";

  @Autowired private ObservationPolicyService policies;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private com.citi.put.checks.studio.StudioService studio;

  @Autowired private com.citi.put.checks.studio.guided.session.GuidedSessionService sessions;

  // One embedded database serves every test in this class and the policy table is unique per
  // (csi, application, environment); a per-test random CSI collided (~6% of runs: attempt02
  // DuplicateKeyException on 61139). A per-JVM random base with a monotonic counter cannot.
  private static final java.util.concurrent.atomic.AtomicInteger NEXT_CSI =
      new java.util.concurrent.atomic.AtomicInteger(61000 + (int) (Math.random() * 800));

  private final GuidedContracts contracts = new GuidedContracts();
  private String csi;

  @BeforeEach
  void setUp() {
    csi = String.valueOf(NEXT_CSI.getAndIncrement());
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(csi, OWNER);
  }

  @Test
  void anUnapprovedPolicyIsNotInForceAndApprovalActivatesWithAnAuditChain() {
    ObjectNode created = policies.create(owner(), create(document("ALLOW", "app-v1")));
    UUID id = UUID.fromString(created.path("policyId").asText());
    assertThat(created.path("activeVersion").isNull()).isTrue();
    assertThatThrownBy(() -> policies.activeForStart(scope()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("POLICY_NOT_APPROVED");

    ObjectNode approved =
        policies.approve(approver(), id, 1, contracts.object().put("approvalRef", "SEC-1"));

    assertThat(approved.path("activeVersion").asInt()).isEqualTo(1);
    var active = policies.activeForStart(scope());
    assertThat(active.version()).isEqualTo(1);
    assertThat(active.observationPolicyHash())
        .isEqualTo(GuidedContracts.hash(active.document().path("applicationPolicy")));
    assertThat(approved.path("active").path("approval").path("approvedBy").asText())
        .isEqualTo(APPROVER);
    assertThat(audit(id))
        .containsExactly(
            "POLICY_CREATED:" + OWNER,
            "VERSION_CREATED:" + OWNER,
            "VERSION_APPROVED:" + APPROVER,
            "VERSION_ACTIVATED:" + APPROVER);
  }

  /**
   * c2b-spec startGuidedSession step 3: an edit awaiting approval blocks new learning even while an
   * older version is active ({@code GUIDED_POLICY_PENDING_VERSION}); approving it makes v2 the
   * policy in force with a different observation hash.
   */
  @Test
  void anEditAwaitingApprovalBlocksNewLearningAndApprovedV2ChangesTheHash() {
    UUID id = approvedV1();
    String v1Hash = policies.activeForStart(scope()).observationPolicyHash();

    policies.addVersion(
        owner(),
        id,
        contracts.object().put("expectedVersion", 1).set("document", document("ALLOW", "app-v2")));
    assertThatThrownBy(() -> policies.activeForStart(scope()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("POLICY_NOT_APPROVED")
        .extracting(e -> ((GuidedSessionException) e).messageCode())
        .isEqualTo("GUIDED_POLICY_PENDING_VERSION");

    policies.approve(approver(), id, 2, contracts.object().put("approvalRef", "SEC-2"));
    var v2 = policies.activeForStart(scope());
    assertThat(v2.version()).isEqualTo(2);
    assertThat(v2.observationPolicyHash()).isNotEqualTo(v1Hash);
  }

  @Test
  void absentAndUnapprovedPoliciesNameTheirReason() {
    assertThatThrownBy(() -> policies.activeForStart(scope()))
        .extracting(e -> ((GuidedSessionException) e).messageCode())
        .isEqualTo("GUIDED_POLICY_ABSENT");
    policies.create(owner(), create(document("ALLOW", "app-v1")));
    assertThatThrownBy(() -> policies.activeForStart(scope()))
        .extracting(e -> ((GuidedSessionException) e).messageCode())
        .isEqualTo("GUIDED_POLICY_UNAPPROVED");
    assertThatThrownBy(() -> policies.create(owner(), create(document("ALLOW", "again"))))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo("GUIDED_POLICY_EXISTS");
  }

  @Test
  void approvalIsFailClosedOutsideTheApproverGroupAndRefusedToTheAuthor() {
    UUID id =
        UUID.fromString(
            policies
                .create(owner(), create(document("ALLOW", "app-v1")))
                .path("policyId")
                .asText());
    ObjectNode ref = contracts.object().put("approvalRef", "SEC-1");

    assertThatThrownBy(() -> policies.approve(owner(), id, 1, ref))
        .as("the author holds no approver role")
        .isInstanceOf(StudioAccessDeniedException.class);
    Authentication authorWithRole = identity(OWNER, "owner", List.of(APPROVERS));
    assertThatThrownBy(() -> policies.approve(authorWithRole, id, 1, ref))
        .as("approver is never the author")
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_policy_approvals WHERE policy_id=?",
                Integer.class,
                id))
        .isZero();
  }

  @Test
  void staleVersionsAreRefusedAndOnlyTheLatestUnapprovedVersionCanBeApproved() {
    UUID id = approvedV1();
    assertThatThrownBy(
            () ->
                policies.addVersion(
                    owner(),
                    id,
                    contracts
                        .object()
                        .put("expectedVersion", 0)
                        .set("document", document("ALLOW", "x"))))
        .isInstanceOf(StudioConflictException.class)
        .extracting(e -> ((StudioConflictException) e).getCode())
        .isEqualTo("STALE_REVISION");
    assertThatThrownBy(
            () ->
                policies.approve(approver(), id, 1, contracts.object().put("approvalRef", "again")))
        .isInstanceOf(StudioConflictException.class);
  }

  @Test
  void originsOutsideTheTrustedPolicyAreInvalidAtWriteAndIncompatibleAtStart() {
    ObjectNode wider = document("ALLOW", "app-v1");
    wider.withArray("allowedOrigins").add("https://elsewhere.example.test");
    assertThatThrownBy(() -> policies.create(owner(), create(wider)))
        .isInstanceOf(StudioValidationException.class)
        .extracting(e -> ((StudioValidationException) e).getCode())
        .isEqualTo("INVALID_POLICY");

    // The trusted configuration can narrow after approval: simulate an approved version whose
    // origins the trusted policy no longer contains (written below the service, as data).
    UUID id = UUID.randomUUID();
    ObjectNode stored =
        ObservationPolicyDocuments.materialize(
            contracts, wider, ObservedPublicationFixture.DEFAULT_DESTRUCTIVE_VOCABULARY);
    var repository = new ObservationPolicyRepository(jdbc, contracts);
    repository.insertPolicy(id, csi, APP, ENV, OWNER);
    repository.insertVersion(
        id,
        1,
        stored,
        ObservationPolicyDocuments.documentHash(stored),
        ObservationPolicyDocuments.observationPolicyHash(stored),
        OWNER);
    repository.insertApproval(id, 1, APPROVER, "SEC-1");
    assertThatThrownBy(() -> policies.activeForStart(scope()))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("RUNTIME_INCOMPATIBLE");
  }

  @Test
  void anUnknownOrForbiddenPolicyIsTheSame403AndLookupIs404OnlyAfterAuthorization() {
    UUID id = approvedV1();
    Authentication stranger = identity("stranger@citi.com", null, List.of());
    assertThatThrownBy(() -> policies.read(stranger, id))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThatThrownBy(() -> policies.read(owner(), UUID.randomUUID()))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThat(policies.read(owner(), id).path("latestVersion").asInt()).isEqualTo(1);
    Authentication outsideApprover = identity("approver-only@citi.com", null, List.of(APPROVERS));
    assertThat(policies.read(outsideApprover, id).path("activeVersion").asInt()).isEqualTo(1);

    assertThatThrownBy(() -> policies.lookup(stranger, csi, APP, ENV))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThat(policies.lookup(owner(), csi, APP, ENV).path("policyId").asText())
        .isEqualTo(id.toString());
    assertThatThrownBy(() -> policies.lookup(owner(), csi, APP, "Staging"))
        .isInstanceOf(GuidedPolicyNotFoundException.class);
  }

  @Test
  void theFixtureSeedingHelperProducesAnActiveApprovedPolicyForEveryFixtureEnvironment() {
    ObservedPublicationFixture.seedApprovedPolicies(jdbc, csi);
    ObservedPublicationFixture.seedApprovedPolicies(jdbc, csi);

    for (String environment : ObservedPublicationFixture.ENVIRONMENTS) {
      var active =
          policies.activeForStart(
              contracts
                  .object()
                  .put("csiId", csi)
                  .put("applicationId", APP)
                  .put("environmentId", environment));
      assertThat(active.version()).isEqualTo(1);
      assertThat(active.document().path("sideEffectStance").asText()).isEqualTo("ALLOW");
    }
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_policies WHERE csi_id=?", Integer.class, csi))
        .as("idempotent")
        .isEqualTo(ObservedPublicationFixture.ENVIRONMENTS.size());
  }

  // ── S3: the start-time freeze (c2b-spec startGuidedSession steps 3-5, 8) ──

  @Test
  void aStartFreezesTheActiveVersionAndLearnsOnlyInsideTheGovernedOrigins() {
    String env = "Development";
    ObservedPublicationFixture.ensurePolicy(
        jdbc, csi, APP, env, List.of(ObservedPublicationFixture.ORIGIN), null, "ALLOW");
    UUID test = ObservedPublicationFixture.guidedDraft(jdbc, csi, env, OWNER);

    JsonNode started =
        sessions.start(
            owner(),
            UUID.randomUUID().toString(),
            ObservedPublicationFixture.guidedStart(test, env));
    String sessionId = started.path("sessionId").asText();

    var frozen = policies.frozen(sessionId).orElseThrow();
    var active =
        policies.activeForStart(
            contracts
                .object()
                .put("csiId", csi)
                .put("applicationId", APP)
                .put("environmentId", env));
    assertThat(frozen.version()).isEqualTo(active.version());
    assertThat(frozen.observationPolicyHash()).isEqualTo(active.observationPolicyHash());
    assertThat(
            jdbc.queryForObject(
                "SELECT document->'scope'->'approvedOrigins'::text FROM studio_guided_sessions"
                    + " WHERE session_id=?",
                String.class,
                sessionId))
        .isEqualTo("[\"" + ObservedPublicationFixture.ORIGIN + "\"]");
  }

  @Test
  void anEditAwaitingApprovalRefusesTheStartWithNothingWritten() {
    String env = "Development";
    ObservedPublicationFixture.ensurePolicy(
        jdbc, csi, APP, env, List.of(ObservedPublicationFixture.ORIGIN), null, "ALLOW");
    UUID id = UUID.fromString(policies.lookup(owner(), csi, APP, env).path("policyId").asText());
    ObjectNode edited = document("ALLOW", "app-v2");
    policies.addVersion(
        owner(),
        id,
        contracts
            .object()
            .put("expectedVersion", policies.read(owner(), id).path("latestVersion").asInt())
            .set("document", edited));
    UUID test = ObservedPublicationFixture.guidedDraft(jdbc, csi, env, OWNER);
    int before = jdbc.queryForObject("SELECT count(*) FROM studio_guided_sessions", Integer.class);

    assertThatThrownBy(
            () ->
                sessions.start(
                    owner(),
                    UUID.randomUUID().toString(),
                    ObservedPublicationFixture.guidedStart(test, env)))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("POLICY_NOT_APPROVED")
        .extracting(e -> ((GuidedSessionException) e).messageCode())
        .isEqualTo("GUIDED_POLICY_PENDING_VERSION");
    assertThat(jdbc.queryForObject("SELECT count(*) FROM studio_guided_sessions", Integer.class))
        .isEqualTo(before);
  }

  /**
   * AR-2 g: replay keeps its published snapshot. Approving a governed v2 changes no replay binding
   * or verdict for an existing revision (replay binds the configured TrustedPolicy), while a
   * learning session started after the approval freezes v2's observation hash, the hash the runner
   * receives in its context and must reproduce (the runner side is R14's policyHash tests).
   */
  @Test
  void approvingAV2ChangesNoReplayBindingButTheNextLearningSessionFreezesV2() {
    var owner = owner();
    UUID test =
        new StudioExecutionFixtures(jdbc)
            .seedRunnableTest("Replay under v1", csi, OWNER, List.of("Go to the home page"))
            .testId();
    ObservedPublicationFixture.ensurePolicy(
        jdbc, csi, APP, ENV, List.of(ObservedPublicationFixture.ORIGIN), null, "ALLOW");
    String beforeHash = replayPolicyHash(test, owner);
    String v1Hash = policies.activeForStart(scope()).observationPolicyHash();

    ObjectNode v2 = contracts.object();
    v2.put("policyRuleId", "governed-v2")
        .put("allowStructuralDiscovery", true)
        .putArray("readGrants");
    ObservedPublicationFixture.ensurePolicy(
        jdbc, csi, APP, ENV, List.of(ObservedPublicationFixture.ORIGIN), v2, "ALLOW");
    String v2Hash = policies.activeForStart(scope()).observationPolicyHash();
    assertThat(v2Hash).isNotEqualTo(v1Hash);

    assertThat(replayPolicyHash(test, owner))
        .as("replay binds the same currentPolicyHash after v2 is approved")
        .isEqualTo(beforeHash);

    String env = "Development";
    ObservedPublicationFixture.ensurePolicy(
        jdbc, csi, APP, env, List.of(ObservedPublicationFixture.ORIGIN), v2, "ALLOW");
    UUID draft = ObservedPublicationFixture.guidedDraft(jdbc, csi, env, OWNER);
    String sessionId =
        sessions
            .start(
                owner,
                UUID.randomUUID().toString(),
                ObservedPublicationFixture.guidedStart(draft, env))
            .path("sessionId")
            .asText();
    assertThat(policies.frozen(sessionId).orElseThrow().observationPolicyHash())
        .isEqualTo(GuidedContracts.hash(v2));
  }

  /** Accepts one replay of the draft's confirmed revision and returns its bound policy hash. */
  private String replayPolicyHash(UUID test, Authentication caller) {
    UUID execution =
        studio
            .executeTest(
                test,
                caller,
                UUID.randomUUID().toString(),
                ObservedPublicationFixture.request(caller))
            .executionId();
    return jdbc.queryForObject(
        "SELECT observed_revision_binding->>'currentPolicyHash' FROM ui_test_executions WHERE id=?",
        String.class,
        execution);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private UUID approvedV1() {
    UUID id =
        UUID.fromString(
            policies
                .create(owner(), create(document("ALLOW", "app-v1")))
                .path("policyId")
                .asText());
    policies.approve(approver(), id, 1, contracts.object().put("approvalRef", "SEC-1"));
    return id;
  }

  private ObjectNode create(ObjectNode document) {
    ObjectNode request =
        contracts.object().put("csiId", csi).put("applicationId", APP).put("environmentId", ENV);
    request.set("document", document);
    return request;
  }

  private ObjectNode document(String stance, String ruleId) {
    ObjectNode document =
        contracts.object().put("schemaVersion", 3).put("sideEffectStance", stance);
    document.putArray("allowedOrigins").add(ObservedPublicationFixture.ORIGIN);
    document
        .putObject("applicationPolicy")
        .put("policyRuleId", ruleId)
        .put("allowStructuralDiscovery", true)
        .putArray("readGrants");
    return document;
  }

  private ObjectNode scope() {
    return contracts.object().put("csiId", csi).put("applicationId", APP).put("environmentId", ENV);
  }

  /** The trigger-written change chain, oldest first, as "EVENT:principal". */
  private List<String> audit(UUID id) {
    return new ArrayList<>(
        jdbc.queryForList(
            "SELECT event || ':' || principal_id FROM studio_guided_policy_audit WHERE policy_id=?"
                + " ORDER BY audit_id",
            String.class,
            id));
  }

  private Authentication owner() {
    return identity(OWNER, "owner", List.of());
  }

  private Authentication approver() {
    return identity(APPROVER, "viewer", List.of(APPROVERS));
  }

  private Authentication identity(String email, String role, List<String> roles) {
    return new BffAuthenticationToken(
        new UserIdentity(
            email,
            email,
            email,
            "Ops",
            roles,
            role == null ? List.of() : List.of(new CsiOwnershipEntry(csi, role))));
  }
}

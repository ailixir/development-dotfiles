package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.SecondApplicationContext;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.AuthoringV2Response;
import com.citi.put.checks.studio.dto.ContextText;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.LegacyAuthoringRequest;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.StudioAuthoring;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;

/** Persistence, stable identity, exact literal and CSI regressions for Story 10.37. */
@SpringBootTest
@ActiveProfiles("test")
class StudioAuthoringPersistenceIT {

  private static final String OWNER = "authoring-owner@citi.com";
  private static final String CSI = "61835";
  private static final String OTHER_CSI = "61836";

  @Autowired StudioService studioService;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource dataSource;

  private UUID testId;
  private Authentication owner;

  @BeforeEach
  void setUp() {
    seedUser();
    seedCsi(CSI);
    seedCsi(OTHER_CSI);
    testId = seedLegacy(List.of("  open \\\"雪\\\"\nnext  ", ""));
    owner = identity(CSI);
  }

  @Test
  void readsRemainLegacyUntilTheFirstDurableV2Write() {
    StudioAuthoring before = studioService.findAuthoringById(testId, owner);
    assertThat(before).isInstanceOf(LegacyAuthoringRequest.class);
    assertThat(((LegacyAuthoringRequest) before).steps())
        .containsExactly("  open \\\"雪\\\"\nnext  ", "");
    assertThat(
            jdbc.queryForObject(
                "SELECT authoring IS NULL FROM ui_tests WHERE id=?", Boolean.class, testId))
        .isTrue();

    AuthoringV2Response promoted = studioService.adaptLegacyAuthoring(testId, 1, 1, owner);
    List<UUID> firstIds = promoted.steps().stream().map(AuthoringStep::id).toList();

    AuthoringV2Request firstRead =
        (AuthoringV2Request) studioService.findAuthoringById(testId, owner);
    AuthoringV2Request secondRead =
        (AuthoringV2Request) studioService.findAuthoringById(testId, owner);
    assertThat(firstRead.steps().stream().map(AuthoringStep::id))
        .containsExactlyElementsOf(firstIds);
    assertThat(secondRead.steps().stream().map(AuthoringStep::id))
        .containsExactlyElementsOf(firstIds);
    assertThat(firstRead.steps().stream().map(AuthoringStep::text))
        .containsExactly("  open \\\"雪\\\"\nnext  ", "");
  }

  @Test
  void addEditReorderCopyAndDeleteKeepIdentityAttachedToContext() {
    AuthoringV2Response promoted = studioService.adaptLegacyAuthoring(testId, 1, 1, owner);
    AuthoringStep first = promoted.steps().get(0);
    AuthoringStep second = promoted.steps().get(1);
    AuthoringStep edited =
        new AuthoringStep(
            first.id(),
            "edited",
            new StepAuthoringContext(List.of(new ContextText("  exact\n雪  ")), List.of()));
    AuthoringStep inserted =
        new AuthoringStep(UUID.randomUUID(), "inserted", StepAuthoringContext.empty());
    AuthoringStep copied = new AuthoringStep(UUID.randomUUID(), edited.text(), edited.context());
    AuthoringV2Request changed =
        new AuthoringV2Request(
            2,
            new GlobalAuthoringContext(List.of(new ContextText("global \\\"q\\\"\n")), List.of()),
            List.of(second, inserted, copied, edited));

    AuthoringV2Response saved = studioService.saveAuthoring(testId, changed, 1, 2, owner);
    assertThat(saved.steps().stream().map(AuthoringStep::id))
        .containsExactly(second.id(), inserted.id(), copied.id(), edited.id());
    assertThat(saved.steps().get(2).context()).isEqualTo(edited.context());
    assertThat(saved.globalContext()).isEqualTo(changed.globalContext());

    AuthoringV2Request deleted =
        new AuthoringV2Request(2, changed.globalContext(), List.of(second, inserted, edited));
    AuthoringV2Response afterDelete = studioService.saveAuthoring(testId, deleted, 2, 3, owner);
    assertThat(afterDelete.steps().stream().map(AuthoringStep::id))
        .containsExactly(second.id(), inserted.id(), edited.id());
  }

  @Test
  void anotherCsiCannotReadOrWriteTheAuthoringDocument() {
    Authentication outsider = identity(OTHER_CSI);
    assertThatThrownBy(() -> studioService.findAuthoringById(testId, outsider))
        .isInstanceOf(StudioAccessDeniedException.class);
    AuthoringV2Request adapted = LegacyAuthoringPersistenceAdapter.adapt(testId, storedSteps());
    assertThatThrownBy(() -> studioService.saveAuthoring(testId, adapted, 1, 1, outsider))
        .isInstanceOf(StudioAccessDeniedException.class);
    assertThat(
            jdbc.queryForObject(
                "SELECT authoring IS NULL FROM ui_tests WHERE id=?", Boolean.class, testId))
        .isTrue();
  }

  @Test
  void stableIdsTextAndContextSurviveAnIndependentApplicationContextRestart() {
    AuthoringV2Response promoted = studioService.adaptLegacyAuthoring(testId, 1, 1, owner);
    AuthoringStep contextual =
        new AuthoringStep(
            promoted.steps().get(0).id(),
            promoted.steps().get(0).text(),
            new StepAuthoringContext(List.of(new ContextText("restart 雪\n  exact  ")), List.of()));
    AuthoringV2Response saved =
        studioService.saveAuthoring(
            testId,
            new AuthoringV2Request(
                2, promoted.globalContext(), List.of(contextual, promoted.steps().get(1))),
            1,
            2,
            owner);

    try (SecondApplicationContext restarted = new SecondApplicationContext(dataSource)) {
      AuthoringV2Response reloaded =
          restarted.bean(StudioService.class).findAuthoringV2ById(testId, owner);
      assertThat(reloaded.steps()).isEqualTo(saved.steps());
      assertThat(reloaded.globalContext()).isEqualTo(saved.globalContext());
      assertThat(reloaded.revisionInputs()).isEqualTo(saved.revisionInputs());
    }
  }

  private UUID seedLegacy(List<String> steps) {
    UUID id = UUID.randomUUID();
    String json =
        "[\""
            + steps.get(0).replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n")
            + "\",\"\"]";
    jdbc.update(
        "INSERT INTO ui_tests (id,name,csi_id,environment,browser,steps,variables,created_by,"
            + "created_at,updated_at) VALUES (?, 'Authoring', ?, 'Production', 'chromium',"
            + "CAST(? AS jsonb), '[]'::jsonb, ?, ?, ?)",
        id,
        CSI,
        json,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
    return id;
  }

  private String storedSteps() {
    return jdbc.queryForObject("SELECT steps::text FROM ui_tests WHERE id=?", String.class, testId);
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id,sso_id,name,email,created_at,is_active) VALUES"
            + " (?,?,'Owner',?,?,true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi(String id) {
    jdbc.update(
        "INSERT INTO csi_systems (id,name,business_unit,criticality,owner_email,environment,"
            + "status,created_at,updated_at) VALUES (?,?,'Ops','HIGH',?,'Production',"
            + "'OPERATIONAL',?,?) ON CONFLICT (id) DO NOTHING",
        id,
        "CSI " + id,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private static Authentication identity(String csi) {
    return new BffAuthenticationToken(
        new UserIdentity(
            "uid-owner",
            OWNER,
            "Owner",
            "Ops",
            List.of(),
            List.of(new CsiOwnershipEntry(csi, "owner"))));
  }
}

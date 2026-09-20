package com.citi.put.checks.studio.authoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.CompilePipeline;
import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

class StudioAuthoringServiceTest {
  private final StudioService studio = mock(StudioService.class);
  private final StudioRepository repository = mock(StudioRepository.class);
  private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
  private final CsiOwnershipEvaluator access = mock(CsiOwnershipEvaluator.class);
  private final CompilePipeline pipeline = mock(CompilePipeline.class);
  private final CompileStateService state = mock(CompileStateService.class);
  private final ObjectMapper mapper = new ObjectMapper();
  private final StudioAuthoringService service =
      new StudioAuthoringService(
          studio,
          repository,
          jdbc,
          mapper,
          access,
          pipeline,
          state,
          mock(com.citi.put.checks.studio.compile.AuthoringLimits.class),
          new com.citi.put.checks.studio.compile.CredentialPatternScreen());
  private final UUID id = UUID.randomUUID();
  private final UUID stepId = UUID.randomUUID();
  private final BffAuthenticationToken auth =
      new BffAuthenticationToken(
          new UserIdentity("author", "author@citi.com", "Author", "Ops", List.of(), List.of()));
  private UITest draft;

  @BeforeEach
  void setup() {
    draft =
        new UITest(
            "Draft",
            null,
            "123",
            "[\"Open home\"]",
            "[]",
            "chromium",
            1920,
            1080,
            "Test",
            "author@citi.com");
    ReflectionTestUtils.setField(draft, "id", id);
    when(repository.findCsiIdIncludingWithheld(id)).thenReturn(Optional.of("123"));
    when(repository.findByIdForUpdate(id)).thenReturn(Optional.of(draft));
    when(repository.findLifecycleState(id)).thenReturn(Optional.of("ACTIVE"));
    when(access.canWrite(auth, "123")).thenReturn(true);
    when(access.canRead(auth, "123")).thenReturn(true);
    when(jdbc.queryForObject(anyString(), eq(Boolean.class))).thenReturn(true);
    when(jdbc.queryForObject(anyString(), eq(Integer.class), eq(stepId), eq(id))).thenReturn(1);
  }

  @Test
  void scopeOnlyEditMovesSourceAndInvalidatesCandidateWithoutCallingModel() {
    draft.setCompileStatus(CompileState.READY);
    draft.setCurrentCandidateRevisionId(UUID.randomUUID());
    service.update(id, write("STEP_SCOPED", stepId), auth);
    assertThat(draft.getSourceRevision()).isEqualTo(2);
    assertThat(draft.getCompileStatus()).isEqualTo(CompileState.STALE);
    assertThat(draft.getCurrentCandidateRevisionId()).isNull();
    assertThat(draft.getScopeReviewedBy()).isEqualTo("author@citi.com");
    assertThat(draft.getScopeReviewedAt()).isNotNull();
    verifyNoInteractions(pipeline);
    verify(studio).updateTest(eq(id), any(), eq(auth), eq(false), eq(true));
  }

  @Test
  void exactSnapshotNoopPreservesConfirmationAndReviewTimestamp() {
    AuthoringDtos.Write body = write("STEP_SCOPED", stepId);
    service.update(id, body, auth);
    long revision = draft.getSourceRevision();
    Instant reviewed = draft.getScopeReviewedAt();
    UUID candidate = UUID.randomUUID();
    draft.setCurrentCandidateRevisionId(candidate);
    draft.setCompileStatus(CompileState.READY);
    service.update(id, body, auth);
    assertThat(draft.getSourceRevision()).isEqualTo(revision);
    assertThat(draft.getScopeReviewedAt()).isEqualTo(reviewed);
    assertThat(draft.getCurrentCandidateRevisionId()).isEqualTo(candidate);
    assertThat(draft.getCompileStatus()).isEqualTo(CompileState.READY);
  }

  @Test
  void foreignAndDuplicateIdsAreRefused() {
    assertThatThrownBy(() -> service.update(id, write("UNKNOWN", UUID.randomUUID()), auth))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("not owned");
    AuthoringDtos.Write body = write("UNKNOWN", stepId);
    AuthoringDtos.Write duplicate =
        new AuthoringDtos.Write(
            body.name(),
            null,
            body.csiId(),
            body.environment(),
            List.of(body.steps().getFirst(), body.steps().getFirst()),
            body.scope(),
            body.variables(),
            body.configuration(),
            1L,
            1L);
    assertThatThrownBy(() -> service.update(id, duplicate, auth))
        .isInstanceOf(StudioValidationException.class)
        .hasMessageContaining("Duplicate");
  }

  @Test
  void deniedAccessNeverReadsAuthoringOrStartsInference() {
    when(access.canWrite(auth, "123")).thenReturn(false);
    assertThatThrownBy(() -> service.update(id, write("UNKNOWN", stepId), auth))
        .isInstanceOf(StudioAccessDeniedException.class);
    verify(repository, never()).findByIdForUpdate(any());
    verifyNoInteractions(studio, pipeline, jdbc);
  }

  @Test
  void confirmationForwardsEveryIdentityFieldToAtomicStateGuard() {
    UUID request = UUID.randomUUID();
    UUID revision = UUID.randomUUID();
    String hash = "a".repeat(64);
    String authoringHash = "b".repeat(64);
    service.confirm(
        id, new AuthoringDtos.Confirm(request, revision, hash, 4L, 7L, authoringHash), auth);
    verify(state)
        .confirmVersioned(id, request, revision, hash, 4L, 7L, authoringHash, "author@citi.com");
    verifyNoInteractions(pipeline);
  }

  @Test
  void cutoverMissingRefusesWriteBeforePersistence() {
    when(jdbc.queryForObject(anyString(), eq(Boolean.class))).thenReturn(false);
    assertThatThrownBy(() -> service.update(id, write("UNKNOWN", stepId), auth))
        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    verifyNoInteractions(studio, pipeline);
  }

  @Test
  void closedRequestRefusesCodeAndUnknownScopeFieldsEvenWithLenientMapper() {
    mapper.disable(
        com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    assertThatThrownBy(
            () ->
                mapper.readValue(
                    "{\"id\":null,\"text\":\"Open\",\"code\":\"evil\"}", AuthoringDtos.Step.class))
        .isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
    assertThatThrownBy(
            () ->
                mapper.readValue(
                    "{\"policyVersion\":\"1.0.0\",\"declaration\":\"UNKNOWN\",\"reviewedBy\":\"fake\"}",
                    AuthoringDtos.Scope.class))
        .isInstanceOf(com.fasterxml.jackson.core.JsonProcessingException.class);
  }

  @Test
  void malformedConfigurationIsRejectedBeforeSave() {
    AuthoringDtos.Write normal = write("UNKNOWN", stepId);
    AuthoringDtos.Write invalid =
        new AuthoringDtos.Write(
            normal.name(),
            null,
            normal.csiId(),
            normal.environment(),
            normal.steps(),
            normal.scope(),
            normal.variables(),
            new TestConfiguration("chromium", null, 30, "load"),
            1L,
            1L);
    assertThatThrownBy(() -> service.update(id, invalid, auth))
        .isInstanceOf(StudioValidationException.class);
    verifyNoInteractions(studio, pipeline);
  }

  private AuthoringDtos.Write write(String scope, UUID step) {
    return new AuthoringDtos.Write(
        "Draft",
        null,
        "123",
        "Test",
        List.of(new AuthoringDtos.Step(step, "Open home")),
        new AuthoringDtos.Scope("1.0.0", scope),
        List.of(),
        TestConfiguration.defaults(),
        draft.getSourceRevision(),
        draft.getConfigurationRevision());
  }
}

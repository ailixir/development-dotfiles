package com.citi.put.checks.studio.support;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.CanonicalStudioCodec;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;

/** Test-only v2 seeds: production has no implicit identity creation or promotion path. */
public final class CanonicalAuthoringFixture {
  private static final ObjectMapper MAPPER =
      new ObjectMapper()
          .findAndRegisterModules()
          .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
          .disable(
              com.fasterxml.jackson.databind.DeserializationFeature
                  .ADJUST_DATES_TO_CONTEXT_TIME_ZONE);

  private CanonicalAuthoringFixture() {}

  public static AuthoringV2Request authoring(UUID testId, List<String> lines) {
    var steps = new ArrayList<AuthoringStep>();
    for (int index = 0; index < lines.size(); index++) {
      UUID id = UUID.nameUUIDFromBytes((testId + ":" + index).getBytes(StandardCharsets.UTF_8));
      steps.add(new AuthoringStep(id, lines.get(index), StepAuthoringContext.empty()));
    }
    return new AuthoringV2Request(2, GlobalAuthoringContext.empty(), steps);
  }

  public static UITestDto create(
      StudioService service, UITestRequest metadata, Authentication auth) {
    return service
        .createAuthoringDraft(metadata, authoring(UUID.randomUUID(), metadata.steps()), auth)
        .test();
  }

  public static UITestDto update(
      StudioService service, UUID id, UITestRequest metadata, Authentication auth) {
    return service.updateAuthoringDraft(id, metadata, authoring(id, metadata.steps()), auth).test();
  }

  public static UITestDto update(
      StudioService service,
      JdbcTemplate jdbc,
      UUID id,
      UITestRequest metadata,
      Authentication auth) {
    try {
      String stored =
          jdbc.queryForObject("SELECT authoring::text FROM ui_tests WHERE id=?", String.class, id);
      if (stored == null) {
        throw new IllegalStateException("Test fixture must seed canonical authoring before save");
      }
      AuthoringV2Request previous = MAPPER.readValue(stored, AuthoringV2Request.class);
      var steps = new ArrayList<AuthoringStep>();
      for (int at = 0; at < metadata.steps().size(); at++) {
        AuthoringStep old = at < previous.steps().size() ? previous.steps().get(at) : null;
        steps.add(
            new AuthoringStep(
                old == null ? UUID.randomUUID() : old.id(),
                metadata.steps().get(at),
                old == null ? StepAuthoringContext.empty() : old.context()));
      }
      return service
          .updateAuthoringDraft(
              id, metadata, new AuthoringV2Request(2, previous.globalContext(), steps), auth)
          .test();
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalStateException(failure);
    }
  }

  public static UITestDto update(
      StudioService service, JdbcTemplate jdbc, UUID id, UITestRequest metadata) {
    return update(
        service, jdbc, id, metadata, StudioExecutionFixtures.admin("canonical-fixture@citi.com"));
  }

  public static UITestDto update(StudioService service, UUID id, UITestRequest metadata) {
    return update(
        service, id, metadata, StudioExecutionFixtures.admin("canonical-fixture@citi.com"));
  }

  public static void seed(JdbcTemplate jdbc, UUID id) {
    String source =
        jdbc.queryForObject("SELECT steps::text FROM ui_tests WHERE id=?", String.class, id);
    var authoring = authoring(id, CanonicalStudioCodec.parseSteps(source));
    String variables =
        jdbc.queryForObject("SELECT variables::text FROM ui_tests WHERE id=?", String.class, id);
    Map<String, String> values = new java.util.HashMap<>();
    CanonicalStudioCodec.parseVariables(variables)
        .forEach(
            variable -> {
              if (variable.kind().equals("plain") && variable.value() != null) {
                values.put(variable.name(), variable.value());
              }
            });
    jdbc.update(
        "UPDATE ui_tests SET authoring=?::jsonb,authoring_revision_inputs=?::jsonb WHERE id=?",
        MAPPER.valueToTree(authoring).toString(),
        MAPPER.valueToTree(AuthoringRevisionIdentity.create(authoring, values)).toString(),
        id);
  }
}

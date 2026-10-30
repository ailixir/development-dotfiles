package com.citi.put.checks.studio.secrets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.guided.publication.ObservedReplayProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionProperties;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Guided start depends on three things only (STUDIO-GOV-001.4): the caller may execute in the
 * test's CSI, the test has a step, and the deployment has a usable runtime catalog. No application,
 * policy or origin is named: which origins a test may open is decided from the test itself when
 * learning starts.
 */
class StudioCapabilitiesServiceTest {

  private static final GuidedContracts C = new GuidedContracts();
  private static final String CSI = "60491";
  private static final String ENVIRONMENT = "Production";
  private static final String ONE_STEP =
      "{\"authoringSchemaVersion\":2,\"steps\":[{\"id\":\"00000000-0000-4000-8000-000000000001\","
          + "\"text\":\"Go to https://app.example.test/\"}]}";

  private record Setup(boolean canExecute, String authoring, ObservedReplayProperties catalog) {
    Setup() {
      this(true, ONE_STEP, ObservedPublicationFixture.properties());
    }

    Setup withAuthoring(String value) {
      return new Setup(canExecute, value, catalog);
    }

    Setup withoutExecuteRight() {
      return new Setup(false, authoring, catalog);
    }

    Setup withEmptyCatalog() {
      return new Setup(
          canExecute,
          authoring,
          new ObservedReplayProperties(true, 30000, 1048576, 4194304, 2097152, "[]", 1280, 720));
    }
  }

  @Test
  void aTestWithAStepOnADeploymentWithACatalogMayStartAndNamesNoApplication() {
    JsonNode start = guidedStart(new Setup(), true);

    assertThat(start.path("available").asBoolean()).isTrue();
    JsonNode context = start.path("context");
    assertThat(context.path("environmentId").asText()).isEqualTo(ENVIRONMENT);
    assertThat(context.has("applicationId")).isFalse();
    assertThat(context.fieldNames())
        .toIterable()
        .containsExactlyInAnyOrder(
            "schemaVersion",
            "testId",
            "sourceRevision",
            "configurationRevision",
            "environmentId",
            "versions");
  }

  @Test
  void aCallerWhoMayNotExecuteInTheCsiIsRefusedAsForbiddenScope() {
    assertThat(guidedStart(new Setup().withoutExecuteRight(), true).toString())
        .isEqualTo("{\"available\":false,\"code\":\"FORBIDDEN_SCOPE\"}");
  }

  @Test
  void aTestWithoutAStepCannotStart() {
    for (String authoring :
        new String[] {
          null, "{\"authoringSchemaVersion\":2,\"steps\":[]}", "{\"steps\":\"none\"}"
        }) {
      assertThat(guidedStart(new Setup().withAuthoring(authoring), true).toString())
          .as(String.valueOf(authoring))
          .isEqualTo("{\"available\":false,\"code\":\"RUNTIME_INCOMPATIBLE\"}");
    }
  }

  @Test
  void aDeploymentWithoutAUsableRuntimeCatalogCannotStart() {
    assertThat(guidedStart(new Setup().withEmptyCatalog(), true).toString())
        .isEqualTo("{\"available\":false,\"code\":\"RUNTIME_INCOMPATIBLE\"}");
  }

  @Test
  void guidedAuthoringSwitchedOffCannotStart() {
    assertThat(guidedStart(new Setup(), false).toString())
        .isEqualTo("{\"available\":false,\"code\":\"RUNTIME_INCOMPATIBLE\"}");
  }

  private static JsonNode guidedStart(Setup setup, boolean guidedEnabled) {
    UITest test =
        new UITest("Draft", null, CSI, "[]", "[]", "chromium", 1280, 720, ENVIRONMENT, "o");
    ReflectionTestUtils.setField(test, "id", UUID.randomUUID());
    test.setAuthoring(setup.authoring());
    StudioRepository repository = mock(StudioRepository.class);
    when(repository.findById(any())).thenReturn(Optional.of(test));
    CsiOwnershipEvaluator ownership = mock(CsiOwnershipEvaluator.class);
    when(ownership.canRead(any(), anyString())).thenReturn(true);
    when(ownership.canExecute(any(), anyString())).thenReturn(setup.canExecute());
    var service =
        new StudioCapabilitiesService(
            repository,
            ownership,
            new FakeStudioVaultProvider(Map.of()),
            new ObservedReplayPins(C, setup.catalog()),
            new GuidedSessionProperties(guidedEnabled, Map.of()),
            C);
    return service.capabilities(UUID.randomUUID(), mock(Authentication.class)).path("guidedStart");
  }
}

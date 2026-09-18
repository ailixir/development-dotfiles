package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.compile.gateway.CompileRequest;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.dto.UITestDto;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class StudioGeminiServiceTest {

  @Test
  void sendsStoredStepsAndAuthenticatedPrincipalToGemini() {
    UUID testId = UUID.randomUUID();
    StudioService studio = mock(StudioService.class);
    LlmGatewayClient gateway = mock(LlmGatewayClient.class);
    when(studio.findTestById(testId)).thenReturn(test(testId));
    when(gateway.propose(any()))
        .thenReturn(
            CompileResponse.failure(GatewayOutcome.DISABLED, null, "disabled", null, 0, 0, 0, 0));
    StudioGeminiService service = new StudioGeminiService(studio, gateway, new ObjectMapper());
    BffAuthenticationToken authentication =
        new BffAuthenticationToken(
            new UserIdentity("user", "author@example.com", "Author", null, List.of(), List.of()));

    service.compile(testId, authentication);

    ArgumentCaptor<CompileRequest> request = ArgumentCaptor.forClass(CompileRequest.class);
    verify(gateway).propose(request.capture());
    assertThat(request.getValue().principal()).isEqualTo("author@example.com");
    assertThat(request.getValue().fencedSourceLines())
        .containsExactly("Go to https://example.com", "Check that \"Example\" is visible");
    assertThat(request.getValue().promptVersion()).isEqualTo("studio-gemini-flash-v1");
  }

  @Test
  void repairsAOneBasedArtifactBeforeReturningIt() {
    UUID testId = UUID.randomUUID();
    StudioService studio = mock(StudioService.class);
    LlmGatewayClient gateway = mock(LlmGatewayClient.class);
    when(studio.findTestById(testId)).thenReturn(test(testId));
    when(gateway.propose(any())).thenReturn(okArtifact(1, 2)).thenReturn(okArtifact(0, 1));
    StudioGeminiService service = new StudioGeminiService(studio, gateway, new ObjectMapper());
    BffAuthenticationToken authentication =
        new BffAuthenticationToken(
            new UserIdentity("user", "author@example.com", "Author", null, List.of(), List.of()));

    CompileResponse result = service.compile(testId, authentication);

    assertThat(result.isOk()).isTrue();
    ArgumentCaptor<CompileRequest> requests = ArgumentCaptor.forClass(CompileRequest.class);
    verify(gateway, times(2)).propose(requests.capture());
    assertThat(requests.getAllValues().get(1).attempt()).isEqualTo(2);
    assertThat(requests.getAllValues().get(1).repairDiagnostics()).contains("zero-based");
  }

  private static CompileResponse okArtifact(int firstIndex, int secondIndex) {
    String artifact =
        "{\"version\":1,\"steps\":["
            + "{\"stepIndex\":"
            + firstIndex
            + ",\"originalText\":\"Go to https://example.com\",\"code\":\"await"
            + " page.goto('https://example.com');\"},{\"stepIndex\":"
            + secondIndex
            + ",\"originalText\":\"Check that \\\"Example\\\" is visible\",\"code\":\"await"
            + " expect(page.getByText('Example')).toBeVisible();\"}]}";
    return CompileResponse.ok(
        artifact,
        new GatewayProvenance("gemini-3.8-flash", null, "prompt", "1.72.0", true, 0),
        0,
        1,
        100,
        artifact.length());
  }

  private static UITestDto test(UUID id) {
    return new UITestDto(
        id,
        "Example",
        "",
        "178672",
        "[\"Go to https://example.com\",\"Check that \\\"Example\\\" is visible\"]",
        "[]",
        "chrome",
        1440,
        900,
        30,
        "domcontentloaded",
        "Development",
        "PAUSED",
        null,
        "author@example.com",
        Instant.now(),
        Instant.now(),
        null,
        null);
  }
}

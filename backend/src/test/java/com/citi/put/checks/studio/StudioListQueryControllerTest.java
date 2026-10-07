package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.citi.put.checks.config.ChecksExceptionHandler;
import com.citi.put.checks.studio.dto.StudioAuthoringMapper;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Story 10.46 — the list routes' search, filter and sort parameters at the controller boundary.
 *
 * <p>The controller and the real {@link ChecksExceptionHandler} run in a standalone MockMvc, with a
 * mock service. Valid parameters must arrive at the service normalized; invalid ones must be a
 * {@code 400 INVALID_QUERY} that never reaches it.
 */
class StudioListQueryControllerTest {

  private static final String TESTS = "/api/v1/studio/tests";
  private static final String EXECUTIONS = "/api/v1/studio/executions";

  private StudioService service;
  private MockMvc mvc;

  @BeforeEach
  void setUp() {
    service = mock(StudioService.class);
    when(service.listTests(any(), anyInt(), anyInt(), any()))
        .thenReturn(Page.empty(PageRequest.of(0, 20)));
    when(service.listExecutions(any(), anyInt(), anyInt(), any()))
        .thenReturn(Page.empty(PageRequest.of(0, 20)));
    mvc =
        MockMvcBuilders.standaloneSetup(
                new StudioController(service, mock(StudioAuthoringMapper.class)))
            .setControllerAdvice(new ChecksExceptionHandler())
            .build();
  }

  // ── GET /tests ───────────────────────────────────────────────────────────

  @Test
  void testListWithoutParametersDefaultsToUpdatedAtDescending() throws Exception {
    mvc.perform(get(TESTS)).andExpect(status().isOk());

    StudioListQuery.Tests query = capturedTests();
    assertThat(query.sort()).isEqualTo(StudioListQuery.TestSort.UPDATED_AT);
    assertThat(query.ascending()).isFalse();
    assertThat(query.csiId()).isNull();
    assertThat(query.environment()).isNull();
    assertThat(query.search()).isNull();
    assertThat(query.lastRun()).isNull();
  }

  @Test
  void testListForwardsEveryNewParameterNormalized() throws Exception {
    mvc.perform(
            get(TESTS)
                .param("csiId", "60431")
                .param("environment", "UAT")
                .param("q", "  Login  ")
                .param("lastRun", "never")
                .param("sort", "lastRunAt,ASC")
                .param("page", "2")
                .param("size", "50"))
        .andExpect(status().isOk());

    ArgumentCaptor<StudioListQuery.Tests> captor =
        ArgumentCaptor.forClass(StudioListQuery.Tests.class);
    verify(service).listTests(captor.capture(), eq(2), eq(50), any());
    StudioListQuery.Tests query = captor.getValue();
    assertThat(query.csiId()).isEqualTo("60431");
    assertThat(query.environment()).isEqualTo("UAT");
    assertThat(query.search()).isEqualTo("Login");
    assertThat(query.lastRun()).isEqualTo(StudioListQuery.NEVER);
    assertThat(query.sort()).isEqualTo(StudioListQuery.TestSort.LAST_RUN_AT);
    assertThat(query.ascending()).isTrue();
  }

  @Test
  void blankTestListParametersMeanNotSupplied() throws Exception {
    mvc.perform(
            get(TESTS)
                .param("csiId", "")
                .param("environment", " ")
                .param("q", "")
                .param("lastRun", "")
                .param("sort", ""))
        .andExpect(status().isOk());

    StudioListQuery.Tests query = capturedTests();
    assertThat(query.csiId()).isNull();
    assertThat(query.environment()).isNull();
    assertThat(query.search()).isNull();
    assertThat(query.lastRun()).isNull();
    assertThat(query.sort()).isEqualTo(StudioListQuery.TestSort.UPDATED_AT);
  }

  @Test
  void aSortWithoutDirectionIsAscending() throws Exception {
    mvc.perform(get(TESTS).param("sort", "name")).andExpect(status().isOk());

    StudioListQuery.Tests query = capturedTests();
    assertThat(query.sort()).isEqualTo(StudioListQuery.TestSort.NAME);
    assertThat(query.ascending()).isTrue();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "sort=createdAt,desc",
        "sort=Name,asc",
        "sort=name,sideways",
        "sort=name,asc,desc",
        "lastRun=RUNNING",
        "lastRun=CANCELLED"
      })
  void anUnsupportedTestListParameterIsRejectedBeforeTheService(String parameter) throws Exception {
    mvc.perform(get(TESTS + "?" + parameter))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value(StudioListQuery.INVALID_QUERY));

    verifyNoInteractions(service);
  }

  // ── GET /executions ──────────────────────────────────────────────────────

  @Test
  void executionListWithoutParametersDefaultsToAcceptedAtDescending() throws Exception {
    mvc.perform(get(EXECUTIONS)).andExpect(status().isOk());

    StudioListQuery.Executions query = capturedExecutions();
    assertThat(query.sort()).isEqualTo(StudioListQuery.ExecutionSort.ACCEPTED_AT);
    assertThat(query.ascending()).isFalse();
    assertThat(query.testId()).isNull();
    assertThat(query.csiId()).isNull();
    assertThat(query.status()).isNull();
    assertThat(query.search()).isNull();
  }

  @Test
  void executionListForwardsEveryNewParameterNormalized() throws Exception {
    UUID testId = UUID.randomUUID();
    mvc.perform(
            get(EXECUTIONS)
                .param("testId", testId.toString())
                .param("csiId", "60431")
                .param("status", "cancelled")
                .param("q", " checkout ")
                .param("sort", "durationMs,desc"))
        .andExpect(status().isOk());

    StudioListQuery.Executions query = capturedExecutions();
    assertThat(query.testId()).isEqualTo(testId);
    assertThat(query.csiId()).isEqualTo("60431");
    assertThat(query.status()).isEqualTo(StudioListQuery.CANCELLED);
    assertThat(query.search()).isEqualTo("checkout");
    assertThat(query.sort()).isEqualTo(StudioListQuery.ExecutionSort.DURATION_MS);
    assertThat(query.ascending()).isFalse();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "sort=createdAt,desc",
        "sort=startedAt,asc",
        "sort=acceptedAt,up",
        "status=COMPLETED",
        "status=TIMEOUT",
        "status=NEVER"
      })
  void anUnsupportedExecutionListParameterIsRejectedBeforeTheService(String parameter)
      throws Exception {
    mvc.perform(get(EXECUTIONS + "?" + parameter))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value(StudioListQuery.INVALID_QUERY));

    verifyNoInteractions(service);
  }

  // ── LIKE escaping ────────────────────────────────────────────────────────

  @Test
  void searchPatternsEscapeTheirOwnWildcards() {
    assertThat(StudioListQuery.containsPattern("50%_Off!")).isEqualTo("%50!%!_off!!%");
  }

  private StudioListQuery.Tests capturedTests() {
    ArgumentCaptor<StudioListQuery.Tests> captor =
        ArgumentCaptor.forClass(StudioListQuery.Tests.class);
    verify(service).listTests(captor.capture(), anyInt(), anyInt(), any());
    return captor.getValue();
  }

  private StudioListQuery.Executions capturedExecutions() {
    ArgumentCaptor<StudioListQuery.Executions> captor =
        ArgumentCaptor.forClass(StudioListQuery.Executions.class);
    verify(service).listExecutions(captor.capture(), anyInt(), anyInt(), any());
    return captor.getValue();
  }
}

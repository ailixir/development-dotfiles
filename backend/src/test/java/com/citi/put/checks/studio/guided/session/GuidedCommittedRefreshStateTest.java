package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.time.Clock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * STUDIO-OBS-015 F2: the committed observation-refresh result is read back under the same state
 * predicate its writer used, {@code REPLAYING_PREFIX} while a prefix is pending and {@code
 * PROPOSING} otherwise. Every other conjunct is unchanged, so a mismatched pair stays {@code 409
 * STALE_GENERATION}.
 */
class GuidedCommittedRefreshStateTest {

  private final GuidedContracts contracts = new GuidedContracts();
  private final GuidedSessionRepository repository = mock(GuidedSessionRepository.class);
  private final GuidedIncrementalStore incremental = mock(GuidedIncrementalStore.class);
  private GuidedSessionService service;
  private Method committedRefresh;
  private ObjectNode observation;
  private ObjectNode request;

  @BeforeEach
  void wire() throws Exception {
    when(repository.incremental()).thenReturn(incremental);
    service =
        new GuidedSessionService(
            repository,
            contracts,
            mock(GuidedSessionAccess.class),
            mock(GuidedSessionProperties.class),
            com.citi.put.checks.studio.support.TestDomains.FIXTURES,
            Clock.systemUTC());
    committedRefresh =
        GuidedSessionService.class.getDeclaredMethod(
            "committedRefresh",
            GuidedSessionRepository.Session.class,
            JsonNode.class,
            String.class);
    committedRefresh.setAccessible(true);
    observation = contracts.object().put("generation", 5).put("documentId", "document-1");
    request = contracts.object().put("expectedGeneration", 4);
    ObjectNode result = contracts.object();
    result.set("observation", observation);
    when(repository.duplicate(
            eq("session-1"), eq("observation-refresh-result"), eq("callback-1"), anyString()))
        .thenReturn(result);
  }

  private GuidedSessionRepository.Session session(String state) {
    ObjectNode document = contracts.object().put("sessionId", "session-1").put("state", state);
    ObjectNode progress =
        contracts
            .object()
            .put("generation", 5)
            .put("observationHash", GuidedContracts.hash(observation));
    return new GuidedSessionRepository.Session(document, progress);
  }

  private Object read(String state, boolean pending) throws Exception {
    when(incremental.pending("session-1")).thenReturn(pending);
    try {
      return committedRefresh.invoke(service, session(state), request, "callback-1");
    } catch (InvocationTargetException wrapped) {
      throw (Exception) wrapped.getCause();
    }
  }

  @Test
  void aPendingPrefixReadsItsCommittedRefreshInReplayingPrefix() throws Exception {
    assertThat(read("REPLAYING_PREFIX", true)).isNotNull();
  }

  @Test
  void withoutAPendingPrefixTheRefreshIsReadInProposing() throws Exception {
    assertThat(read("PROPOSING", false)).isNotNull();
  }

  @Test
  void aStateThatDisagreesWithThePrefixIsStaleGeneration() {
    for (var row : new Object[][] {{"PROPOSING", true}, {"REPLAYING_PREFIX", false}}) {
      Throwable thrown = catchThrowable(() -> read((String) row[0], (Boolean) row[1]));
      assertThat(thrown)
          .as("%s with pending=%s", row[0], row[1])
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("STALE_GENERATION");
    }
  }
}

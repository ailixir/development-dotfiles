package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.translation.GroundingItHarness.Spec;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.citi.put.checks.support.TestPostgresDatabase;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * SC008-FIX-8 (supersedes the FIX-5 refresh): the first turn of a session. Bootstrap leaves the
 * initial blank document, which cannot yield a valid observation (a blank page has no http(s)
 * origin). Nothing is seeded and nothing is observed: the first STEP_CODE request carries
 * observation null, the model writes the first step, and it is dispatched. A missing or unworkable
 * observation on any other page is still refused.
 */
class GuidedFirstTurnObservationIT {
  private static final TestPostgresDatabase POSTGRES = new TestPostgresDatabase();

  @BeforeAll
  static void start() {
    POSTGRES.start();
  }

  @AfterAll
  static void stop() {
    POSTGRES.stop();
  }

  private static ObservationFixtures.Builder page() {
    return ObservationFixtures.observation();
  }

  /**
   * The session as bootstrap leaves it: planned and still PROPOSING with no observation. (The
   * harness's {@code session} flips a planned session to OBSERVING for tests that seed their own
   * observation; this puts it back.)
   */
  private static String bootstrapState(GroundingItHarness h, List<Spec> specs) {
    String id = h.session(specs);
    h.repository.transaction(
        () -> {
          var current = h.repository.lock(id);
          current.document().put("state", "PROPOSING");
          h.repository.save(current);
          return null;
        });
    return id;
  }

  @Test
  void theFirstTurnFromARealBootstrapStateAsksForTheFirstStepWithNoObservation() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Open the app.");
    String id = bootstrapState(h, List.of(Spec.of(0, "Open")));
    assertThat(h.progress(id).path("observation").isObject()).isFalse();
    assertThat(h.progress(id).path("executionEvidence").path("kind").asText())
        .isEqualTo("initialBlank");
    assertThat(h.state(id)).isEqualTo("PROPOSING");
    h.runnerSucceeds();
    h.reply(
        GuidedModelRequest.Kind.STEP_CODE,
        request -> h.code(request, "await page.goto('https://app.example/');"));

    h.advance(id);

    verify(h.dispatch, never()).observe(any(), anyString(), anyLong(), anyString(), any());
    var request =
        h.requests.stream().filter(r -> r.kind() == GuidedModelRequest.Kind.STEP_CODE).findFirst();
    assertThat(request).isPresent();
    var context = request.get().projection().document();
    assertThat(context.path("observation").isNull()).isTrue();
    assertThat(context.path("executionEvidence").path("kind").asText()).isEqualTo("initialBlank");
    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isEqualTo(1);
    var actions = h.actionRows(id);
    assertThat(actions).hasSize(1);
    assertThat(actions.getFirst().path("state").asText()).isEqualTo("SUCCEEDED");
    assertThat(actions.getFirst().path("dispatchCount").asInt()).isEqualTo(1);
  }

  /** A page that is not the initial blank document and has no observation is refused as before. */
  @Test
  void aMissingObservationOnAnyOtherPageIsStillRefused() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = bootstrapState(h, List.of(Spec.of(0, "Save")));
    h.repository.transaction(
        () -> {
          var current = h.repository.lock(id);
          ((com.fasterxml.jackson.databind.node.ObjectNode) current.progress())
              .withObject("/executionEvidence")
              .put("kind", "observedDocument");
          h.repository.save(current);
          return null;
        });
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));

    assertThatThrownBy(() -> h.advance(id))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> assertThat(failure.getMessage()).isEqualTo("UNSUPPORTED_SURFACE"));

    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isZero();
    assertThat(h.state(id)).isEqualTo("FAILED");
  }

  /** The refusal of a genuinely unworkable page stays: nothing to name, regions it cannot read. */
  @Test
  void anUnworkablePageIsStillRefused() throws Exception {
    var h = new GroundingItHarness(POSTGRES, "Click Save.");
    String id = h.session(List.of(Spec.of(0, "Save")));
    h.refreshWith(
        generation -> page().document("document-1", generation).coverage(0, 3, 0).build());
    h.reply(GuidedModelRequest.Kind.STEP_CODE, request -> h.code(request, "await ok();"));

    assertThatThrownBy(() -> h.advance(id))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> assertThat(failure.getMessage()).isEqualTo("UNSUPPORTED_SURFACE"));

    assertThat(h.requests(GuidedModelRequest.Kind.STEP_CODE)).isZero();
    assertThat(h.state(id)).isEqualTo("FAILED");
  }
}

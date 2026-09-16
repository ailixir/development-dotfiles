package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * <b>DELIBERATELY RED — two contract divergences escalated rather than fixed (ADR-002 §12).</b>
 *
 * <p>Story 10.15 AC-22. Both are <b>status-code semantics on a public operation</b>, which §12 puts
 * squarely in Class C — an architect rules, and a story may not land it. §12's other rule applies
 * instead: <i>leave it red and escalate</i>. Story 10.7's {@code
 * ExecutionErrorCodeContractEscalationTest} and story 10.9's AC-22 both did exactly this, and both
 * went green with no change to the test when the ruling landed.
 *
 * <p>Filed with @architect on <b>2026-09-16</b>, on the story's first day rather than at its gate —
 * story 10.14 recorded the lesson verbatim: <i>"discovering at the gate that the ruling never came
 * is how it silently becomes the next story's problem."</i>
 *
 * <p><b>ESC-1 — the route declares no {@code 401} and no {@code 403}.</b> {@code getExecution} and
 * {@code streamExecution} each declare both; architecture §9.1 requires CSI enforcement on videos
 * and downloads <em>by name</em>; and {@code StudioAccessDeniedException} states that the forbidden
 * and absent cases are deliberately indistinguishable, adding that <i>"the frozen contract agrees:
 * getTest, getExecution and both callbacks declare 400/401/403 and no 404"</i>. This route declares
 * a {@code 404} and neither of the other two. The <em>behaviour</em> is unambiguous and is shipped
 * — an unauthorized caller gets the snapshot route's {@code 403}, and the {@code 404} is reachable
 * only <em>after</em> authorization, so it is not an existence oracle — but the
 * <em>declaration</em> is missing, and adding responses to a public operation is Class C.
 *
 * <p><b>What an architect is being asked for (ESC-1):</b> declare {@code 401} and {@code 403} on
 * {@code getExecutionVideo}, by the same {@code $ref}s its siblings use, and record the amendment
 * in ADR-002 §13.
 *
 * <p><b>ESC-2 — no status is declared for an unreachable store.</b> {@code 404 No evidence for this
 * execution} would assert a fact about the run that the API has not observed; {@code 410} is
 * expiry's and {@code 416} is Range's. The route ships the <em>distinction</em> (AC-17) without
 * naming a declared status for it: it answers {@code 503} with {@code VIDEO_STORE_UNAVAILABLE},
 * which the document does not declare. That is the candidate, not a decision.
 *
 * <p><b>What an architect is being asked for (ESC-2):</b> rule which status an unreachable evidence
 * store answers, declare it on {@code getExecutionVideo}, and record it in §13. When either ruling
 * lands, the matching test below goes green with <b>no change to it</b>.
 *
 * <p>These are tests rather than comments because a comment is deleted by whoever finds it
 * inconvenient, and because the whole point of ADR-002 §6.2's mechanism is that a divergence has to
 * fail something.
 */
class ExecutionVideoContractEscalationTest {

  private static ContractDocument document;

  @BeforeAll
  static void load() throws IOException {
    document = ContractDocument.load();
  }

  @Test
  @DisplayName("ESC-1 — getExecutionVideo declares 401 and 403 like its siblings (Class C)")
  void theRouteDeclaresTheTwoAuthorizationStatusesItsSiblingsDeclare() {
    Set<String> video = statusesOf("/executions/{id}/video");
    Set<String> snapshot = statusesOf("/executions/{id}");
    Set<String> stream = statusesOf("/executions/{id}/events");

    assertThat(snapshot)
        .as("the premise: the sibling routes really do declare both")
        .contains("401", "403");
    assertThat(stream).contains("401", "403");

    assertThat(video)
        .as(
            "ESCALATION, not a build break (ADR-002 §12 Class C — status-code semantics on a "
                + "public surface). Architecture §9.1 requires CSI enforcement on videos and downloads "
                + "by name, the behaviour is shipped by story 10.15 AC-1, and the two sibling "
                + "execution routes each declare 401 and 403. This operation declares neither. A story "
                + "may not add responses to a public operation, so this is left failing on purpose so "
                + "the divergence cannot be buried. Declared today: %s",
            video)
        .contains("401", "403");
  }

  @Test
  @DisplayName("ESC-2 — a status is declared for an unreachable evidence store (Class C)")
  void theRouteDeclaresAStatusForAStoreItCouldNotReach() {
    Set<String> video = statusesOf("/executions/{id}/video");

    assertThat(video)
        .as(
            "the premise: the three statuses that are NOT this case are declared, so the gap is "
                + "specific rather than general")
        .contains("404", "410", "416");

    assertThat(video)
        .as(
            "ESCALATION, not a build break (ADR-002 §12 Class C). An unreachable store is not an "
                + "absent object: answering `404 No evidence for this execution` would state a fact "
                + "about the run that the API has not observed, and story 10.15 AC-17 ships the "
                + "distinction behaviourally. The route answers 503 VIDEO_STORE_UNAVAILABLE as a "
                + "CANDIDATE; choosing and declaring the status is an architect's. Declared today: %s",
            video)
        .contains("503");
  }

  @SuppressWarnings("unchecked")
  private static Set<String> statusesOf(String path) {
    Map<String, Object> responses =
        (Map<String, Object>) document.getOperation(path).get("responses");
    Set<String> statuses = new TreeSet<>();
    responses.keySet().forEach(status -> statuses.add(String.valueOf(status)));
    return statuses;
  }
}

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
 * <b>RULED AND CLOSED — both escalations are now conformance tests (ADR-002 §24).</b>
 *
 * <p>Story 10.15 AC-22 filed ESC-1 and ESC-2 with @architect on <b>2026-09-16</b> and left them
 * deliberately red, because both are <b>status-code semantics on a public operation</b>, which §12
 * puts squarely in Class C — an architect rules, and a story may not land it. @architect ruled both
 * in <b>ADR-002 §24</b> on the same day, and <b>story 10.31</b> landed the authorized document edit
 * (§24.6, exact text) together with §25's {@code SessionUnauthorized} envelope declaration.
 *
 * <p><b>Both methods below went from red to green with not one byte of the assertion region
 * changed</b> — only this Javadoc moved. That is the whole point of the mechanism: the ruling lands
 * in the document, and the test that named the divergence becomes the test that keeps it closed.
 * Story 10.7's {@code ExecutionErrorCodeContractEscalationTest} and story 10.9's AC-22 both behaved
 * the same way.
 *
 * <p><b>ESC-1 — the route declared no {@code 401} and no {@code 403}.</b> {@code getExecution} and
 * {@code streamExecution} each declare both; architecture §9.1 requires CSI enforcement on videos
 * and downloads <em>by name</em>; and {@code StudioAccessDeniedException} states that the forbidden
 * and absent cases are deliberately indistinguishable, adding that <i>"the frozen contract agrees:
 * getTest, getExecution and both callbacks declare 400/401/403 and no 404"</i>. The
 * <em>behaviour</em> was always shipped — an unauthorized caller gets the snapshot route's {@code
 * 403}, and the {@code 404} is reachable only <em>after</em> authorization, so it is not an
 * existence oracle — and only the <em>declaration</em> was missing. <b>Ruled (§24.2):</b> {@code
 * getExecutionVideo} declares {@code 401} and {@code 403} by the same {@code $ref}s its siblings
 * use. A route-local copy is caught separately by {@code
 * ExecutionVideoContractTest.theVideoRoutesRefusalRefsAreItsSiblingsOwn}.
 *
 * <p><b>ESC-2 — no status was declared for an unreachable store.</b> {@code 404 No evidence for
 * this execution} would assert a fact about the run that the API has not observed; {@code 410} is
 * expiry's and {@code 416} is Range's. The route shipped the <em>distinction</em> (AC-17) while
 * answering a {@code 503 VIDEO_STORE_UNAVAILABLE} the document did not declare. <b>Ruled
 * (§24.4):</b> {@code 503}, against {@code 404}, {@code 500}, {@code 502} and {@code 504}, each
 * rejected in §24.4's own table. {@code ExecutionVideoEvidenceIT
 * .anUnreachableStoreAndAnAbsentObjectAreDifferentAnswers} now asserts that status and its code
 * rather than only "not 404".
 *
 * <p><b>NO PRODUCTION CODE CHANGED</b> for either ruling (§24.2: <i>"This declares behaviour that
 * is already shipped and tested"</i>). Keeping this class rather than deleting it is deliberate:
 * dropping {@code Escalation} from the name is optional housekeeping, as §15.8 item 1 said for its
 * sibling, and the assertions are worth more as a permanent guard than as a closed ticket.
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

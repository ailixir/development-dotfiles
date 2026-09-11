package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Component;

/**
 * Classifies a draft update as a source change, an execution-affecting configuration change, both,
 * or neither (Architecture §4.2, story 10.4 AC-7).
 *
 * <p>Step text drives {@code sourceRevision}. Environment, variable values/references, viewport,
 * timeout, browser and wait strategy drive {@code configurationRevision}. Name and description
 * drive neither and never invalidate a confirmation.
 *
 * <p>Both sides are read through {@link LegacyStudioAdapter}, so a draft stored in a legacy shape
 * is compared by value against a request in the typed shape: reformatting, or merely resubmitting
 * the same content in the new contract, advances nothing.
 *
 * <p>Target policy selection is also an execution-affecting change per §4.2, but no such field
 * exists on the test contract yet; it is introduced with the destination policy work and must be
 * added to {@link #classify} at that point.
 */
@Component
public class ConfigurationChangeClassifier {

  /**
   * Result of classifying an update.
   *
   * @param sourceChanged the ordered step text differs from the stored draft
   * @param configurationChanged at least one execution-affecting configuration field differs
   */
  public record Classification(boolean sourceChanged, boolean configurationChanged) {

    public boolean anyChanged() {
      return sourceChanged || configurationChanged;
    }
  }

  public Classification classify(UITest stored, UITestRequest request) {
    List<String> storedSteps = LegacyStudioAdapter.parseSteps(stored.getSteps());
    List<StudioVariable> storedVariables =
        LegacyStudioAdapter.parseVariables(stored.getVariables());
    TestConfiguration requested = request.configuration();

    boolean sourceChanged = !storedSteps.equals(request.steps());
    boolean configurationChanged =
        !storedVariables.equals(request.variables())
            || !Objects.equals(stored.getEnvironment(), request.environment())
            || !Objects.equals(
                LegacyStudioAdapter.normalizeBrowser(stored.getBrowser()), requested.browser())
            || !Objects.equals(stored.getViewportWidth(), requested.viewport().width())
            || !Objects.equals(stored.getViewportHeight(), requested.viewport().height())
            || !Objects.equals(stored.getTimeoutSeconds(), requested.timeoutSeconds())
            || !Objects.equals(stored.getWaitStrategy(), requested.waitStrategy());
    return new Classification(sourceChanged, configurationChanged);
  }
}

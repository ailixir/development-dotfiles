package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import org.junit.jupiter.api.Test;

class GuidedRejectionDiagnosticsTest {
  @Test
  void checkNamesTheThrowingValidationAndItsCallerWithoutAnyData() {
    var contracts = new GuidedContracts();
    var response = contracts.object().put("secretLookingValue", "hunter2-step-text");
    response.putArray("sourceReferences");
    response.putArray("obligations");
    GuidedSessionException failure = null;
    try {
      new GuidedProposalValidator(contracts)
          .admitPlan(contracts.object().put("sessionId", "s"), response);
    } catch (GuidedSessionException refused) {
      failure = refused;
    }
    assertThat(failure).isNotNull();
    String check = GuidedRejectionDiagnostics.check(failure);
    assertThat(check).matches("(\\w+\\.[\\w$]+:\\d+)(<\\w+\\.[\\w$]+:\\d+)?");
    assertThat(check).doesNotContain("hunter2");
  }
}

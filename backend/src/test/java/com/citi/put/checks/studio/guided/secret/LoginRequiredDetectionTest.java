package com.citi.put.checks.studio.guided.secret;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.translation.LoginRequiredSignature;
import org.junit.jupiter.api.Test;

class LoginRequiredDetectionTest {
  @Test
  void trustedStructuralSignatureUsesNoLocalizedTextAndRequiresVisibleActionableButton() {
    var observation = new GuidedContracts().object();
    observation.putObject("coverage").put("passwordControls", 1);
    var button =
        observation
            .putArray("nodes")
            .addObject()
            .put("elementType", "button")
            .put("visible", true)
            .put("actionable", true)
            .put("name", "Identifiez-vous");
    assertThat(LoginRequiredSignature.matches(observation)).isTrue();
    button.put("visible", false);
    assertThat(LoginRequiredSignature.matches(observation)).isFalse();
    button.put("visible", true).put("actionable", false);
    assertThat(LoginRequiredSignature.matches(observation)).isFalse();
    button.put("actionable", true);
    observation.withObject("coverage").put("passwordControls", 0);
    assertThat(LoginRequiredSignature.matches(observation)).isFalse();
  }
}

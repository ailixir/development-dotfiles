package com.citi.put.checks.studio.guided.secret;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.translation.LoginRequiredSignature;
import com.citi.put.checks.studio.support.ObservationFixtures;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

class LoginRequiredDetectionTest {
  @Test
  void trustedStructuralSignatureUsesNoLocalizedTextAndRequiresAPasswordControlAndAButton() {
    // ADR-SC-007: the facts table carries a role and no visible/actionable flags, so the
    // signature is a password control plus a button fact, whatever the (localized) name says.
    ObjectNode login =
        ObservationFixtures.observation()
            .editable("e1", "textbox", "Identifiant")
            .element("e2", "button", "Identifiez-vous")
            .coverage(0, 0, 1)
            .build();
    assertThat(LoginRequiredSignature.matches(login)).isTrue();
    ObjectNode noButton =
        ObservationFixtures.observation()
            .editable("e1", "textbox", "Identifiez-vous")
            .element("e2", "link", "Identifiez-vous")
            .coverage(0, 0, 1)
            .build();
    assertThat(LoginRequiredSignature.matches(noButton)).isFalse();
    ObjectNode noPassword =
        ObservationFixtures.observation()
            .element("e1", "button", "Identifiez-vous")
            .coverage(0, 0, 0)
            .build();
    assertThat(LoginRequiredSignature.matches(noPassword)).isFalse();
    ObjectNode empty = ObservationFixtures.observation().coverage(0, 0, 1).build();
    assertThat(LoginRequiredSignature.matches(empty)).isFalse();
  }
}

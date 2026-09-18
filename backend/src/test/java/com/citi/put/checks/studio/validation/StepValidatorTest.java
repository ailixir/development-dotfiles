package com.citi.put.checks.studio.validation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class StepValidatorTest {

  private final StepValidator validator = new StepValidator();

  @Test
  void acceptsNaturalLanguageCheckIfAssertions() {
    assertThat(validator.validate("Check if the page loaded fine")).containsEntry("isValid", true);
  }
}

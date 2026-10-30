package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

/**
 * ADR-SC-007 D6 / WI-1: the contract text states the radio and the read/needId rules. The earlier
 * add-only comparison with the pre-WI-1 contract is replaced by GuidedS3ParityTest, which proves
 * the whole text equals the spike S3 contract plus the one documented edit.
 */
class GuidedPlanContractTextTest {
  private static String resource(String name) throws IOException {
    try (var in = GuidedPlanContractTextTest.class.getResourceAsStream(name)) {
      assertThat(in).isNotNull();
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }
  }

  @Test
  void theRadioRuleSaysCheckForRadiosAndNeverUncheckOrSelectOption() throws IOException {
    String now = resource("/studio/guided-output-contract.md");
    assertThat(now)
        .contains(
            "A radio button option is chosen with check, and a checkbox is ticked with check and"
                + " cleared with uncheck",
            "Never plan uncheck for a radio button option, and never plan selectOption for a radio"
                + " button or a checkbox",
            "targetIntent is the option's own label",
            "never the label of the group it sits in",
            "selectOption is only for choosing a value of a dropdown, menu or list that the step"
                + " names with `in` or `from` a field, menu, dropdown or list");
  }

  @Test
  void theReadRuleSaysSharedNeedIdAndNoNeedsList() throws IOException {
    String now = resource("/studio/guided-output-contract.md");
    assertThat(now)
        .contains(
            "is one read obligation: referenceIndex null, predicate null",
            "carries that same needId with referenceIndex null",
            "never an earlier one",
            "One needId belongs to exactly one read, and a read that no obligation uses is refused",
            "Do not write a needs list: the server derives the needs from the needIds",
            "When context.needs lists a need from earlier retained steps");
  }
}

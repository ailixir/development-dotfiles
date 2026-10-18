package com.citi.put.checks.studio.guided.policy;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Governed observation policy settings (STUDIO-OBS-014 AC-1/AC-5, rulings AR-2 f and h).
 *
 * @param approverGroups Core roles whose members may approve a policy version. Empty (the default)
 *     refuses every approval: fail closed until OBS-010 provisions the group.
 * @param defaultDestructiveVocabulary the destructive verbs and phrases materialized into a policy
 *     document that omits its own vocabulary (1..64 lowercase entries, each 1..64 characters)
 */
@ConfigurationProperties("studio.guided-authoring.policy")
public record GuidedPolicyProperties(
    List<String> approverGroups, List<String> defaultDestructiveVocabulary) {

  public GuidedPolicyProperties {
    approverGroups = approverGroups == null ? List.of() : List.copyOf(approverGroups);
    defaultDestructiveVocabulary =
        defaultDestructiveVocabulary == null
            ? List.of()
            : List.copyOf(defaultDestructiveVocabulary);
    if (!ObservationPolicyDocuments.validVocabulary(defaultDestructiveVocabulary)) {
      throw new IllegalArgumentException(
          "studio.guided-authoring.policy.default-destructive-vocabulary must hold 1..64 lowercase"
              + " entries of 1..64 characters");
    }
  }
}

package com.citi.put.checks.studio.authoring;

import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Promotes persisted legacy strings to stable-ID authoring only when a v2 write is requested. */
public final class LegacyAuthoringPersistenceAdapter {

  private LegacyAuthoringPersistenceAdapter() {}

  /**
   * Produces deterministic identities scoped by draft and position while preserving every Java
   * string exactly. The result becomes durable when the caller stores it; reads never invoke this
   * adapter and therefore cannot mint identities.
   */
  public static AuthoringV2Request adapt(UUID testId, String persistedSteps) {
    List<String> legacy = LegacyStudioAdapter.parseSteps(persistedSteps);
    List<AuthoringStep> steps = new ArrayList<>(legacy.size());
    for (int index = 0; index < legacy.size(); index++) {
      String text = legacy.get(index);
      String identityMaterial = testId + "\u0000" + index + "\u0000" + text;
      UUID id = UUID.nameUUIDFromBytes(identityMaterial.getBytes(StandardCharsets.UTF_8));
      steps.add(new AuthoringStep(id, text, StepAuthoringContext.empty()));
    }
    return new AuthoringV2Request(2, GlobalAuthoringContext.empty(), steps);
  }
}

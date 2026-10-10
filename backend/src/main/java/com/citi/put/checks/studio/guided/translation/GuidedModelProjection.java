package com.citi.put.checks.studio.guided.translation;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;

/** Positive-field, schema-checked gateway projection; never a runner context. */
public record GuidedModelProjection(ObjectNode document) {
  public GuidedModelProjection {
    new GuidedContracts().validate("v2/planning-context", document);
    document = document.deepCopy();
  }

  @Override
  public ObjectNode document() {
    return document.deepCopy();
  }
}

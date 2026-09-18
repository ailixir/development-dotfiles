package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/** Entry kinds permitted in step-local context. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
@JsonSubTypes({
  @JsonSubTypes.Type(value = ContextText.class, name = "text"),
  @JsonSubTypes.Type(value = LiteralInput.class, name = "literal"),
  @JsonSubTypes.Type(value = VariableReference.class, name = "variableRef"),
  @JsonSubTypes.Type(value = SecretReference.class, name = "secretRef"),
  @JsonSubTypes.Type(value = TargetHint.class, name = "targetHint"),
  @JsonSubTypes.Type(value = ContextualDefault.class, name = "default")
})
public sealed interface StepContextEntry
    permits ContextText,
        LiteralInput,
        VariableReference,
        SecretReference,
        TargetHint,
        ContextualDefault {}

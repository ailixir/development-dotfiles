package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/** Entry kinds permitted in test-scoped context. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
@JsonSubTypes({
  @JsonSubTypes.Type(value = ContextText.class, name = "text"),
  @JsonSubTypes.Type(value = TargetHint.class, name = "targetHint"),
  @JsonSubTypes.Type(value = ContextualDefault.class, name = "default")
})
public sealed interface GlobalContextEntry permits ContextText, TargetHint, ContextualDefault {}

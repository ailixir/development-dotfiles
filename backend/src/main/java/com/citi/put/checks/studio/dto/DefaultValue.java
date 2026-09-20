package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/** Allowed nonsecret value forms for a contextual default. */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
@JsonSubTypes({
  @JsonSubTypes.Type(value = DefaultLiteralValue.class, name = "literal"),
  @JsonSubTypes.Type(value = DefaultVariableValue.class, name = "variableRef")
})
public sealed interface DefaultValue permits DefaultLiteralValue, DefaultVariableValue {}

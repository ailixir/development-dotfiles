package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

/** Reviewed exact literal or safe opaque reference. */
@JsonTypeInfo(
    use = JsonTypeInfo.Id.NAME,
    include = JsonTypeInfo.As.EXISTING_PROPERTY,
    property = "kind",
    visible = true)
@JsonSubTypes({
  @JsonSubTypes.Type(value = ResolvedLiteralInput.class, name = "literal"),
  @JsonSubTypes.Type(value = ResolvedReferenceInput.class, name = "variableRef"),
  @JsonSubTypes.Type(value = ResolvedReferenceInput.class, name = "secretRef")
})
public sealed interface ResolvedInput permits ResolvedLiteralInput, ResolvedReferenceInput {}

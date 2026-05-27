package com.citi.put.checks.reports.section;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "kind")
@JsonSubTypes({
  @JsonSubTypes.Type(value = ManualSection.class, name = "manual"),
  @JsonSubTypes.Type(value = RuleSection.class, name = "rule")
})
public sealed interface ReportSection permits ManualSection, RuleSection {

  String id();

  String title();
}

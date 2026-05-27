package com.citi.put.checks.reports.section;

import com.fasterxml.jackson.annotation.JsonTypeName;
import java.util.List;

@JsonTypeName("rule")
public record RuleSection(String id, String title, RuleConfig rule) implements ReportSection {

  public record RuleConfig(
      List<String> csiIds,
      List<String> tags,
      List<String> types,
      List<String> status,
      String timeframe,
      String sort,
      Integer limit) {}
}

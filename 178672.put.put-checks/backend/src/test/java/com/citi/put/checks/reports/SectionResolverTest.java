package com.citi.put.checks.reports;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.reports.section.ManualSection;
import com.citi.put.checks.reports.section.ReportSection;
import com.citi.put.checks.reports.section.RuleSection;
import com.citi.put.checks.reports.section.SectionResolver;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class SectionResolverTest {

  private final SectionResolver resolver = new SectionResolver(null, new ObjectMapper(), null, 200);

  @Test
  void parsesManualSection() {
    String json =
        """
        [
          {
            "id": "s1",
            "title": "Critical Checks",
            "kind": "manual",
            "checkIds": ["aaa-bbb", "ccc-ddd"]
          }
        ]
        """;
    List<ReportSection> sections = resolver.parseSections(json);
    assertThat(sections).hasSize(1);
    assertThat(sections.get(0)).isInstanceOf(ManualSection.class);
    ManualSection manual = (ManualSection) sections.get(0);
    assertThat(manual.title()).isEqualTo("Critical Checks");
    assertThat(manual.checkIds()).containsExactly("aaa-bbb", "ccc-ddd");
  }

  @Test
  void parsesRuleSection() {
    String json =
        """
        [
          {
            "id": "s2",
            "title": "Failing HTTP",
            "kind": "rule",
            "rule": {
              "csiIds": ["30001"],
              "types": ["HTTP"],
              "status": ["FAILING"],
              "sort": "failing-first",
              "limit": 10
            }
          }
        ]
        """;
    List<ReportSection> sections = resolver.parseSections(json);
    assertThat(sections).hasSize(1);
    assertThat(sections.get(0)).isInstanceOf(RuleSection.class);
    RuleSection rule = (RuleSection) sections.get(0);
    assertThat(rule.title()).isEqualTo("Failing HTTP");
    assertThat(rule.rule().csiIds()).containsExactly("30001");
    assertThat(rule.rule().types()).containsExactly("HTTP");
    assertThat(rule.rule().status()).containsExactly("FAILING");
    assertThat(rule.rule().sort()).isEqualTo("failing-first");
    assertThat(rule.rule().limit()).isEqualTo(10);
  }

  @Test
  void parsesMixedSections() {
    String json =
        """
        [
          {"id": "s1", "title": "Manual", "kind": "manual", "checkIds": ["x"]},
          {"id": "s2", "title": "Rule", "kind": "rule", "rule": {"types": ["TCP"]}}
        ]
        """;
    List<ReportSection> sections = resolver.parseSections(json);
    assertThat(sections).hasSize(2);
    assertThat(sections.get(0)).isInstanceOf(ManualSection.class);
    assertThat(sections.get(1)).isInstanceOf(RuleSection.class);
  }

  @Test
  void parsesEmptyArray() {
    assertThat(resolver.parseSections("[]")).isEmpty();
  }

  @Test
  void parsesNullGracefully() {
    assertThat(resolver.parseSections(null)).isEmpty();
  }

  @Test
  void parsesBlankGracefully() {
    assertThat(resolver.parseSections("")).isEmpty();
  }

  @Test
  void parsesInvalidJsonGracefully() {
    assertThat(resolver.parseSections("not json")).isEmpty();
  }
}

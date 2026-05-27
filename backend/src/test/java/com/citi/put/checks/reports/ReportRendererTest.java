package com.citi.put.checks.reports;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.reports.entity.Report;
import com.citi.put.checks.reports.render.ReportRenderer;
import com.citi.put.checks.reports.render.ResolvedSection;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ReportRendererTest {

  private final ReportRenderer renderer = new ReportRenderer();

  private CheckDto check(String name, String type, String status) {
    return new CheckDto(
        UUID.randomUUID(),
        name,
        type,
        "desc",
        "30001",
        "Trading Platform",
        status,
        null,
        "Production",
        "user@citi.com",
        Instant.now(),
        Instant.now(),
        null,
        java.util.List.of(),
        null,
        null,
        null);
  }

  @Test
  void standardTemplateRendersFullTable() {
    Report report = report("standard");
    ResolvedSection section =
        new ResolvedSection("Critical Checks", List.of(check("Health", "HTTP", "PASSING")));

    String html = renderer.render(report, List.of(section));

    assertThat(html).contains("STATUS REPORT");
    assertThat(html).contains("Critical Checks");
    assertThat(html).contains("Health");
    assertThat(html).contains("<th");
    assertThat(html).contains("background:#1565c0");
  }

  @Test
  void executiveTemplateRendersStatusBars() {
    Report report = report("executive");
    ResolvedSection section =
        new ResolvedSection(
            "Overview",
            List.of(
                check("A", "HTTP", "PASSING"),
                check("B", "TCP", "FAILING"),
                check("C", "HTTP", "WARNING")));

    String html = renderer.render(report, List.of(section));

    assertThat(html).contains("EXECUTIVE SUMMARY");
    assertThat(html).contains("background:#1b5e20");
    assertThat(html).contains("Passing");
    assertThat(html).contains("Failing");
    assertThat(html).contains("Warning");
    assertThat(html).contains("Attention:");
    assertThat(html).doesNotContain("<thead>");
  }

  @Test
  void detailedTemplateIncludesDescriptionAndEnvColumns() {
    Report report = report("detailed");
    ResolvedSection section =
        new ResolvedSection("All Checks", List.of(check("DB Check", "TCP", "PASSING")));

    String html = renderer.render(report, List.of(section));

    assertThat(html).contains("DETAILED REPORT");
    assertThat(html).contains("background:#4527a0");
    assertThat(html).contains("Env");
    assertThat(html).contains("Description");
    assertThat(html).contains("Production");
  }

  @Test
  void alertDigestShowsOnlyFailingAndWarning() {
    Report report = report("alert-digest");
    ResolvedSection section =
        new ResolvedSection(
            "Alerts",
            List.of(
                check("OK Check", "HTTP", "PASSING"),
                check("Bad Check", "TCP", "FAILING"),
                check("Warn Check", "HTTP", "WARNING")));

    String html = renderer.render(report, List.of(section));

    assertThat(html).contains("ALERT DIGEST");
    assertThat(html).contains("background:#b71c1c");
    assertThat(html).contains("Bad Check");
    assertThat(html).contains("Warn Check");
    assertThat(html).contains("border-left:4px solid");
    assertThat(html).doesNotContain("<thead>");
    assertThat(html).contains("1 passing check");
  }

  @Test
  void alertDigestAllClearWhenNoneFailingOrWarning() {
    Report report = report("alert-digest");
    ResolvedSection section =
        new ResolvedSection("Status", List.of(check("Good", "HTTP", "PASSING")));

    String html = renderer.render(report, List.of(section));

    assertThat(html).contains("All clear");
    assertThat(html).contains("1 checks passing");
  }

  @Test
  void trendAnalysisRendersProgressBars() {
    Report report = report("trend-analysis");
    ResolvedSection section =
        new ResolvedSection(
            "Trend",
            List.of(
                check("A", "HTTP", "PASSING"),
                check("B", "HTTP", "PASSING"),
                check("C", "TCP", "FAILING")));

    String html = renderer.render(report, List.of(section));

    assertThat(html).contains("TREND ANALYSIS");
    assertThat(html).contains("background:#00695c");
    assertThat(html).contains("border-radius:4px");
    assertThat(html).contains("66%");
    assertThat(html).contains("33%");
    assertThat(html).contains("<thead>");
  }

  @Test
  void rendersEmptySections() {
    Report report = report("standard");
    String html = renderer.render(report, List.of());

    assertThat(html).contains("<!DOCTYPE html>");
    assertThat(html).contains("Empty Report");
  }

  @Test
  void rendersSectionWithNoChecks() {
    Report report = report("standard");
    ResolvedSection empty = new ResolvedSection("Empty Section", List.of());

    String html = renderer.render(report, List.of(empty));

    assertThat(html).contains("Empty Section");
    assertThat(html).contains("No checks matched");
  }

  @Test
  void escapesHtmlInNames() {
    Report report =
        new Report(
            "Report <script>",
            null,
            "standard",
            "[]",
            "{}",
            new String[] {},
            null,
            "user@citi.com");

    String html = renderer.render(report, List.of());

    assertThat(html).doesNotContain("<script>");
    assertThat(html).contains("&lt;script&gt;");
  }

  private Report report(String template) {
    return new Report(
        "Empty Report",
        "Test description",
        template,
        "[]",
        "{}",
        new String[] {"ops@citi.com"},
        null,
        "user@citi.com");
  }
}

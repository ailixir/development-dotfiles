package com.citi.put.checks.reports.render;

import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.reports.entity.Report;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class ReportRenderer {

  private static final DateTimeFormatter FMT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm z").withZone(ZoneId.of("UTC"));

  private static final Map<String, String> STATUS_COLORS =
      Map.of(
          "PASSING", "#2e7d32",
          "FAILING", "#c62828",
          "WARNING", "#ef6c00",
          "PENDING", "#757575",
          "UNKNOWN", "#9e9e9e");

  private static final Map<String, String> STATUS_BG =
      Map.of(
          "PASSING", "#e8f5e9",
          "FAILING", "#ffebee",
          "WARNING", "#fff3e0",
          "PENDING", "#f5f5f5",
          "UNKNOWN", "#fafafa");

  private static final Map<String, String> HEADER_COLORS =
      Map.of(
          "standard", "#1565c0",
          "executive", "#1b5e20",
          "detailed", "#4527a0",
          "alert-digest", "#b71c1c",
          "trend-analysis", "#00695c");

  public String render(Report report, List<ResolvedSection> sections) {
    String template = report.getTemplate() != null ? report.getTemplate() : "standard";
    StringBuilder html = new StringBuilder();
    html.append("<!DOCTYPE html><html><head><meta charset=\"UTF-8\">");
    html.append("<title>").append(esc(report.getName())).append("</title></head><body ");
    html.append("style=\"margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;");
    html.append("background:#f5f5f5\">");

    appendHeader(html, report, template);

    for (ResolvedSection section : sections) {
      switch (template) {
        case "executive" -> appendExecutiveSection(html, section);
        case "detailed" -> appendDetailedSection(html, section);
        case "alert-digest" -> appendAlertDigestSection(html, section);
        case "trend-analysis" -> appendTrendSection(html, section);
        default -> appendStandardSection(html, section);
      }
    }

    appendFooter(html, template);
    html.append("</body></html>");
    return html.toString();
  }

  private void appendHeader(StringBuilder html, Report report, String template) {
    String bg = HEADER_COLORS.getOrDefault(template, "#1565c0");
    String templateLabel = templateLabel(template);

    html.append(
        "<!--[if mso]><table role=\"presentation\" width=\"700\" align=\"center\""
            + " cellpadding=\"0\" cellspacing=\"0\" style=\"width:700px\"><tr><td><![endif]-->");
    html.append("<div style=\"max-width:700px;margin:0 auto;background:#fff;overflow:hidden;");
    html.append("margin-top:24px\">");
    html.append("<div style=\"background:").append(bg).append(";color:#fff;padding:24px 32px\">");
    html.append(
        "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\""
            + " style=\"width:100%\"><tr>");
    html.append(
        "<td style=\"vertical-align:top;color:#fff;font-family:Arial,Helvetica,sans-serif\">");
    html.append("<h1 style=\"margin:0;font-size:22px;color:#fff\">").append(esc(report.getName()));
    html.append("</h1>");
    if (report.getDescription() != null && !report.getDescription().isBlank()) {
      html.append("<p style=\"margin:8px 0 0;color:#d6d6d6;font-size:14px\">");
      html.append(esc(report.getDescription())).append("</p>");
    }
    html.append("</td>");
    html.append("<td style=\"vertical-align:top;text-align:right;width:140px;padding-left:16px\">");
    html.append("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"");
    html.append(" align=\"right\"><tr><td style=\"background:#4b87cd;padding:4px 10px;");
    html.append("font-size:11px;font-weight:bold;white-space:nowrap;color:#fff;");
    html.append("font-family:Arial,Helvetica,sans-serif\">");
    html.append(esc(templateLabel)).append("</td></tr></table>");
    html.append("</td>");
    html.append("</tr></table>");
    html.append("<p style=\"margin:12px 0 0;font-size:12px;color:#b0b0b0\">Generated: ");
    html.append(FMT.format(Instant.now())).append("</p>");
    html.append("</div>");
  }

  // ── Standard: full table with all columns ──────────────────────────────────

  private void appendStandardSection(StringBuilder html, ResolvedSection section) {
    List<CheckDto> checks = section.checks();
    appendSectionHeader(html, section);

    if (!checks.isEmpty()) {
      html.append("<table style=\"width:100%;border-collapse:collapse;font-size:13px\">");
      html.append("<thead><tr style=\"background:#fafafa;text-align:left\">");
      th(html, "Check");
      th(html, "Type");
      th(html, "CSI");
      th(html, "Status");
      th(html, "Last Run");
      html.append("</tr></thead><tbody>");
      for (CheckDto c : checks) {
        html.append("<tr>");
        td(html, esc(c.name()));
        td(html, esc(c.type()));
        td(html, esc(c.csiName()));
        tdStatus(html, c.status());
        td(html, c.updatedAt() != null ? FMT.format(c.updatedAt()) : "N/A");
        html.append("</tr>");
      }
      html.append("</tbody></table>");
    } else {
      noChecks(html);
    }
    html.append("</div>");
  }

  // ── Executive: summary bars + pass/fail counts, no individual rows ─────────

  private void appendExecutiveSection(StringBuilder html, ResolvedSection section) {
    List<CheckDto> checks = section.checks();
    long passing = checks.stream().filter(c -> "PASSING".equals(c.status())).count();
    long failing = checks.stream().filter(c -> "FAILING".equals(c.status())).count();
    long warning = checks.stream().filter(c -> "WARNING".equals(c.status())).count();
    long other = checks.size() - passing - failing - warning;
    int total = checks.size();

    appendSectionHeader(html, section);

    if (total == 0) {
      noChecks(html);
      html.append("</div>");
      return;
    }

    html.append("<div style=\"margin-bottom:16px\">");
    appendStatusBar(html, passing, warning, failing, other, total);
    html.append("</div>");

    html.append("<table style=\"width:100%;border-collapse:collapse;font-size:14px\">");
    execRow(html, "Passing", passing, total, "#2e7d32");
    execRow(html, "Warning", warning, total, "#ef6c00");
    execRow(html, "Failing", failing, total, "#c62828");
    if (other > 0) {
      execRow(html, "Other", other, total, "#757575");
    }
    html.append("</table>");

    if (failing > 0) {
      html.append(
          "<div style=\"margin-top:16px;padding:12px 16px;background:#ffebee;border-radius:6px;"
              + "border-left:4px solid #c62828;font-size:13px\">");
      html.append("<strong style=\"color:#c62828\">Attention:</strong> ");
      html.append(failing).append(" check").append(failing > 1 ? "s" : "");
      html.append(" require").append(failing == 1 ? "s" : "").append(" investigation: ");
      checks.stream()
          .filter(c -> "FAILING".equals(c.status()))
          .limit(5)
          .forEach(
              c -> {
                html.append("<span style=\"font-weight:600\">");
                html.append(esc(c.name())).append("</span>, ");
              });
      html.setLength(html.length() - 2);
      html.append("</div>");
    }

    html.append("</div>");
  }

  // ── Detailed: full table + description + environment columns ───────────────

  private void appendDetailedSection(StringBuilder html, ResolvedSection section) {
    List<CheckDto> checks = section.checks();
    appendSectionHeader(html, section);

    if (!checks.isEmpty()) {
      html.append("<table style=\"width:100%;border-collapse:collapse;font-size:12px\">");
      html.append("<thead><tr style=\"background:#ede7f6;text-align:left\">");
      th(html, "Check");
      th(html, "Type");
      th(html, "CSI");
      th(html, "Env");
      th(html, "Status");
      th(html, "Description");
      th(html, "Last Run");
      html.append("</tr></thead><tbody>");
      for (CheckDto c : checks) {
        html.append("<tr>");
        td(html, esc(c.name()));
        td(html, esc(c.type()));
        td(html, esc(c.csiName()));
        td(html, esc(c.environment()));
        tdStatus(html, c.status());
        td(html, c.description() != null ? esc(truncate(c.description(), 60)) : "");
        td(html, c.updatedAt() != null ? FMT.format(c.updatedAt()) : "N/A");
        html.append("</tr>");
      }
      html.append("</tbody></table>");
    } else {
      noChecks(html);
    }
    html.append("</div>");
  }

  // ── Alert Digest: only failing/warning checks, card layout ─────────────────

  private void appendAlertDigestSection(StringBuilder html, ResolvedSection section) {
    List<CheckDto> alerts =
        section.checks().stream()
            .filter(c -> "FAILING".equals(c.status()) || "WARNING".equals(c.status()))
            .toList();
    long suppressed = section.checks().size() - alerts.size();

    appendSectionHeader(html, section);

    if (alerts.isEmpty()) {
      html.append("<div style=\"padding:20px;background:#e8f5e9;text-align:center\">");
      html.append(
          "<span style=\"font-size:28px\">&#10003;</span><br>"
              + "<strong style=\"color:#2e7d32;font-size:15px\">All clear</strong><br>");
      html.append("<span style=\"font-size:12px;color:#666\">");
      html.append(section.checks().size()).append(" checks passing</span></div>");
    } else {
      for (CheckDto c : alerts) {
        String bg = STATUS_BG.getOrDefault(c.status(), "#fafafa");
        String border = STATUS_COLORS.getOrDefault(c.status(), "#9e9e9e");
        html.append("<div style=\"padding:12px 16px;margin-bottom:8px;background:");
        html.append(bg).append(";border-left:4px solid ").append(border).append("\">");
        html.append(
            "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\""
                + " style=\"width:100%\"><tr>");
        html.append(
            "<td style=\"font-size:14px;font-weight:bold;font-family:Arial,Helvetica,sans-serif\">");
        html.append(esc(c.name())).append("</td>");
        html.append("<td style=\"text-align:right;width:80px\">");
        statusChip(html, c.status());
        html.append("</td>");
        html.append("</tr></table>");
        html.append("<div style=\"font-size:12px;color:#666;margin-top:4px\">");
        html.append(esc(c.type())).append(" &middot; ").append(esc(c.csiName()));
        if (c.updatedAt() != null) {
          html.append(" &middot; ").append(FMT.format(c.updatedAt()));
        }
        html.append("</div>");
        if (c.description() != null && !c.description().isBlank()) {
          html.append("<div style=\"font-size:12px;color:#888;margin-top:4px;font-style:italic\">");
          html.append(esc(truncate(c.description(), 120))).append("</div>");
        }
        html.append("</div>");
      }
    }

    if (suppressed > 0) {
      html.append("<div style=\"font-size:12px;color:#999;text-align:right;margin-top:4px\">");
      html.append(suppressed).append(" passing check").append(suppressed > 1 ? "s" : "");
      html.append(" not shown</div>");
    }
    html.append("</div>");
  }

  // ── Trend Analysis: status distribution bar + full table ───────────────────

  private void appendTrendSection(StringBuilder html, ResolvedSection section) {
    List<CheckDto> checks = section.checks();
    long passing = checks.stream().filter(c -> "PASSING".equals(c.status())).count();
    long failing = checks.stream().filter(c -> "FAILING".equals(c.status())).count();
    long warning = checks.stream().filter(c -> "WARNING".equals(c.status())).count();
    long pending = checks.stream().filter(c -> "PENDING".equals(c.status())).count();
    long unknown = checks.size() - passing - failing - warning - pending;
    int total = checks.size();

    appendSectionHeader(html, section);

    if (total == 0) {
      noChecks(html);
      html.append("</div>");
      return;
    }

    html.append("<div style=\"margin-bottom:20px\">");
    html.append("<table style=\"width:100%;border-collapse:collapse;font-size:13px\">");
    trendRow(html, "PASSING", passing, total);
    trendRow(html, "WARNING", warning, total);
    trendRow(html, "FAILING", failing, total);
    trendRow(html, "PENDING", pending, total);
    if (unknown > 0) {
      trendRow(html, "UNKNOWN", unknown, total);
    }
    html.append("</table></div>");

    html.append("<table style=\"width:100%;border-collapse:collapse;font-size:13px\">");
    html.append("<thead><tr style=\"background:#e0f2f1;text-align:left\">");
    th(html, "Check");
    th(html, "Type");
    th(html, "CSI");
    th(html, "Status");
    th(html, "Last Run");
    html.append("</tr></thead><tbody>");
    for (CheckDto c : checks) {
      html.append("<tr>");
      td(html, esc(c.name()));
      td(html, esc(c.type()));
      td(html, esc(c.csiName()));
      tdStatus(html, c.status());
      td(html, c.updatedAt() != null ? FMT.format(c.updatedAt()) : "N/A");
      html.append("</tr>");
    }
    html.append("</tbody></table>");

    html.append("</div>");
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  private void appendSectionHeader(StringBuilder html, ResolvedSection section) {
    List<CheckDto> checks = section.checks();
    long passing = checks.stream().filter(c -> "PASSING".equals(c.status())).count();
    long failing = checks.stream().filter(c -> "FAILING".equals(c.status())).count();
    long warning = checks.stream().filter(c -> "WARNING".equals(c.status())).count();

    html.append("<div style=\"padding:24px 32px;border-bottom:1px solid #e0e0e0\">");
    html.append("<h2 style=\"margin:0 0 12px;font-size:18px;color:#333\">");
    html.append(esc(section.title())).append("</h2>");

    html.append("<div style=\"margin-bottom:16px;font-size:13px;color:#666\">");
    html.append("<span style=\"color:#2e7d32\">").append(passing).append(" passing</span>");
    html.append(" &middot; ");
    html.append("<span style=\"color:#c62828\">").append(failing).append(" failing</span>");
    html.append(" &middot; ");
    html.append("<span style=\"color:#ef6c00\">").append(warning).append(" warning</span>");
    html.append(" &middot; ").append(checks.size()).append(" total");
    html.append("</div>");
  }

  private void appendFooter(StringBuilder html, String template) {
    String accent = HEADER_COLORS.getOrDefault(template, "#1565c0");
    html.append("<div style=\"padding:16px 32px;font-size:11px;color:#999;text-align:center;");
    html.append("border-top:2px solid ").append(accent).append("\">");
    html.append("PUT Checks &mdash; Production Unified Toolkit &middot; Citi");
    html.append("</div></div>");
    html.append("<!--[if mso]></td></tr></table><![endif]-->");
  }

  private void appendStatusBar(
      StringBuilder html, long passing, long warning, long failing, long other, int total) {
    if (total == 0) {
      return;
    }
    int pPassing = barPct(passing, total);
    int pWarning = barPct(warning, total);
    int pFailing = barPct(failing, total);
    int pOther = barPct(other, total);
    int sum = pPassing + pWarning + pFailing + pOther;
    if (sum > 0 && sum != 100) {
      if (pPassing > 0) {
        pPassing += (100 - sum);
      } else if (pFailing > 0) {
        pFailing += (100 - sum);
      } else if (pWarning > 0) {
        pWarning += (100 - sum);
      } else {
        pOther += (100 - sum);
      }
    }

    html.append(
        "<table style=\"width:100%;border-collapse:collapse;table-layout:fixed\" role=\"img\"");
    html.append(" aria-label=\"Status distribution\"><tr style=\"height:28px\">");
    barCell(html, pPassing, "#2e7d32", true, pWarning == 0 && pFailing == 0 && pOther == 0);
    barCell(html, pWarning, "#ef6c00", false, pFailing == 0 && pOther == 0);
    barCell(html, pFailing, "#c62828", false, pOther == 0);
    barCell(html, pOther, "#bdbdbd", false, true);
    html.append("</tr></table>");
  }

  private void barCell(StringBuilder html, int pct, String color, boolean isFirst, boolean isLast) {
    if (pct == 0) {
      return;
    }
    String radius = "";
    if (isFirst && isLast) {
      radius = "border-radius:6px;";
    } else if (isFirst) {
      radius = "border-radius:6px 0 0 6px;";
    } else if (isLast) {
      radius = "border-radius:0 6px 6px 0;";
    }
    html.append("<td style=\"width:").append(pct).append("%;background:").append(color);
    html.append(";height:28px;padding:0;").append(radius).append("\"></td>");
  }

  private int barPct(long count, int total) {
    if (count == 0) {
      return 0;
    }
    return Math.max(1, (int) Math.round(count * 100.0 / total));
  }

  private void execRow(StringBuilder html, String label, long count, int total, String color) {
    int pct = total > 0 ? (int) (count * 100 / total) : 0;
    html.append("<tr>");
    html.append("<td style=\"padding:6px 0;font-weight:600;color:").append(color).append("\">");
    html.append(label).append("</td>");
    html.append("<td style=\"padding:6px 12px;text-align:right;font-size:20px;font-weight:700\">");
    html.append(count).append("</td>");
    html.append("<td style=\"padding:6px 0;color:#999;font-size:12px\">");
    html.append(pct).append("%</td>");
    html.append("</tr>");
  }

  private void trendRow(StringBuilder html, String status, long count, int total) {
    String color = STATUS_COLORS.getOrDefault(status, "#9e9e9e");
    String bg = STATUS_BG.getOrDefault(status, "#fafafa");
    int pct = total > 0 ? (int) (count * 100 / total) : 0;
    html.append("<tr><td style=\"padding:4px 8px;width:80px;font-size:12px;font-weight:600;color:");
    html.append(color).append("\">").append(status).append("</td>");
    html.append("<td style=\"padding:4px 8px\">");
    html.append("<div style=\"background:#eee;border-radius:4px;height:18px;overflow:hidden\">");
    if (pct > 0) {
      html.append("<div style=\"width:").append(pct).append("%;height:100%;background:");
      html.append(color).append(";border-radius:4px\"></div>");
    }
    html.append("</div></td>");
    html.append("<td style=\"padding:4px 8px;width:60px;text-align:right;font-size:13px;");
    html.append("font-weight:600\">").append(count).append("</td>");
    html.append("<td style=\"padding:4px 4px;width:40px;font-size:11px;color:#999\">");
    html.append(pct).append("%</td></tr>");
  }

  private void th(StringBuilder html, String text) {
    html.append("<th style=\"padding:8px 12px;border-bottom:2px solid #e0e0e0\">");
    html.append(text).append("</th>");
  }

  private void td(StringBuilder html, String text) {
    html.append("<td style=\"padding:8px 12px;border-bottom:1px solid #eee\">");
    html.append(text).append("</td>");
  }

  private void tdStatus(StringBuilder html, String status) {
    String color = STATUS_COLORS.getOrDefault(status, "#9e9e9e");
    html.append("<td style=\"padding:8px 12px;border-bottom:1px solid #eee\">");
    statusChip(html, status);
    html.append("</td>");
  }

  private void statusChip(StringBuilder html, String status) {
    String color = STATUS_COLORS.getOrDefault(status, "#9e9e9e");
    html.append("<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"");
    html.append(" style=\"display:inline-table\"><tr><td style=\"padding:2px 8px;");
    html.append("color:#fff;font-size:11px;font-weight:bold;background:");
    html.append(color).append(";font-family:Arial,Helvetica,sans-serif\">");
    html.append(esc(status)).append("</td></tr></table>");
  }

  private void noChecks(StringBuilder html) {
    html.append("<p style=\"color:#999;font-style:italic\">No checks matched.</p>");
  }

  private String templateLabel(String template) {
    return switch (template) {
      case "executive" -> "EXECUTIVE SUMMARY";
      case "detailed" -> "DETAILED REPORT";
      case "alert-digest" -> "ALERT DIGEST";
      case "trend-analysis" -> "TREND ANALYSIS";
      default -> "STATUS REPORT";
    };
  }

  private String truncate(String text, int max) {
    if (text.length() <= max) {
      return text;
    }
    return text.substring(0, max - 3) + "...";
  }

  private String esc(String text) {
    if (text == null) {
      return "";
    }
    return text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;");
  }
}

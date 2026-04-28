package com.citi.put.checks.reports.dto;

public record ReportRequest(
    String name,
    String description,
    String template,
    String sections,
    String schedule,
    String[] recipients,
    String selectedChecks) {}

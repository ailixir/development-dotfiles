package com.citi.put.checks.reports.section;

import com.fasterxml.jackson.annotation.JsonTypeName;
import java.util.List;

@JsonTypeName("manual")
public record ManualSection(String id, String title, List<String> checkIds)
    implements ReportSection {}

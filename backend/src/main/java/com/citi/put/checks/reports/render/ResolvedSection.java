package com.citi.put.checks.reports.render;

import com.citi.put.checks.checks.dto.CheckDto;
import java.util.List;

public record ResolvedSection(String title, List<CheckDto> checks) {}

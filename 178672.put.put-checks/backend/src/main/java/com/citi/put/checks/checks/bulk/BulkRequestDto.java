package com.citi.put.checks.checks.bulk;

import java.util.List;

public record BulkRequestDto(List<BulkOperation> operations) {}

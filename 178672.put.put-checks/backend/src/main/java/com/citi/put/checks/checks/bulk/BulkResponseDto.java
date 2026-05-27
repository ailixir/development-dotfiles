package com.citi.put.checks.checks.bulk;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;
import java.util.UUID;

public record BulkResponseDto(List<OpResult> results) {

  @JsonInclude(JsonInclude.Include.NON_NULL)
  public record OpResult(
      @JsonProperty("op_index") int opIndex, String status, UUID id, OpError error) {}

  public record OpError(String code, String message) {}
}

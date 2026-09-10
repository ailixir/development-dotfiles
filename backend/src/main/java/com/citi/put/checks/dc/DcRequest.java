package com.citi.put.checks.dc;

import java.util.Map;

/** Internal DC bridge request — must not leak outside {@code com.citi.put.checks.dc}. */
public record DcRequest(String path, String method, Map<String, String> headers, Object body) {

  public DcRequest {
    if (path == null || path.isBlank()) {
      throw new IllegalArgumentException("DC request path is required");
    }
    if (method == null || method.isBlank()) {
      method = "POST";
    }
    method = method.toUpperCase();
    if (headers == null) {
      headers = Map.of();
    }
  }
}

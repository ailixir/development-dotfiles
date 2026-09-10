package com.citi.put.checks.dc.mapping;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.SplunkConfiguration;
import com.citi.put.checks.dc.DcProperties;
import com.citi.put.checks.dc.DcRequest;
import com.citi.put.checks.dc.DcResponse;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;

/** Splunk-specific request shaping and reply-detail parsing for {@code DailyChecksAdapter}. */
public final class SplunkMapping {

  private SplunkMapping() {}

  public static DcRequest toRequest(Check check, DcProperties props) {
    SplunkConfiguration config = (SplunkConfiguration) check.getConfiguration();

    Map<String, Object> configuration = new LinkedHashMap<>();
    configuration.put("query", config.query());
    if (config.index() != null) {
      configuration.put("index", config.index());
    }
    configuration.put("timeRange", config.timeRange());
    configuration.put("expectedCount", config.expectedCount());
    configuration.put("countOperator", config.countOperator());

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("sourceType", "SPLUNK");
    body.put("checkId", check.getId() != null ? check.getId().toString() : null);
    body.put("csiId", check.getCsiId());
    body.put("name", check.getName());
    body.put("configuration", configuration);

    return new DcRequest(props.executePath(), "POST", Map.of(), body);
  }

  /** Prefer tool detail from envelope; fall back to outer comment. */
  public static String parseDetail(DcResponse response) {
    if (response == null) {
      return null;
    }
    JsonNode raw = response.rawBody();
    if (raw != null) {
      JsonNode detail = raw.get("detail");
      if (detail != null && !detail.isNull()) {
        if (detail.isTextual()) {
          return detail.asText();
        }
        JsonNode message = detail.get("message");
        if (message != null && message.isTextual()) {
          return message.asText();
        }
        JsonNode actualCount = detail.get("actualCount");
        if (actualCount != null && actualCount.isNumber()) {
          return "actualCount=" + actualCount.asInt();
        }
      }
      JsonNode actualCount = raw.get("actualCount");
      if (actualCount != null && actualCount.isNumber()) {
        String base = response.comment() != null ? response.comment() : "Splunk query completed";
        return base + " (actualCount=" + actualCount.asInt() + ")";
      }
    }
    return response.comment();
  }
}

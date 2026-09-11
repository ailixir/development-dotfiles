package com.citi.put.checks.dc.mapping;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.SplunkConfiguration;
import com.citi.put.checks.dc.DcProperties;
import com.citi.put.checks.dc.DcRequest;
import com.citi.put.checks.dc.DcResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SplunkMappingTest {

  private final DcProperties props =
      new DcProperties(
          true,
          "http://localhost:9091",
          "/api/v1/execute",
          new DcProperties.Auth("none", null, null, null, "X-Api-Key", null),
          new DcProperties.Timeout(3000, 60000));

  @Test
  void toRequestShapesSplunkPayload() {
    Check check =
        new Check(
            "Splunk errors",
            "SPLUNK",
            null,
            "CSI1",
            "CSI Name",
            new SplunkConfiguration(
                "SPLUNK", "search index=main | stats count", "main", "15m", 5, ">="),
            "Production",
            "user@citi.com");

    DcRequest request = SplunkMapping.toRequest(check, props);

    assertThat(request.method()).isEqualTo("POST");
    assertThat(request.path()).isEqualTo("/api/v1/execute");
    @SuppressWarnings("unchecked")
    Map<String, Object> body = (Map<String, Object>) request.body();
    assertThat(body.get("sourceType")).isEqualTo("SPLUNK");
    assertThat(body.get("csiId")).isEqualTo("CSI1");
    @SuppressWarnings("unchecked")
    Map<String, Object> configuration = (Map<String, Object>) body.get("configuration");
    assertThat(configuration.get("query")).isEqualTo("search index=main | stats count");
    assertThat(configuration.get("index")).isEqualTo("main");
    assertThat(configuration.get("expectedCount")).isEqualTo(5);
    assertThat(configuration.get("countOperator")).isEqualTo(">=");
  }

  @Test
  void parseDetailPrefersActualCount() throws Exception {
    ObjectMapper mapper = new ObjectMapper();
    ObjectNode root = mapper.createObjectNode();
    root.put("status", "SUCCESS");
    root.put("comment", "ok");
    root.put("actualCount", 3);

    String detail = SplunkMapping.parseDetail(new DcResponse(200, "SUCCESS", "ok", null, root));
    assertThat(detail).contains("actualCount=3");
  }
}

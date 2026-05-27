package com.citi.put.checks.checks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.checks.dto.CheckRequest;
import com.citi.put.checks.checks.model.HttpConfiguration;
import com.citi.put.checks.checks.model.TcpConfiguration;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.InvalidTypeIdException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CheckRequestDeserializationTest {

  private ObjectMapper mapper;

  @BeforeEach
  void setUp() {
    mapper = new ObjectMapper();
  }

  @Test
  void deserializesHttpCheckRequest() throws Exception {
    String json =
        """
        {
          "name": "Health Check",
          "description": "Monitors actuator health",
          "csiId": "178672",
          "environment": "Production",
          "configuration": {
            "type": "HTTP",
            "method": "GET",
            "url": "http://localhost:8080/actuator/health",
            "headers": null,
            "body": null,
            "expectedStatusCode": 200,
            "followRedirects": true,
            "timeoutMs": 5000,
            "verifyTls": true
          }
        }
        """;

    CheckRequest request = mapper.readValue(json, CheckRequest.class);
    assertThat(request.name()).isEqualTo("Health Check");
    assertThat(request.description()).isEqualTo("Monitors actuator health");
    assertThat(request.csiId()).isEqualTo("178672");
    assertThat(request.environment()).isEqualTo("Production");
    assertThat(request.configuration()).isInstanceOf(HttpConfiguration.class);

    HttpConfiguration http = (HttpConfiguration) request.configuration();
    assertThat(http.type()).isEqualTo("HTTP");
    assertThat(http.method()).isEqualTo("GET");
    assertThat(http.url()).isEqualTo("http://localhost:8080/actuator/health");
    assertThat(http.expectedStatusCode()).isEqualTo(200);
    assertThat(http.timeoutMs()).isEqualTo(5000);
    assertThat(http.verifyTls()).isTrue();
    assertThat(http.followRedirects()).isTrue();
  }

  @Test
  void deserializesHttpWithDefaults() throws Exception {
    String json =
        """
        {
          "name": "Minimal HTTP",
          "description": "",
          "csiId": "178672",
          "environment": "Production",
          "configuration": {
            "type": "HTTP",
            "method": "GET",
            "url": "http://app.internal.citi.com"
          }
        }
        """;

    CheckRequest request = mapper.readValue(json, CheckRequest.class);
    HttpConfiguration http = (HttpConfiguration) request.configuration();
    assertThat(http.expectedStatusCode()).isEqualTo(200);
    assertThat(http.timeoutMs()).isEqualTo(5000);
    assertThat(http.verifyTls()).isTrue();
    assertThat(http.followRedirects()).isTrue();
  }

  @Test
  void deserializesTcpCheckRequest() throws Exception {
    String json =
        """
        {
          "name": "DB Port Check",
          "description": "Check PostgreSQL",
          "csiId": "285614",
          "environment": "Production",
          "configuration": {
            "type": "TCP",
            "host": "db.internal.citi.com",
            "port": 5432,
            "timeoutMs": 10000
          }
        }
        """;

    CheckRequest request = mapper.readValue(json, CheckRequest.class);
    assertThat(request.configuration()).isInstanceOf(TcpConfiguration.class);

    TcpConfiguration tcp = (TcpConfiguration) request.configuration();
    assertThat(tcp.type()).isEqualTo("TCP");
    assertThat(tcp.host()).isEqualTo("db.internal.citi.com");
    assertThat(tcp.port()).isEqualTo(5432);
    assertThat(tcp.timeoutMs()).isEqualTo(10000);
  }

  @Test
  void rejectsMissingTypeDiscriminator() {
    String json =
        """
        {
          "name": "No Type",
          "description": "",
          "csiId": "178672",
          "environment": "Production",
          "configuration": {
            "method": "GET",
            "url": "http://app.internal.citi.com"
          }
        }
        """;

    assertThatThrownBy(() -> mapper.readValue(json, CheckRequest.class))
        .isInstanceOf(InvalidTypeIdException.class)
        .hasMessageContaining("type");
  }

  @Test
  void rejectsFrontendFieldNamesWithoutTypeDiscriminator() {
    String json =
        """
        {
          "name": "Frontend Format",
          "description": "",
          "csiId": "178672",
          "environment": "Production",
          "configuration": {
            "endpoint": "http://app.internal.citi.com",
            "expectedStatus": 200,
            "timeout": 30
          }
        }
        """;

    assertThatThrownBy(() -> mapper.readValue(json, CheckRequest.class))
        .isInstanceOf(InvalidTypeIdException.class)
        .hasMessageContaining("type");
  }

  @Test
  void exactFrontendMappedPayload() throws Exception {
    // This is the exact JSON that toBackendCheckRequest() in checksApi.ts produces
    // from the CreateCheckPage form data
    String json =
        """
        {
          "name": "My HTTP Check",
          "description": "Monitors health endpoint",
          "csiId": "178672",
          "environment": "Production",
          "configuration": {
            "type": "HTTP",
            "method": "GET",
            "url": "https://api.internal.citi.com/health",
            "headers": {"X-Api-Key": "test"},
            "body": null,
            "expectedStatusCode": 200,
            "followRedirects": true,
            "timeoutMs": 30000,
            "verifyTls": true
          }
        }
        """;

    CheckRequest request = mapper.readValue(json, CheckRequest.class);
    assertThat(request.name()).isEqualTo("My HTTP Check");
    HttpConfiguration http = (HttpConfiguration) request.configuration();
    assertThat(http.url()).isEqualTo("https://api.internal.citi.com/health");
    assertThat(http.timeoutMs()).isEqualTo(30000);
    assertThat(http.headers()).containsEntry("X-Api-Key", "test");
  }
}

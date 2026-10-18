package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.guided.session.GuidedSessionConfiguration.GuidedTlsConnector.ConnectorScope;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * STUDIO-OBS-009 pre-F-merge ruling item 4(i)a: the guided TLS connector serves only {@code
 * /internal/v2/studio/guided-sessions/**}; the plain port is never touched. The real-context proof
 * is {@code RunnerTlsClientCertIT.GuidedConnectorInARealContext}; this class pins the path rules.
 */
class GuidedConnectorScopeTest {
  private static final int CONNECTOR = 9443;
  private static final int PLAIN = 8080;
  private static final String GUIDED = "/internal/v2/studio/guided-sessions/s-1/claim";

  private final AtomicInteger reached = new AtomicInteger();

  private ConnectorScope scope(int connectorPort) {
    ConnectorScope scope = new ConnectorScope();
    scope.attach(() -> connectorPort);
    return scope;
  }

  private MockHttpServletResponse call(ConnectorScope scope, int port, String uri, String servlet)
      throws Exception {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", uri);
    request.setLocalPort(port);
    request.setServletPath(servlet);
    MockHttpServletResponse response = new MockHttpServletResponse();
    scope.doFilter(
        request,
        response,
        (req, res) -> {
          reached.incrementAndGet();
        });
    return response;
  }

  private void assertRefused(MockHttpServletResponse response) {
    assertThat(response.getStatus()).isEqualTo(404);
    assertThat(response.getContentAsByteArray()).isEmpty();
    assertThat(response.getHeader("WWW-Authenticate")).isNull();
    assertThat(reached).hasValue(0);
  }

  @Test
  void aGuidedPathOnTheConnectorIsServed() throws Exception {
    MockHttpServletResponse response = call(scope(CONNECTOR), CONNECTOR, GUIDED, GUIDED);

    assertThat(reached).hasValue(1);
    assertThat(response.getStatus()).isEqualTo(200);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/actuator/health",
        "/api/v1/studio/sessions",
        "/",
        "/internal/v2/studio/guided-sessions",
        "/internal/v2/studio/guided-sessionsX/s-1/claim",
        "/internal/v2/studio/other/s-1",
        "/internal/v2/studio",
        "/error"
      })
  void anyOtherPathOnTheConnectorIsRefusedWithAnEmpty404(String path) throws Exception {
    assertRefused(call(scope(CONNECTOR), CONNECTOR, path, path));
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "/internal/v2/studio/guided-sessions/x/../../../../api/v1/studio/sessions",
        "/internal/v2/studio/guided-sessions/x/%2e%2e/%2e%2e/api",
        "/internal/v2/studio/guided-sessions/x/%2E%2E/api",
        "/internal/v2/studio/guided-sessions/x/..%2F..%2Fapi",
        "/internal/v2/studio/guided-sessions/x/..%2f..%2fapi",
        "/internal/v2/studio/guided-sessions/x/..%5Capi",
        "/internal/v2/studio/guided-sessions/x/..%5capi",
        "/internal/v2/studio/guided-sessions/x;jsessionid=1/claim"
      })
  void aGuidedPrefixCarryingATraversalOrAnEncodedSeparatorIsRefused(String raw) throws Exception {
    // The container-resolved path alone would pass: only the raw request URI shows the trick.
    assertRefused(call(scope(CONNECTOR), CONNECTOR, raw, GUIDED));
  }

  @Test
  void aGuidedRawUriWhoseResolvedServletPathIsElsewhereIsRefused() throws Exception {
    assertRefused(call(scope(CONNECTOR), CONNECTOR, GUIDED, "/api/v1/studio/sessions"));
  }

  @Test
  void thePlainPortIsNeverTouched() throws Exception {
    MockHttpServletResponse publicRoute =
        call(scope(CONNECTOR), PLAIN, "/api/v1/studio/sessions", "/api/v1/studio/sessions");
    MockHttpServletResponse guided = call(scope(CONNECTOR), PLAIN, GUIDED, GUIDED);

    assertThat(reached).hasValue(2);
    assertThat(publicRoute.getStatus()).isEqualTo(200);
    assertThat(guided.getStatus()).isEqualTo(200);
  }

  @Test
  void withNoConnectorAttachedEveryRequestPasses() throws Exception {
    ConnectorScope inert = new ConnectorScope();

    call(inert, PLAIN, "/actuator/health", "/actuator/health");
    call(inert, CONNECTOR, "/actuator/health", "/actuator/health");

    assertThat(reached).hasValue(2);
  }

  @ParameterizedTest
  @ValueSource(ints = {0, -1})
  void aConnectorThatHasNoPositiveLocalPortRefusesEverything(int unbound) throws Exception {
    ConnectorScope scope = scope(unbound);

    assertRefused(call(scope, CONNECTOR, GUIDED, GUIDED));
    assertRefused(call(scope, PLAIN, "/actuator/health", "/actuator/health"));
    assertRefused(call(scope, unbound, GUIDED, GUIDED));
  }

  @Test
  void theConnectorsPortIsReadPerRequestSoAConnectorBoundLaterIsGuarded() throws Exception {
    AtomicInteger bound = new AtomicInteger(-1);
    ConnectorScope scope = new ConnectorScope();
    scope.attach(bound::get);

    assertRefused(call(scope, CONNECTOR, "/actuator/health", "/actuator/health"));
    bound.set(CONNECTOR);
    call(scope, PLAIN, "/actuator/health", "/actuator/health");
    assertThat(reached).hasValue(1);
    MockHttpServletResponse refused =
        call(scope, CONNECTOR, "/actuator/health", "/actuator/health");
    assertThat(refused.getStatus()).isEqualTo(404);
    assertThat(reached).hasValue(1);
  }
}

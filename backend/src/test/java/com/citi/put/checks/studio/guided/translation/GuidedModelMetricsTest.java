package com.citi.put.checks.studio.guided.translation;

import static com.citi.put.checks.studio.guided.translation.GuidedGatewayPrivacyTest.JSON;
import static com.citi.put.checks.studio.guided.translation.GuidedGatewayPrivacyTest.answer;
import static com.citi.put.checks.studio.guided.translation.GuidedGatewayPrivacyTest.budget;
import static com.citi.put.checks.studio.guided.translation.GuidedGatewayPrivacyTest.open;
import static com.citi.put.checks.studio.guided.translation.GuidedGatewayPrivacyTest.projection;
import static com.citi.put.checks.studio.guided.translation.GuidedGatewayPrivacyTest.properties;
import static com.citi.put.checks.studio.guided.translation.GuidedGatewayPrivacyTest.provider;
import static com.citi.put.checks.studio.guided.translation.GuidedGatewayPrivacyTest.request;
import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** The model-call timer and the cached-token summary, recorded through the real SDK path. */
class GuidedModelMetricsTest {
  private final WireMockServer server =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());
  private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

  GuidedModelMetricsTest() {
    server.start();
  }

  @AfterEach
  void stop() {
    server.stop();
  }

  private GenAiGuidedLlmGatewayClient client(GenAiGatewayTransport transport) {
    return new GenAiGuidedLlmGatewayClient(
        transport, new GuidedResponseParser(new GuidedContracts()), registry);
  }

  private io.micrometer.core.instrument.Timer timer(String kind, String outcome) {
    return registry
        .find(GenAiGuidedLlmGatewayClient.CALL_TIMER)
        .tag("kind", kind)
        .tag("outcome", outcome)
        .timer();
  }

  private static String withCached(String provider, Integer cached) throws Exception {
    ObjectNode envelope = (ObjectNode) JSON.readTree(provider);
    if (cached != null) {
      ((ObjectNode) envelope.path("usageMetadata")).put("cachedContentTokenCount", cached);
    }
    return envelope.toString();
  }

  @Test
  void oneCallRecordsTheTimerByKindAndOutcomeAndTheCachedTokens() throws Exception {
    var request = request(GuidedModelRequest.Kind.VERIFY_STEP, projection(), 1);
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(withCached(provider(answer(request).toString()), 9))));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      assertThat(client(transport).propose(request, budget(Duration.ofSeconds(5))).code())
          .isEqualTo(GuidedModelResponse.Code.OK);
    }
    var timer = timer("VERIFY_STEP", "ok");
    assertThat(timer).isNotNull();
    assertThat(timer.count()).isEqualTo(1);
    assertThat(timer.totalTime(TimeUnit.NANOSECONDS)).isPositive();
    assertThat(registry.find(GenAiGuidedLlmGatewayClient.CALL_TIMER).timers()).hasSize(1);
    var cached = registry.find(GenAiGuidedLlmGatewayClient.CACHED_TOKENS).summary();
    assertThat(cached.count()).isEqualTo(1);
    assertThat(cached.totalAmount()).isEqualTo(9.0);
  }

  @Test
  void usageWithoutACachedCountReadsAsZeroCachedTokens() throws Exception {
    var request = request(GuidedModelRequest.Kind.SOURCE_PLAN, projection(), 1);
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(okJson(withCached(provider(answer(request).toString()), null))));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      client(transport).propose(request, budget(Duration.ofSeconds(5)));
    }
    assertThat(timer("SOURCE_PLAN", "ok").count()).isEqualTo(1);
    var cached = registry.find(GenAiGuidedLlmGatewayClient.CACHED_TOKENS).summary();
    assertThat(cached.count()).isEqualTo(1);
    assertThat(cached.totalAmount()).isZero();
  }

  @Test
  void aRefusedCallIsTaggedRefusedAndRecordsNoCachedTokens() throws Exception {
    var request = request(GuidedModelRequest.Kind.NEXT_ACTION, projection(), 1);
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(aResponse().withStatus(403).withBody("{}")));
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536))) {
      assertThat(client(transport).propose(request, budget(Duration.ofSeconds(5))).reason())
          .isEqualTo(GuidedModelResponse.Reason.TRANSPORT_HTTP_401_403);
    }
    assertThat(timer("NEXT_ACTION", "refused").count()).isEqualTo(1);
    assertThat(registry.find(GenAiGuidedLlmGatewayClient.CACHED_TOKENS).summary().count()).isZero();
  }

  @Test
  void aBusyCallIsTimedFromEntryAndTaggedBusy() throws Exception {
    var request = request(GuidedModelRequest.Kind.VERIFY_STEP, projection(), 1);
    try (var transport = new GenAiGatewayTransport(properties(server.baseUrl(), 65536, 65536));
        var held = transport.tryAcquire(open())) {
      assertThat(held).isNotNull();
      client(transport).propose(request, budget(Duration.ofMillis(300)));
    }
    var timer = timer("VERIFY_STEP", "busy");
    assertThat(timer.count()).isEqualTo(1);
    assertThat(timer.totalTime(TimeUnit.MILLISECONDS)).isGreaterThanOrEqualTo(200);
  }
}

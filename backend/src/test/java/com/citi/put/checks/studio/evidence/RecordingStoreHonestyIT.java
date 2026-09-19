package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.ExecutionSnapshotMapper;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Studio v1 gaps: the deployment default, {@code provider: none}, reaches the snapshot the MFE
 * reads. Every other test context runs with {@code in-memory} (build.gradle.kts), so this one puts
 * the default back explicitly.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class RecordingStoreHonestyIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired ExecutionSnapshotMapper mapper;
  @Autowired VideoStoreProperties properties;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
    registry.add("studio.execution.video-store.provider", () -> VideoStoreProperties.PROVIDER_NONE);
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @Test
  void withNoReadableStoreTheSnapshotOffersNoPlayer() {
    assertThat(properties.servesRecordings()).isFalse();
    UITestExecution execution =
        new UITestExecution(UUID.randomUUID(), "PASSED", Instant.now().minusSeconds(60), "60400");
    execution.setEndedAt(Instant.now().minusSeconds(30));
    execution.setDurationMs(30_000);
    execution.setVideoStatus(VideoEvidence.AVAILABLE);
    execution.setVideoExpiresAt(Instant.now().plusSeconds(3600));

    ExecutionSnapshotDto snapshot = mapper.toSnapshot(execution);

    assertThat(snapshot.video().status()).isEqualTo(VideoEvidence.UNAVAILABLE);
    assertThat(snapshot.video().error()).startsWith("Recording unavailable");
    assertThat(snapshot.videoPath()).isNull();
  }
}

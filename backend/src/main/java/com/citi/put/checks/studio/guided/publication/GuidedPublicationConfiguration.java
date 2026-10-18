package com.citi.put.checks.studio.guided.publication;

import com.citi.put.checks.security.CoreServiceClient;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.dispatch.StudioRunnerProperties;
import com.citi.put.checks.studio.dispatch.StudioRunnerTls;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedPublicPresentationProjector;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;

/** Real publication composition; disabled publication leaves existing guided starts untouched. */
@Configuration
@Profile("!worker")
@EnableConfigurationProperties({GuidedPublicationProperties.class, ObservedReplayProperties.class})
public class GuidedPublicationConfiguration {
  @Bean
  GuidedPublicationBaseRepository publicationBases(JdbcTemplate jdbc, GuidedContracts contracts) {
    return new GuidedPublicationBaseRepository(jdbc, contracts);
  }

  @Bean
  GuidedPublicationEvidenceRepository publicationEvidence(
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      org.springframework.beans.factory.ObjectProvider<ObservedRevisionVerifier> verifier) {
    var evidence = new GuidedPublicationEvidenceRepository(jdbc, contracts);
    evidence.installRevisionVerifier(id -> verifier.getObject().verify(id));
    return evidence;
  }

  @Bean
  GuidedPublicationAuthorization publicationAuthorization(
      CoreServiceClient core,
      CsiOwnershipEvaluator ownership,
      GuidedPublicationProperties properties) {
    return new GuidedPublicationAuthorization(core, ownership, Clock.systemUTC(), properties);
  }

  @Bean
  ObservedValidationClient observedValidationClient(
      StudioRunnerProperties runner,
      GuidedContracts contracts,
      GuidedPublicationProperties properties,
      StudioRunnerTls tls) {
    HttpClient client =
        tls.configure(HttpClient.newBuilder())
            .followRedirects(HttpClient.Redirect.NEVER)
            .connectTimeout(
                runner.connectTimeout() == null ? Duration.ofSeconds(2) : runner.connectTimeout())
            .version(HttpClient.Version.HTTP_1_1)
            .build();
    return new ObservedValidationClient(
        runner.isConfigured() ? URI.create(runner.baseUrl()) : null,
        client,
        runner::serviceIdentityToken,
        contracts,
        properties);
  }

  @Bean
  GuidedPlanPublisher guidedPlanPublisher(
      GuidedSessionRepository sessions,
      GuidedSessionService lifecycle,
      GuidedPublicationBaseRepository bases,
      GuidedPublicationEvidenceRepository evidence,
      GuidedPublicationRepository publications,
      GuidedContracts contracts,
      ObservedReplayPins pins,
      ObservedValidationClient validator,
      GuidedPublicationAuthorization authorization,
      GuidedSessionAccess access,
      GuidedPublicationProperties properties,
      ObservedReplayProperties replay) {
    return new GuidedPlanPublisher(
        sessions,
        lifecycle,
        bases,
        evidence,
        publications,
        contracts,
        pins,
        validator,
        authorization,
        access,
        properties,
        replay,
        Clock.systemUTC());
  }

  @Bean
  GuidedPublicationResultProjector publicationResultProjector(
      GuidedPublicationBaseRepository bases,
      GuidedPublicationRepository publications,
      GuidedSessionRepository sessions,
      GuidedSessionService guided,
      GuidedPublicationAuthorization authorization,
      GuidedContracts contracts,
      com.citi.put.checks.studio.readiness.ExecutionReadinessService readiness,
      ObservedReplayProperties replay,
      GuidedPublicPresentationProjector presentation) {
    return new GuidedPublicationResultProjector(
        bases,
        publications,
        sessions,
        guided,
        authorization,
        contracts,
        readiness,
        replay,
        presentation);
  }

  @Bean
  SmartInitializingSingleton installPublicationEvidence(
      GuidedSessionService sessions,
      GuidedPublicationBaseRepository bases,
      GuidedPublicationEvidenceRepository evidence,
      GuidedPublicationProperties properties,
      ObservedReplayPins pins) {
    return () ->
        sessions.installPublication(
            new GuidedSessionService.PublicationLifecycle() {
              @Override
              public void started(JsonNode session, Instant now) {
                if (properties.enabled()) {
                  bases.capture(session, pins.requirements(session), now);
                }
              }

              @Override
              public void prepared(
                  GuidedSessionRepository.Session current,
                  JsonNode proposal,
                  JsonNode proof,
                  Instant now) {
                evidence.capturePreparation(current, proposal, proof, now);
              }

              @Override
              public void questioned(
                  GuidedSessionRepository.Session current, JsonNode capture, Instant now) {
                evidence.captureQuestion(current, capture, now);
              }

              @Override
              public void admitted(
                  JsonNode session, JsonNode action, JsonNode proposal, Instant now) {
                evidence.attachAdmission(session, action, proposal, now);
              }
            });
  }
}

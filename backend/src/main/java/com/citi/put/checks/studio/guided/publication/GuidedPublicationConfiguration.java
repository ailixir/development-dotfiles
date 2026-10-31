package com.citi.put.checks.studio.guided.publication;

import com.citi.put.checks.security.CoreServiceClient;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedPublicPresentationProjector;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.JsonNode;
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
  PublicationGrantAuthority publicationGrantAuthority(
      CoreServiceClient core,
      CsiOwnershipEvaluator ownership,
      GuidedPublicationProperties properties,
      JdbcTemplate jdbc) {
    return new PublicationGrantAuthority(core, ownership, new DatabaseClock(jdbc), properties);
  }

  @Bean
  LearnProofRepository learnProofs(JdbcTemplate jdbc) {
    return new LearnProofRepository(jdbc);
  }

  /**
   * The proof of every publication is accepted through the observed replay authorization; without
   * that bean acceptance would refuse every proof as {@code AUTHORIZATION_REQUIRED} on its first
   * use, so a missing one stops startup instead.
   */
  @Bean
  PublicationProofLauncher publicationProofLauncher(
      com.citi.put.checks.studio.dispatch.StudioAcceptanceService acceptance,
      LearnProofRepository proofs,
      ObservedReplayAuthorization replayAuthorization) {
    java.util.Objects.requireNonNull(replayAuthorization, "observed replay authorization");
    return new com.citi.put.checks.studio.dispatch.StudioPublicationProofLauncher(
        acceptance, proofs);
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
      com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient validator,
      com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization,
      GuidedSessionAccess access,
      GuidedPublicationProperties properties,
      ObservedReplayProperties replay,
      PublicationProofLauncher proofs,
      JdbcTemplate jdbc) {
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
        proofs,
        new DatabaseClock(jdbc));
  }

  @Bean
  GuidedPublicationResultProjector publicationResultProjector(
      GuidedPublicationBaseRepository bases,
      GuidedPublicationRepository publications,
      GuidedSessionRepository sessions,
      GuidedSessionService guided,
      com.citi.put.checks.studio.dispatch.DispatchAuthorization authorization,
      GuidedContracts contracts,
      com.citi.put.checks.studio.readiness.ExecutionReadinessService readiness,
      ObservedReplayProperties replay,
      GuidedPublicPresentationProjector presentation,
      LearnProofRepository proofs) {
    return new GuidedPublicationResultProjector(
        bases,
        publications,
        sessions,
        guided,
        authorization,
        contracts,
        readiness,
        replay,
        presentation,
        proofs);
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
              public void capturePreparationObservation(
                  GuidedSessionRepository.Session current,
                  JsonNode proposal,
                  JsonNode proof,
                  Instant now) {
                evidence.capturePreparationObservation(current, proposal, proof, now);
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
              public void admitted(
                  JsonNode session, JsonNode action, JsonNode proposal, Instant now) {
                evidence.attachAdmission(session, action, proposal, now);
              }
            });
  }
}

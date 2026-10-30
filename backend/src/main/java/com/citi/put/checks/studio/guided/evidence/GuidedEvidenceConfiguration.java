package com.citi.put.checks.studio.guided.evidence;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.evidence.VideoStoreProperties;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationResultProjector;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Wires the guided recording evidence (STUDIO-OBS-013): the V20 repository, the recording-aware
 * projection, the callback service, and the installation of the projection into the result
 * builders.
 *
 * <p>Both result builders receive the projection here: {@code GuidedSessionService.installEvidence}
 * (B14's S3 hunk) and the publication projector.
 */
@Configuration
@EnableConfigurationProperties(GuidedRecordingProperties.class)
public class GuidedEvidenceConfiguration {

  @Bean
  GuidedSessionEvidenceRepository guidedSessionEvidenceRepository(JdbcTemplate jdbc) {
    return new GuidedSessionEvidenceRepository(jdbc);
  }

  @Bean
  GuidedEvidenceProjection guidedEvidenceProjection(
      GuidedSessionEvidenceRepository repository,
      GuidedRecordingProperties properties,
      VideoStoreProperties store,
      GuidedContracts contracts) {
    return new RecordedGuidedEvidenceProjection(
        repository, properties, store.servesRecordings(), contracts);
  }

  /**
   * The route shares {@link GuidedMaterializationService#acceptedContextRevisions} with the
   * lifecycle route (STUDIO-OBS-009 AC-11 R1). The service is stateless, so it is built here the
   * way {@code GuidedSessionConfiguration} builds the session service's own: over the same {@code
   * JdbcTemplate} and contracts, with no second bean and no second copy of the pending query.
   */
  @Bean
  GuidedSessionEvidenceService guidedSessionEvidenceService(
      GuidedSessionRepository sessions,
      GuidedSessionEvidenceRepository evidence,
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      GuidedRecordingProperties properties,
      StudioExecutionProperties execution,
      com.citi.put.checks.studio.navigation.AllowedDomains domains) {
    return new GuidedSessionEvidenceService(
        sessions,
        evidence,
        new GuidedMaterializationService(jdbc, contracts, domains),
        contracts,
        properties,
        execution);
  }

  /**
   * Installs the one projection into both result builders: the session service's own {@code
   * result()} and the publication projector. After the S3 contract tightening a {@code null} video
   * is invalid, so a builder left on {@code NONE} fails {@code v3/result} validation.
   */
  @Bean
  SmartInitializingSingleton installGuidedEvidenceProjection(
      GuidedSessionService guided,
      ObjectProvider<GuidedPublicationResultProjector> projectors,
      GuidedEvidenceProjection projection) {
    return () -> {
      guided.installEvidence(projection);
      projectors.ifAvailable(projector -> projector.installEvidence(projection));
    };
  }
}

package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedOperationIdentity;
import com.citi.put.checks.studio.guided.translation.GuidedPressInheritance;
import com.citi.put.checks.studio.guided.translation.GuidedPressInheritanceTest;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

class GuidedGuardSourceAuthorityTest {
  private record Built(GuidedContracts c, ObjectNode manifest, ArrayNode history, ObjectNode raw) {}

  @Test
  void privateSourceCapabilityIsReverifiedBeforeFinalCommit() {
    var built = build(false);
    var c = built.c();
    ObjectNode manifest = built.manifest(), raw = built.raw();
    ArrayNode history = built.history();
    try (var pg = new PostgreSQLContainer<>("postgres:15-alpine")) {
      pg.start();
      var tx =
          new TransactionTemplate(
              new DataSourceTransactionManager(
                  new DriverManagerDataSource(
                      pg.getJdbcUrl(), pg.getUsername(), pg.getPassword())));
      verifyAll(tx, c, manifest, raw, history);
    }
  }

  /**
   * A site script may turn the filled search box (searchbox) into a combobox once it is used. The
   * press was admitted on that field (same-element press), so the public reconstruction at
   * publication must accept it too, or the learned session can never be finalized.
   */
  @Test
  void publicReconstructionAcceptsAScriptUpgradedSearchCombobox() {
    var built = build(true);
    var tx =
        new TransactionTemplate(
            new org.springframework.transaction.support.AbstractPlatformTransactionManager() {
              @Override
              protected Object doGetTransaction() {
                return new Object();
              }

              @Override
              protected void doBegin(Object transaction, TransactionDefinition definition) {}

              @Override
              protected void doCommit(DefaultTransactionStatus status) {}

              @Override
              protected void doRollback(DefaultTransactionStatus status) {}
            });
    String fillRole =
        built.history().get(0).path("observation").path("facts").path("e1").path("role").asText();
    String pressRole =
        built.history().get(1).path("observation").path("facts").path("e1").path("role").asText();
    assertThat(fillRole).isEqualTo("textbox");
    assertThat(pressRole).isEqualTo("combobox");
    verifyAll(tx, built.c(), built.manifest(), built.raw(), built.history());
  }

  private static Built build(boolean upgradePressTarget) {
    var c = new GuidedContracts();
    ObjectNode world = GuidedPressInheritanceTest.sourceWorld();
    if (upgradePressTarget) {
      ((ObjectNode) world.path("observation")).withObject("/facts/e1").put("role", "combobox");
    }
    ObjectNode manifest = (ObjectNode) world.path("manifest");
    ArrayNode history = (ArrayNode) world.path("history");
    ObjectNode prior = (ObjectNode) history.get(0), proposal = (ObjectNode) world.path("proposal");
    ((ObjectNode) prior.path("proof"))
        .put("preparationId", "prior-preparation")
        .putNull("pressInheritance");
    ObjectNode proof =
        ((ObjectNode) world.path("context"))
            .deepCopy()
            .put("preparationId", "press-preparation")
            .put("requestDigest", GuidedContracts.hash(proposal));
    proof.set("target", prior.path("proof").path("target"));
    proof.set(
        "pressInheritance",
        GuidedPressInheritance.derive(
            c,
            manifest,
            world.path("plan"),
            proposal,
            world.path("observation"),
            world.path("context"),
            history));
    ObjectNode ledger =
        c.object()
            .put("state", "SUCCEEDED")
            .put("dispatchCount", 1)
            .put("outcomeCode", "OK")
            .put("attemptOrdinal", 0)
            .put("requestDigest", GuidedContracts.hash(proposal))
            .put("operationHash", GuidedOperationIdentity.of(proposal, proof.path("target")));
    ledger.set("coordinate", proposal.path("coordinate"));
    ledger.putObject("admission").put("admissionId", "press-admission");
    ObjectNode current = history.addObject();
    current.set("ledger", ledger);
    current.set("proposal", proposal);
    current.set("proof", proof);
    current.set("observation", world.path("observation"));
    ObjectNode raw = c.object().put("sessionId", "source-authority-test");
    ObjectNode safe = manifest.deepCopy();
    safe.remove("configurationValues");
    raw.set("sourceManifest", safe);
    raw.set("translationPlan", world.path("plan"));
    ObjectNode identity =
        raw.putObject("snapshotEvidence").putObject("current").put("authoringIdentityVersion", 1);
    identity.set("authoring", manifest.path("authoringSnapshot"));
    identity.set("authoredDeclarations", manifest.path("authoredDeclarations"));
    ArrayNode actions = raw.putArray("actions"),
        associations = raw.putArray("admissionAssociations"),
        preparations = raw.putArray("preparations"),
        observations = raw.putArray("observations");
    for (var row : history) {
      actions.add(row.path("ledger"));
      String preparation = row.path("proof").path("preparationId").asText();
      associations
          .addObject()
          .put("admissionId", row.path("ledger").path("admission").path("admissionId").asText())
          .put("preparationId", preparation);
      ObjectNode prepared =
          preparations
              .addObject()
              .put("preparationId", preparation)
              .put("observationHash", GuidedContracts.hash(row.path("observation")));
      prepared.set("proposal", row.path("proposal"));
      prepared.set("proof", row.path("proof"));
      observations
          .addObject()
          .put("observationHash", GuidedContracts.hash(row.path("observation")))
          .set("observation", row.path("observation"));
    }
    return new Built(c, manifest, history, raw);
  }

  private static void verifyAll(
      TransactionTemplate tx,
      GuidedContracts c,
      ObjectNode manifest,
      ObjectNode raw,
      ArrayNode history) {
    {
      var capability = tx.execute(status -> GuidedGuardSourceAuthority.verify(c, manifest, raw));
      assertThat(capability.requireFor(raw)).hasSize(1);
      assertThat(
              capability
                  .requireFor(raw)
                  .get(0)
                  .path("predecessorGrounding")
                  .path("source")
                  .path("kind")
                  .asText())
          .isEqualTo("SAVED_INPUT");
      assertThat(capability.toString()).doesNotContain("Search receiving area");
      ObjectNode basis =
          raw.deepCopy()
              .put("sourceManifestHash", GuidedContracts.hash(raw.path("sourceManifest")));
      basis.set("guardAuthorizations", capability.requireFor(raw));
      basis.putNull("incrementalEvidence");
      for (var step : manifest.path("sourceSteps")) {
        basis
            .withArray("sourceSteps")
            .addObject()
            .put("stepId", step.path("stepId").asText())
            .put("source", step.path("text").asText());
      }
      var normalizedActions = basis.putArray("actions");
      for (var row : history) {
        var normalized =
            normalizedActions
                .addObject()
                .put("preparationId", row.path("proof").path("preparationId").asText());
        normalized.set("ledger", row.path("ledger"));
      }
      GuidedGuardSourceAuthority.validatePublic(c, basis);
      ObjectNode wrongReference = basis.deepCopy();
      ((ObjectNode)
              wrongReference
                  .path("guardAuthorizations")
                  .get(0)
                  .path("predecessorGrounding")
                  .path("source"))
          .put("stepId", "00000000-0000-4000-8000-000000000002");
      assertThatThrownBy(() -> GuidedGuardSourceAuthority.validatePublic(c, wrongReference))
          .hasMessage("EVIDENCE_MISMATCH");
      assertThat(new PublicationContracts.Evidence(raw).sourceAuthority()).isNull();
      ObjectNode forged = raw.deepCopy().put("sessionId", "another-owner");
      assertThatThrownBy(() -> capability.requireFor(forged)).hasMessage("EVIDENCE_MISMATCH");
      ObjectNode changed = manifest.deepCopy();
      ((ObjectNode) changed.path("configurationValues").get(0))
          .put("value", "another Search receiving area");
      // Same visible label remains present, but the existing frozen declaration identity changed.
      assertThatThrownBy(
              () -> tx.execute(status -> GuidedGuardSourceAuthority.verify(c, changed, raw)))
          .hasMessage("EVIDENCE_MISMATCH");
      ObjectNode noMembership = manifest.deepCopy();
      ((ObjectNode) noMembership.path("configurationValues").get(0))
          .put("value", "different destination");
      assertThatThrownBy(
              () -> tx.execute(status -> GuidedGuardSourceAuthority.verify(c, noMembership, raw)))
          .hasMessage("EVIDENCE_MISMATCH");
      var finalCapability =
          tx.execute(status -> GuidedGuardSourceAuthority.verify(c, manifest, raw));
      assertThat(finalCapability.requireFor(raw)).isEqualTo(capability.requireFor(raw));
    }
  }
}

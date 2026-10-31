package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class GuidedActionLedgerTest {
  private final GuidedContracts contracts = new GuidedContracts();
  private final GuidedActionLedger ledger = new GuidedActionLedger(contracts);

  private ObjectNode stored() throws Exception {
    return (ObjectNode)
        contracts
            .parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents")
            .path("ledger")
            .deepCopy();
  }

  @ParameterizedTest
  @ValueSource(strings = {"TARGET_CHANGED", "POLICY_DENIED", "TIMEOUT", "CANCELLED", "ACK_LOST"})
  void actualUncertainEffectsKeepTheirBoundedCauseWithoutClaimingNoEffect(String cause)
      throws Exception {
    ObjectNode original = stored(),
        report =
            original
                .deepCopy()
                .put("state", "UNKNOWN_OUTCOME")
                .put("dispatchCount", 1)
                .put("outcomeCode", cause);
    assertThatCode(() -> ledger.verifyReport(original, report)).doesNotThrowAnyException();
  }

  @ParameterizedTest
  @ValueSource(strings = {"OK", "PENDING", "ASSERTION_FAILED"})
  void uncertaintyCannotForgeSuccessOrLeaveAnUnconsumedDecision(String cause) throws Exception {
    ObjectNode original = stored(),
        report =
            original
                .deepCopy()
                .put("state", "UNKNOWN_OUTCOME")
                .put("dispatchCount", 1)
                .put("outcomeCode", cause);
    assertThatThrownBy(() -> ledger.verifyReport(original, report)).hasMessage("INVALID_CONTRACT");
  }

  @Test
  void uncertainReportStillRequiresConsumedCountNullAssertionAndOriginalOwner() throws Exception {
    ObjectNode original = stored(),
        report =
            original
                .deepCopy()
                .put("state", "UNKNOWN_OUTCOME")
                .put("dispatchCount", 1)
                .put("outcomeCode", "TARGET_CHANGED");
    var noConsume = report.deepCopy().put("dispatchCount", 0);
    assertThatThrownBy(() -> ledger.verifyReport(original, noConsume))
        .hasMessage("INVALID_CONTRACT");
    var forgedAssertion = report.deepCopy().put("forgedField", true);
    assertThatThrownBy(() -> ledger.verifyReport(original, forgedAssertion))
        .hasMessage("INVALID_CONTRACT");
    var staleOwner = report.deepCopy().put("ownerFence", original.path("ownerFence").asLong() + 1);
    assertThatThrownBy(() -> ledger.verifyReport(original, staleOwner))
        .hasMessage("IDEMPOTENCY_CONFLICT");
  }

  private ObjectNode uncertainReport(ObjectNode original) {
    return original
        .deepCopy()
        .put("state", "UNKNOWN_OUTCOME")
        .put("dispatchCount", 1)
        .put("outcomeCode", "TARGET_CHANGED");
  }

  @Test
  void outcomeRequestOwnershipCopiesContainersAndRefusesOpaqueOrCustomNodes() {
    ObjectNode request = contracts.object();
    var nested = request.putObject("nested");
    nested.putArray("items").addObject().put("fixed", "first");
    ObjectNode owned = ledger.copyOutcomeRequest(request);
    assertThat(owned != null && owned != request).isTrue();
    assertThat(owned.path("nested") != nested).isTrue();
    assertThat(owned.path("nested").path("items") != nested.path("items")).isTrue();
    assertThat(owned.path("nested").path("items").get(0) != nested.path("items").get(0)).isTrue();
    ((ObjectNode) nested.path("items").get(0)).put("fixed", "changed");
    assertThat(owned.path("nested").path("items").get(0).path("fixed").asText()).isEqualTo("first");
    assertThat(ledger.copyOutcomeRequest(request.putPOJO("opaque", new Object()))).isNull();
    assertThat(ledger.copyOutcomeRequest(contracts.object().put("binary", new byte[] {1})))
        .isNull();
    ObjectNode custom =
        new ObjectNode(com.fasterxml.jackson.databind.node.JsonNodeFactory.instance) {};
    assertThat(ledger.copyOutcomeRequest(custom)).isNull();
    assertThat(ledger.copyOutcomeRequest(null)).isNull();
  }

  @Test
  void matchingPreparationRetainsOriginalStoredLedgerChecksAndPublicValidation() throws Exception {
    GuidedContracts observed = org.mockito.Mockito.spy(new GuidedContracts());
    GuidedActionLedger current = new GuidedActionLedger(observed);
    ObjectNode original = stored(), report = uncertainReport(original);
    var prepared = current.prepareReport(report);
    assertThat(prepared).isNotNull();
    org.mockito.Mockito.clearInvocations(observed);
    assertThatCode(() -> current.verifyReport(original, report, prepared))
        .doesNotThrowAnyException();
    org.mockito.Mockito.verify(observed, org.mockito.Mockito.never())
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    ObjectNode wrongOwner =
        original.deepCopy().put("ownerFence", original.path("ownerFence").asLong() + 1);
    assertThatThrownBy(() -> current.verifyReport(wrongOwner, report, prepared))
        .hasMessage("IDEMPOTENCY_CONFLICT");
    org.mockito.Mockito.clearInvocations(observed);
    assertThatCode(() -> current.verifyReport(original, report)).doesNotThrowAnyException();
    org.mockito.Mockito.verify(observed).validate("ledger", report);
  }

  @Test
  void foreignChangedReorderedAndUnsupportedReportsUseOriginalSchemaValidation() throws Exception {
    GuidedContracts observed = org.mockito.Mockito.spy(new GuidedContracts());
    GuidedActionLedger current = new GuidedActionLedger(observed);
    ObjectNode original = stored(), report = uncertainReport(original);
    var foreign = new GuidedActionLedger(observed).prepareReport(report);
    org.mockito.Mockito.clearInvocations(observed);
    current.verifyReport(original, report, foreign);
    org.mockito.Mockito.verify(observed).validate("ledger", report);
    var prepared = current.prepareReport(report);
    ObjectNode identicalCopy = report.deepCopy();
    org.mockito.Mockito.clearInvocations(observed);
    current.verifyReport(original, identicalCopy, prepared);
    org.mockito.Mockito.verify(observed).validate("ledger", identicalCopy);
    var sessionId = report.remove("sessionId");
    report.set("sessionId", sessionId);
    org.mockito.Mockito.clearInvocations(observed);
    current.verifyReport(original, report, prepared);
    org.mockito.Mockito.verify(observed).validate("ledger", report);
    prepared = current.prepareReport(report);
    report.put("dispatchCount", 0);
    var beforeChange = prepared;
    org.mockito.Mockito.clearInvocations(observed);
    assertThatThrownBy(() -> current.verifyReport(original, report, beforeChange))
        .hasMessage("INVALID_CONTRACT");
    org.mockito.Mockito.verify(observed).validate("ledger", report);
    ObjectNode unsupported = uncertainReport(original).putPOJO("opaque", new Object());
    assertThat(current.prepareReport(unsupported)).isNull();
  }

  @Test
  void fixedTypedPreparationIsDeferredWithExactStatusAndNoRawCause() throws Exception {
    GuidedContracts controlled = org.mockito.Mockito.spy(new GuidedContracts());
    GuidedActionLedger current = new GuidedActionLedger(controlled);
    ObjectNode original = stored(), report = uncertainReport(original);
    for (var pair :
        java.util.List.of(
            new GuidedSessionException("INVALID_CONTRACT", 422),
            new GuidedSessionException("RUNTIME_INCOMPATIBLE", 409))) {
      org.mockito.Mockito.doThrow(pair)
          .when(controlled)
          .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
      var prepared = current.prepareReport(report);
      assertThat(prepared).isNotNull();
      assertThatThrownBy(() -> current.verifyReport(original, report, prepared))
          .isInstanceOfSatisfying(
              GuidedSessionException.class,
              failure -> {
                assertThat(failure.getMessage()).isEqualTo(pair.getMessage());
                assertThat(failure.status()).isEqualTo(pair.status());
                assertThat(failure.getCause()).isNull();
                assertThat(failure == pair).isFalse();
              });
    }
    org.mockito.Mockito.doThrow(new GuidedSessionException("INVALID_CONTRACT", 409))
        .when(controlled)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    assertThat(current.prepareReport(report)).isNull();
  }

  @Test
  void unexpectedPreparationFallsBackAndFatalPreparationRemainsFatal() throws Exception {
    GuidedContracts controlled = org.mockito.Mockito.spy(new GuidedContracts());
    GuidedActionLedger current = new GuidedActionLedger(controlled);
    ObjectNode original = stored(), report = uncertainReport(original);
    RuntimeException unexpected = new IllegalStateException("fixed-unavailable-control");
    org.mockito.Mockito.doThrow(unexpected)
        .when(controlled)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    assertThat(current.prepareReport(report)).isNull();
    assertThatThrownBy(
            () -> current.verifyReport(original, report, (GuidedActionLedger.PreparedReport) null))
        .isSameAs(unexpected);
    Error fatal = new AssertionError("fixed-fatal-control");
    org.mockito.Mockito.doThrow(fatal)
        .when(controlled)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    assertThatThrownBy(() -> current.prepareReport(report)).isSameAs(fatal);
  }

  @Test
  void actionSaveReusesOnlySuccessfulSameContractAndExactOwnedReportProof() throws Exception {
    GuidedContracts checked = org.mockito.Mockito.spy(new GuidedContracts());
    GuidedActionLedger selected = new GuidedActionLedger(checked);
    var jdbc = org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
    var repository =
        org.mockito.Mockito.spy(
            new GuidedSessionRepository(
                jdbc, new org.springframework.transaction.support.TransactionTemplate(), checked));
    ObjectNode report = uncertainReport(stored());
    var prepared = selected.prepareReport(report);
    org.mockito.Mockito.clearInvocations(checked);
    repository.saveAction(report, prepared);
    org.mockito.Mockito.verify(checked, org.mockito.Mockito.never())
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.verify(repository, org.mockito.Mockito.never()).saveAction(report);
    org.mockito.Mockito.verify(jdbc)
        .update(
            "UPDATE studio_guided_actions SET document=?::jsonb WHERE admission_id=?",
            report.toString(),
            report.path("admission").path("admissionId").asText());

    for (var proof :
        java.util.Arrays.asList(
            (GuidedActionLedger.PreparedReport) null,
            new GuidedActionLedger(new GuidedContracts()).prepareReport(report))) {
      org.mockito.Mockito.clearInvocations(repository, checked);
      repository.saveAction(report, proof);
      org.mockito.Mockito.verify(repository).saveAction(report);
      org.mockito.Mockito.verify(checked).validate("ledger", report);
    }
    ObjectNode copy = report.deepCopy();
    org.mockito.Mockito.clearInvocations(repository, checked);
    repository.saveAction(copy, prepared);
    org.mockito.Mockito.verify(repository).saveAction(copy);
    org.mockito.Mockito.verify(checked).validate("ledger", copy);
    var sessionId = report.remove("sessionId");
    report.set("sessionId", sessionId);
    org.mockito.Mockito.clearInvocations(repository, checked);
    repository.saveAction(report, prepared);
    org.mockito.Mockito.verify(repository).saveAction(report);
    org.mockito.Mockito.verify(checked).validate("ledger", report);
  }

  @Test
  void failedProofCanonicalRefusalAndSqlFailureRetainOriginalSaveBehavior() throws Exception {
    GuidedContracts checked = org.mockito.Mockito.spy(new GuidedContracts());
    GuidedActionLedger selected = new GuidedActionLedger(checked);
    var jdbc = org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class);
    var repository =
        org.mockito.Mockito.spy(
            new GuidedSessionRepository(
                jdbc, new org.springframework.transaction.support.TransactionTemplate(), checked));
    ObjectNode report = uncertainReport(stored());
    org.mockito.Mockito.doThrow(new GuidedSessionException("INVALID_CONTRACT", 422))
        .when(checked)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    var failed = selected.prepareReport(report);
    assertThat(failed).isNotNull();
    org.mockito.Mockito.doCallRealMethod()
        .when(checked)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.clearInvocations(repository, checked);
    repository.saveAction(report, failed);
    org.mockito.Mockito.verify(repository).saveAction(report);
    org.mockito.Mockito.verify(checked).validate("ledger", report);

    var prepared = selected.prepareReport(report);
    ObjectNode invalid = report.deepCopy().put("ownerFence", Double.NaN);
    org.mockito.Mockito.clearInvocations(jdbc, repository, checked);
    assertThatThrownBy(() -> repository.saveAction(invalid, prepared))
        .hasMessage("INVALID_CONTRACT");
    org.mockito.Mockito.verify(repository).saveAction(invalid);
    org.mockito.Mockito.verify(checked).validate("ledger", invalid);
    org.mockito.Mockito.verifyNoInteractions(jdbc);

    var sqlFailure =
        new org.springframework.dao.DataIntegrityViolationException("fixed-sql-control");
    org.mockito.Mockito.doThrow(sqlFailure)
        .when(jdbc)
        .update(
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(Object.class),
            org.mockito.ArgumentMatchers.any(Object.class));
    assertThatThrownBy(() -> repository.saveAction(report, prepared)).isSameAs(sqlFailure);
  }

  /**
   * ADR-SC-008 D5: the receipt's closed code is the truth and the coarse ledger enum is derived
   * from it by one table. That table is the frozen contract's own ({@code LEDGER_FROM_CLOSED_CODE}
   * in the contract checker), read here rather than restated, so the two cannot drift: every closed
   * code of {@code step-receipt.schema.json} has a row there, and {@code derive} returns exactly
   * that row.
   */
  @Test
  void theReceiptClosedCodeDerivesTheLedgerOutcomeFromTheContractCheckersTable() throws Exception {
    String checker =
        java.nio.file.Files.readString(
            java.nio.file.Path.of("..", "tools", "check-studio-observed-contracts.cjs"));
    int start = checker.indexOf("LEDGER_FROM_CLOSED_CODE = Object.freeze({");
    assertThat(start).as("the contract checker still holds the table").isGreaterThan(0);
    String block = checker.substring(start, checker.indexOf("});", start));
    var row = java.util.regex.Pattern.compile("([A-Z_]+): \\['([A-Z_]+)', '([A-Z_]+)'\\]");
    var matcher = row.matcher(block);
    java.util.Map<String, String[]> table = new java.util.LinkedHashMap<>();
    while (matcher.find()) {
      table.put(matcher.group(1), new String[] {matcher.group(2), matcher.group(3)});
    }
    var schemaCodes = new java.util.TreeSet<String>();
    for (var node :
        new GuidedContracts()
            .parse(
                java.nio.file.Files.readString(
                    java.nio.file.Path.of(
                        "..",
                        "docs",
                        "specs",
                        "studio-observed-authoring",
                        "contracts",
                        "v3",
                        "step-receipt.schema.json")))
            .path("properties")
            .path("closedCode")
            .path("oneOf")
            .get(0)
            .path("enum")) {
      schemaCodes.add(node.asText());
    }
    // PASSWORD_CONTROL_READ_REFUSED and the others the receipt schema lists all have a row.
    assertThat(table.keySet()).containsExactlyInAnyOrderElementsOf(schemaCodes);
    for (var entry : table.entrySet()) {
      var outcome =
          GuidedActionLedger.derive(
              com.fasterxml.jackson.databind.node.TextNode.valueOf(entry.getKey()));
      assertThat(new String[] {outcome.state(), outcome.outcomeCode()})
          .as(entry.getKey())
          .containsExactly(entry.getValue());
    }
    assertThat(GuidedActionLedger.derive(new GuidedContracts().parse("null")))
        .isEqualTo(new GuidedActionLedger.Outcome("SUCCEEDED", "OK"));
    assertThatThrownBy(
            () ->
                GuidedActionLedger.derive(
                    com.fasterxml.jackson.databind.node.TextNode.valueOf("NOT_A_CODE")))
        .hasMessage("INVALID_CONTRACT");
  }
}

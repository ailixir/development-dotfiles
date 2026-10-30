package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.spy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * STUDIO-OBS-015 D1: a prefix drift receipt carries the issued {@code PrefixRequestIdentity}, which
 * has no {@code versions}. {@link GuidedMaterializationService#verifyPrefixReceipt} binds exactly
 * 11 fields (identity without {@code versions}, plus {@code authoredInputsHash} and {@code
 * prefixProgramHash}); every mismatch, absence or missing server value is {@code 409 STALE_FENCE}.
 */
class GuidedPrefixReceiptVerificationTest {

  private static final List<String> BOUND =
      List.of(
          "schemaVersion",
          "sessionId",
          "workerId",
          "ownerFence",
          "scopeHash",
          "contextId",
          "contextRevision",
          "sourceRevision",
          "configurationRevision",
          "authoredInputsHash",
          "prefixProgramHash");

  private final GuidedContracts contracts = new GuidedContracts();
  private final JsonNode session = contracts.object().put("sessionId", "session-1");
  private GuidedMaterializationService service;
  private ObjectNode context;

  @BeforeEach
  void stubServerContext() {
    service =
        spy(
            new GuidedMaterializationService(
                mock(JdbcTemplate.class),
                contracts,
                com.citi.put.checks.studio.support.TestDomains.FIXTURES));
    context =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", "session-1")
            .put("workerId", "worker-1")
            .put("ownerFence", 4)
            .put("scopeHash", "a".repeat(64))
            .put("contextId", "context-1")
            .put("contextRevision", 2)
            .put("sourceRevision", "7")
            .put("configurationRevision", "3")
            .put("authoredInputsHash", "b".repeat(64))
            .put("prefixProgramHash", "c".repeat(64));
    context.putObject("versions").put("contract", 3);
    doNothing().when(service).requireAcknowledged(anyString());
    doReturn(context).when(service).context(any(JsonNode.class));
  }

  /** The authentic receipt: the 11 bound fields, receipt-only fields, and no {@code versions}. */
  private ObjectNode authentic() {
    ObjectNode receipt = contracts.object();
    BOUND.forEach(field -> receipt.set(field, context.path(field)));
    receipt.put("phase", "PRE_ADMISSION").put("requestDigest", "d".repeat(64));
    return receipt;
  }

  @Test
  void anAuthenticReceiptWithoutVersionsIsAccepted() {
    ObjectNode receipt = authentic();
    assertThat(receipt.has("versions")).isFalse();
    assertThatCode(() -> service.verifyPrefixReceipt(session, receipt)).doesNotThrowAnyException();
  }

  @Test
  void eachOfTheElevenBoundFieldsMismatchedIsStaleFence() {
    assertThat(BOUND).hasSize(11);
    for (String field : BOUND) {
      ObjectNode changed = authentic();
      JsonNode value = changed.path(field);
      if (value.isInt()) {
        changed.put(field, value.intValue() + 1);
      } else if (value.asText().matches("[a-f0-9]{64}")) {
        changed.put(field, "e".repeat(64));
      } else {
        changed.put(field, value.asText() + "-other");
      }
      assertThatThrownBy(() -> service.verifyPrefixReceipt(session, changed))
          .as("mismatched %s", field)
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("STALE_FENCE");

      ObjectNode absent = authentic();
      absent.remove(field);
      assertThatThrownBy(() -> service.verifyPrefixReceipt(session, absent))
          .as("absent %s", field)
          .isInstanceOf(GuidedSessionException.class)
          .hasMessage("STALE_FENCE");
    }
  }

  @Test
  void aSessionWithoutAPrefixProgramNeverMatches() {
    ObjectNode receipt = authentic();
    receipt.remove("prefixProgramHash");
    context.remove("prefixProgramHash");
    assertThatThrownBy(() -> service.verifyPrefixReceipt(session, receipt))
        .isInstanceOf(GuidedSessionException.class)
        .hasMessage("STALE_FENCE");
  }
}

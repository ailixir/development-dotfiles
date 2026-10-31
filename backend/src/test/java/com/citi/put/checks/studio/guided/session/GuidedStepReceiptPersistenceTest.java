package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * ADR-SC-008 D5: the receipt of a learning attempt is stored once, with the outcome, in {@code
 * studio_guided_actions.receipt}. It has the {@code step-receipt} shape (closed code, step hash,
 * fence, effect method names) and never a value; a receipt of another shape is not stored.
 */
class GuidedStepReceiptPersistenceTest {
  private static final GuidedContracts C = new GuidedContracts();

  private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
  private final GuidedSessionRepository repository =
      new GuidedSessionRepository(jdbc, new TransactionTemplate(), C);

  private static ObjectNode receipt() {
    ObjectNode receipt =
        C.object()
            .put("stepHash", "a".repeat(64))
            .put("fenceCrossed", true)
            .put("effectsTruncated", false)
            .put("offscreen", false);
    receipt.putNull("closedCode");
    receipt.putArray("effects").addObject().put("method", "click").put("completed", true);
    return receipt;
  }

  private static ObjectNode action() {
    ObjectNode action = C.object();
    action.putObject("admission").put("admissionId", "adm-1");
    return action;
  }

  @Test
  void theReceiptIsWrittenOnceNextToTheOutcome() {
    ObjectNode receipt = receipt();
    // The ledger shape is validated by the ledger tests; the repository owns the receipt.
    var contracts = org.mockito.Mockito.spy(C);
    var checked = new GuidedSessionRepository(jdbc, new TransactionTemplate(), contracts);
    org.mockito.Mockito.doNothing()
        .when(contracts)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    checked.saveAction(action(), receipt);
    var sql = ArgumentCaptor.forClass(String.class);
    var args = ArgumentCaptor.forClass(Object.class);
    verify(jdbc).update(sql.capture(), args.capture(), args.capture(), args.capture());
    // COALESCE keeps a receipt that is already there: written once, never replaced.
    assertThat(sql.getValue()).contains("receipt=COALESCE(receipt,").contains("admission_id=?");
    assertThat(args.getAllValues()).contains(receipt.toString(), "adm-1");
  }

  @Test
  void aReceiptWithAnExtraFieldOrAValueIsNotStored() {
    var contracts = org.mockito.Mockito.spy(C);
    org.mockito.Mockito.doNothing()
        .when(contracts)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    var checked = new GuidedSessionRepository(jdbc, new TransactionTemplate(), contracts);
    ObjectNode leaking = receipt().put("value", "secret-canary");
    assertThatThrownBy(() -> checked.saveAction(action(), leaking))
        .isInstanceOf(GuidedSessionException.class);
    ObjectNode effect = receipt();
    ((ObjectNode) effect.path("effects").get(0)).put("argument", "secret-canary");
    assertThatThrownBy(() -> checked.saveAction(action(), effect))
        .isInstanceOf(GuidedSessionException.class);
    verify(jdbc, never()).update(anyString(), org.mockito.ArgumentMatchers.<Object[]>any());
    verify(jdbc, never())
        .update(
            anyString(),
            org.mockito.ArgumentMatchers.any(Object.class),
            org.mockito.ArgumentMatchers.any(Object.class),
            org.mockito.ArgumentMatchers.any(Object.class));
  }

  @Test
  void anOutcomeWithoutAReceiptLeavesTheColumnAlone() {
    var contracts = org.mockito.Mockito.spy(C);
    org.mockito.Mockito.doNothing()
        .when(contracts)
        .validate(org.mockito.ArgumentMatchers.eq("ledger"), org.mockito.ArgumentMatchers.any());
    var checked = new GuidedSessionRepository(jdbc, new TransactionTemplate(), contracts);
    checked.saveAction(action());
    var sql = ArgumentCaptor.forClass(String.class);
    verify(jdbc)
        .update(
            sql.capture(),
            org.mockito.ArgumentMatchers.any(Object.class),
            org.mockito.ArgumentMatchers.any(Object.class));
    assertThat(sql.getValue()).doesNotContain("receipt");
  }
}

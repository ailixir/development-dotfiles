package com.citi.put.checks.studio.guided.diagnostics;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.diagnostics.GuidedGuardProvenance.Guard;
import com.citi.put.checks.studio.guided.diagnostics.GuidedGuardProvenance.Transaction;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.SmartTransactionObject;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

class GuidedGuardProvenanceTest {
  @TempDir Path temporary;
  private static final String SESSION = "00000000-0000-0000-0000-000000000001";

  @AfterEach
  void reset() throws Exception {
    var disabled = GuidedGuardProvenance.class.getDeclaredField("DISABLED");
    disabled.setAccessible(true);
    var configured = GuidedGuardProvenance.class.getDeclaredField("configured");
    configured.setAccessible(true);
    configured.set(null, disabled.get(null));
    TransactionSynchronizationManager.clear();
  }

  @Test
  void exactEnumProtocolAndAsciiBounds() throws Exception {
    assertEquals(
        List.of(
            "REQUEST_INPUT_SIZE",
            "SESSION_RESERVATION_LIMITS",
            "CSI_DAILY_CHARGE",
            "LATE_USAGE_LIMITS",
            "SETTLEMENT_USAGE_LIMITS",
            "ACQUISITION_WINDOW",
            "ACQUISITION_REMAINING",
            "ACQUISITION_POLL_LIMITS",
            "ACQUISITION_SETTLEMENT_WINDOW",
            "PASSIVE_REMAINING",
            "PASSIVE_WAIT_TIMEOUT",
            "PASSIVE_WAIT_INTERRUPTED",
            "OBSERVATION_SHAPE",
            "OBSERVATION_DEPTH",
            "OBSERVATION_COUNT_RESERVE",
            "OBSERVATION_EVIDENCE_RESERVE",
            "OBSERVATION_REFRESH_LIMITS"),
        java.util.Arrays.stream(Guard.values()).map(Enum::name).toList());
    assertEquals(
        List.of("COMMITTED", "ROLLED_BACK", "NO_TRANSACTION"),
        java.util.Arrays.stream(Transaction.values()).map(Enum::name).toList());
    for (Guard guard : Guard.values()) {
      for (Transaction outcome : Transaction.values()) {
        byte[] bytes =
            new GuidedGuardProvenance.Receipt(UUID.fromString(SESSION), guard, outcome).bytes();
        assertTrue(bytes.length <= 256);
        for (byte value : bytes) {
          assertTrue(value >= 0);
        }
        var row = new ObjectMapper().readTree(bytes);
        var keys = new java.util.HashSet<String>();
        row.fieldNames().forEachRemaining(keys::add);
        assertEquals(Set.of("event", "version", "sessionId", "guard", "transaction"), keys);
        assertEquals("GUIDED_REJECTING_GUARD", row.path("event").asText());
        assertEquals(1, row.path("version").intValue());
        assertEquals(SESSION, row.path("sessionId").asText());
      }
    }
  }

  @Test
  void defaultOffReadsNoIdentityAndPassingControlNeverReadsSupplier() throws Exception {
    AtomicInteger reads = new AtomicInteger();
    for (Guard guard : Guard.values()) {
      GuidedGuardProvenance.observe(
          guard,
          () -> {
            reads.incrementAndGet();
            throw new AssertionError();
          });
      assertFalse(
          GuidedGuardProvenance.passing(
              false,
              guard,
              () -> {
                reads.incrementAndGet();
                return SESSION;
              }));
      assertTrue(
          GuidedGuardProvenance.passing(
              true,
              guard,
              () -> {
                reads.incrementAndGet();
                return SESSION;
              }));
    }
    assertEquals(0, reads.get());
    var configured = GuidedGuardProvenance.class.getDeclaredField("configured");
    configured.setAccessible(true);
    configured.set(null, new GuidedGuardProvenance(row -> fail()));
    assertTrue(
        GuidedGuardProvenance.passing(
            true,
            Guard.OBSERVATION_SHAPE,
            () -> {
              reads.incrementAndGet();
              return SESSION;
            }));
    assertEquals(0, reads.get());
    var disabled = new GuidedGuardProvenance(null);
    disabled
        .observation(
            Guard.REQUEST_INPUT_SIZE,
            () -> {
              reads.incrementAndGet();
              return SESSION;
            })
        .register();
    assertEquals(0, reads.get());
  }

  @Test
  void identityAndSinkFaultsDoNotEscapeOrInventObservation() {
    var events = new ArrayList<GuidedGuardProvenance.Receipt>();
    var diagnostic = new GuidedGuardProvenance(events::add);
    for (String value :
        new String[] {
          null,
          "CANARY_BODY_NOT_IDENTITY",
          "1-1-1-1-1",
          SESSION.toUpperCase().replace("000000000001", "ABCDEFABCDEF")
        }) {
      diagnostic.observation(Guard.PASSIVE_REMAINING, () -> value).register();
    }
    diagnostic
        .observation(
            Guard.PASSIVE_REMAINING,
            () -> {
              throw new AssertionError("CANARY");
            })
        .register();
    diagnostic.observation(null, () -> SESSION).register();
    assertTrue(events.isEmpty());
    assertDoesNotThrow(
        () ->
            new GuidedGuardProvenance(
                    row -> {
                      throw new AssertionError("CANARY");
                    })
                .observation(Guard.PASSIVE_REMAINING, () -> SESSION)
                .register());
    assertDoesNotThrow(
        () ->
            new TransactionTemplate(new LocalTransactions())
                .executeWithoutResult(
                    status ->
                        new GuidedGuardProvenance(
                                row -> {
                                  throw new AssertionError("CANARY");
                                })
                            .observation(Guard.REQUEST_INPUT_SIZE, () -> SESSION)
                            .register()));
  }

  @Test
  void actualCommitAndJoinedRollbackCarryHonestTransactionOutcomes() {
    var events = new ArrayList<GuidedGuardProvenance.Receipt>();
    var diagnostic = new GuidedGuardProvenance(events::add);
    var tx = new TransactionTemplate(new LocalTransactions());
    tx.executeWithoutResult(
        status -> {
          var observation = diagnostic.observation(Guard.REQUEST_INPUT_SIZE, () -> SESSION);
          observation.register();
          observation.register();
          assertTrue(events.isEmpty());
        });
    assertEquals(
        List.of(Transaction.COMMITTED),
        events.stream().map(GuidedGuardProvenance.Receipt::transaction).toList());
    events.clear();
    assertThrows(
        UnexpectedRollbackException.class,
        () ->
            tx.executeWithoutResult(
                outer -> {
                  tx.executeWithoutResult(
                      inner -> {
                        diagnostic.observation(Guard.OBSERVATION_DEPTH, () -> SESSION).register();
                        inner.setRollbackOnly();
                      });
                  assertTrue(events.isEmpty());
                }));
    assertEquals(1, events.size());
    assertEquals(Transaction.ROLLED_BACK, events.getFirst().transaction());
    assertEquals(Guard.OBSERVATION_DEPTH, events.getFirst().guard());
  }

  @Test
  void everyGuardHasOnlyItsActualTransactionModeAndDistinctHitsRemainDistinct() {
    for (Guard guard : Guard.values()) {
      var events = new ArrayList<GuidedGuardProvenance.Receipt>();
      var diagnostic = new GuidedGuardProvenance(events::add);
      diagnostic.observation(guard, () -> SESSION).register();
      assertEquals(guard.passive() ? 1 : 0, events.size());
      if (!events.isEmpty()) {
        assertEquals(Transaction.NO_TRANSACTION, events.getFirst().transaction());
      }
      events.clear();
      new TransactionTemplate(new LocalTransactions())
          .executeWithoutResult(
              status -> {
                diagnostic.observation(guard, () -> SESSION).register();
                diagnostic.observation(guard, () -> SESSION).register();
              });
      assertEquals(guard.passive() ? 0 : 2, events.size());
    }
  }

  @Test
  void missingInconsistentUnknownAndDuplicateCompletionDropWithoutFalseEvidence() {
    var events = new ArrayList<GuidedGuardProvenance.Receipt>();
    var diagnostic = new GuidedGuardProvenance(events::add);
    for (boolean actual : new boolean[] {false, true}) {
      for (boolean sync : new boolean[] {false, true}) {
        if (actual && sync) {
          continue;
        }
        TransactionSynchronizationManager.setActualTransactionActive(actual);
        if (sync) {
          TransactionSynchronizationManager.initSynchronization();
        }
        diagnostic.observation(Guard.REQUEST_INPUT_SIZE, () -> SESSION).register();
        diagnostic.observation(Guard.PASSIVE_REMAINING, () -> SESSION).register();
        assertEquals(!actual && !sync ? 1 : 0, events.size());
        events.clear();
        TransactionSynchronizationManager.clear();
      }
    }
    TransactionSynchronizationManager.setActualTransactionActive(true);
    TransactionSynchronizationManager.initSynchronization();
    diagnostic.observation(Guard.REQUEST_INPUT_SIZE, () -> SESSION).register();
    var unknown = TransactionSynchronizationManager.getSynchronizations().getFirst();
    unknown.afterCompletion(TransactionSynchronization.STATUS_UNKNOWN);
    unknown.afterCompletion(TransactionSynchronization.STATUS_COMMITTED);
    assertTrue(events.isEmpty());
  }

  @Test
  void registrationFailureIsSwallowedWithoutPublishing() {
    var events = new ArrayList<GuidedGuardProvenance.Receipt>();
    var diagnostic = new GuidedGuardProvenance(events::add);
    try (var state = mockStatic(TransactionSynchronizationManager.class)) {
      state.when(TransactionSynchronizationManager::isActualTransactionActive).thenReturn(true);
      state.when(TransactionSynchronizationManager::isSynchronizationActive).thenReturn(true);
      state
          .when(() -> TransactionSynchronizationManager.registerSynchronization(any()))
          .thenThrow(new IllegalStateException("SYNTHETIC_CANARY"));
      assertDoesNotThrow(
          () -> diagnostic.observation(Guard.REQUEST_INPUT_SIZE, () -> SESSION).register());
      assertTrue(events.isEmpty());
    }
  }

  @Test
  void pendingRegistrationsAndOutputQuotaAreBoundedEvenWithoutCompletion() {
    var events = new ArrayList<GuidedGuardProvenance.Receipt>();
    var diagnostic = new GuidedGuardProvenance(events::add);
    TransactionSynchronizationManager.setActualTransactionActive(true);
    TransactionSynchronizationManager.initSynchronization();
    for (int index = 0; index < 100; index++) {
      diagnostic.observation(Guard.OBSERVATION_SHAPE, () -> SESSION).register();
    }
    assertEquals(16, TransactionSynchronizationManager.getSynchronizations().size());
    assertTrue(events.isEmpty());
    for (var sync : TransactionSynchronizationManager.getSynchronizations()) {
      sync.afterCompletion(TransactionSynchronization.STATUS_COMMITTED);
      sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK);
    }
    assertEquals(16, events.size());
    TransactionSynchronizationManager.clear();
    diagnostic.observation(Guard.PASSIVE_REMAINING, () -> SESSION).register();
    assertEquals(16, events.size());
  }

  @Test
  void concurrentSessionsKeepIdentityAndGlobalBound() throws Exception {
    var events = new ConcurrentLinkedQueue<GuidedGuardProvenance.Receipt>();
    var diagnostic = new GuidedGuardProvenance(events::add);
    try (var pool = Executors.newFixedThreadPool(8)) {
      var work = new ArrayList<java.util.concurrent.Future<?>>();
      for (int index = 0; index < 32; index++) {
        String session = new UUID(0, index + 1).toString();
        work.add(
            pool.submit(
                () ->
                    new TransactionTemplate(new LocalTransactions())
                        .executeWithoutResult(
                            status ->
                                diagnostic
                                    .observation(Guard.OBSERVATION_COUNT_RESERVE, () -> session)
                                    .register())));
      }
      for (var item : work) {
        item.get(2, TimeUnit.SECONDS);
      }
    }
    assertEquals(16, events.size());
    assertEquals(
        16, events.stream().map(GuidedGuardProvenance.Receipt::sessionId).distinct().count());
    assertTrue(
        events.stream()
            .allMatch(
                row ->
                    row.transaction() == Transaction.COMMITTED
                        && row.guard() == Guard.OBSERVATION_COUNT_RESERVE));
  }

  @Test
  void nativeWriterQuotaAndExactFixedReceipt() throws Exception {
    Path file = privateFile("quota");
    var sink = publisher(file);
    for (int index = 0; index < 100; index++) {
      sink.accept(receipt());
    }
    waitUntil(() -> !available(sink));
    var lines = Files.readAllLines(file);
    assertEquals(16, lines.size());
    assertTrue(
        lines.stream()
            .allMatch(
                value ->
                    value.equals(
                        new String(receipt().bytes(), java.nio.charset.StandardCharsets.US_ASCII)
                            .strip())));
  }

  @Test
  void permissionSymlinkHardlinkForeignIdentityAndReplacementRefuse() throws Exception {
    Path file = privateFile("mode");
    var target = target(file);
    Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-r-----"));
    assertThrows(Exception.class, target::verify);
    Path linked = privateFile("symlink");
    var linkTarget = target(linked);
    Path old = linked.resolveSibling("old");
    Files.move(linked, old);
    Files.createSymbolicLink(linked, old.getFileName());
    assertThrows(Exception.class, linkTarget::verify);
    Path hard = privateFile("hard");
    var hardTarget = target(hard);
    Files.createLink(hard.resolveSibling("alias"), hard);
    assertThrows(Exception.class, hardTarget::verify);
    Path owned = privateFile("identity");
    var ownedTarget = target(owned);
    assertThrows(
        Exception.class,
        () ->
            GuidedGuardProvenance.verifyNode(
                owned, ownedTarget.uid() + 1, ownedTarget.fileDev(), ownedTarget.fileIno(), false));
    Path replacement = privateFile("replacement");
    var replacementTarget = target(replacement);
    Files.move(replacement, replacement.resolveSibling("old"));
    Files.createFile(replacement);
    assertThrows(Exception.class, replacementTarget::verify);
    var sink = publisher(file);
    sink.accept(receipt());
    waitUntil(() -> !available(sink));
    assertEquals(0, Files.size(file));
  }

  @Test
  void shortWriteAndExternalAppendAreNeverRetried() throws Exception {
    FileChannel channel = mock(FileChannel.class);
    when(channel.size()).thenReturn(0L);
    when(channel.write(any(java.nio.ByteBuffer.class))).thenReturn(1);
    assertFalse(GuidedGuardProvenance.FilePublisher.appendOnce(channel, new byte[10], 0));
    verify(channel, times(1)).write(any(java.nio.ByteBuffer.class));
    when(channel.size()).thenReturn(5L);
    assertFalse(GuidedGuardProvenance.FilePublisher.appendOnce(channel, new byte[10], 0));
    verify(channel, times(1)).write(any(java.nio.ByteBuffer.class));
  }

  @Test
  void productOfferDoesNoFileWorkAndSinkFailureRetiresWithoutRetry() throws Exception {
    FileChannel channel = mock(FileChannel.class);
    var entered = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    when(channel.size())
        .thenAnswer(
            invocation -> {
              entered.countDown();
              release.await();
              throw new java.io.IOException("CANARY");
            });
    Path file = privateFile("blocked");
    var sink = new GuidedGuardProvenance.FilePublisher(channel, target(file));
    assertTrue(entered.await(2, TimeUnit.SECONDS));
    assertTimeoutPreemptively(
        java.time.Duration.ofSeconds(1),
        () -> {
          for (int index = 0; index < 100; index++) {
            sink.accept(receipt());
          }
        });
    release.countDown();
    waitUntil(() -> !available(sink));
    sink.accept(receipt());
    verify(channel, never()).write(any(java.nio.ByteBuffer.class));
    assertEquals(0, Files.size(file));
  }

  private Path privateFile(String name) throws Exception {
    Files.setPosixFilePermissions(temporary, PosixFilePermissions.fromString("rwx------"));
    Path root =
        Files.createDirectory(
            temporary.resolve(name),
            PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
    return Files.createFile(
        root.resolve("guard.jsonl"),
        PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
  }

  private static GuidedGuardProvenance.Target target(Path file) throws Exception {
    Path root = file.getParent();
    return new GuidedGuardProvenance.Target(
        root,
        ((Number) Files.getAttribute(root, "unix:uid")).longValue(),
        ((Number) Files.getAttribute(root, "unix:dev")).longValue(),
        ((Number) Files.getAttribute(root, "unix:ino")).longValue(),
        ((Number) Files.getAttribute(file, "unix:dev")).longValue(),
        ((Number) Files.getAttribute(file, "unix:ino")).longValue());
  }

  private static GuidedGuardProvenance.FilePublisher publisher(Path file) throws Exception {
    return new GuidedGuardProvenance.FilePublisher(
        FileChannel.open(
            file, java.nio.file.StandardOpenOption.WRITE, java.nio.file.StandardOpenOption.APPEND),
        target(file));
  }

  private static GuidedGuardProvenance.Receipt receipt() {
    return new GuidedGuardProvenance.Receipt(
        UUID.fromString(SESSION), Guard.REQUEST_INPUT_SIZE, Transaction.COMMITTED);
  }

  private static boolean available(GuidedGuardProvenance.FilePublisher sink) throws Exception {
    var field = sink.getClass().getDeclaredField("available");
    field.setAccessible(true);
    return ((AtomicBoolean) field.get(sink)).get();
  }

  private static void waitUntil(CheckedBoolean condition) throws Exception {
    for (int count = 0; count < 200; count++) {
      if (condition.get()) {
        return;
      }
      Thread.sleep(10);
    }
    fail("CONTROL_BOUNDED_SYNTHETIC_WAIT");
  }

  private interface CheckedBoolean {
    boolean get() throws Exception;
  }

  /** Real Spring REQUIRED completion, with a pure synthetic resource and no database. */
  static final class LocalTransactions extends AbstractPlatformTransactionManager {
    private final ThreadLocal<Resource> current = new ThreadLocal<>();

    private static final class Resource {
      boolean rollback;
    }

    private static final class Tx implements SmartTransactionObject {
      Resource resource;

      Tx(Resource resource) {
        this.resource = resource;
      }

      public boolean isRollbackOnly() {
        return resource != null && resource.rollback;
      }

      public void flush() {}
    }

    protected Object doGetTransaction() {
      return new Tx(current.get());
    }

    protected boolean isExistingTransaction(Object transaction) {
      return ((Tx) transaction).resource != null;
    }

    protected void doBegin(Object transaction, TransactionDefinition definition) {
      Resource resource = new Resource();
      ((Tx) transaction).resource = resource;
      current.set(resource);
    }

    protected void doCommit(DefaultTransactionStatus status) {}

    protected void doRollback(DefaultTransactionStatus status) {}

    protected void doSetRollbackOnly(DefaultTransactionStatus status) {
      ((Tx) status.getTransaction()).resource.rollback = true;
    }

    protected void doCleanupAfterCompletion(Object transaction) {
      current.remove();
    }
  }
}

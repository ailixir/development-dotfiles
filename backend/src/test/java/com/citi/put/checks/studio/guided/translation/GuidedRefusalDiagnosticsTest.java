package com.citi.put.checks.studio.guided.translation;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.translation.GuidedRefusalDiagnostics.Gate;
import com.sun.security.auth.module.UnixSystem;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.SmartTransactionObject;
import org.springframework.transaction.support.TransactionTemplate;

class GuidedRefusalDiagnosticsTest {
  @TempDir Path temporary;

  @Test
  void exactEnumAndFixedReceiptNeverAcceptFreeText() throws Exception {
    assertEquals(
        List.of(
            "UNKNOWN",
            "ADAPTER_USAGE",
            "ADAPTER_CANDIDATE",
            "ADAPTER_FINISH",
            "ADAPTER_CONTENT",
            "WIRE_CANONICAL",
            "STRICT_SCHEMA",
            "REQUEST_IDENTITY",
            "APPLICATION",
            "SETTLEMENT_AUTHORITY",
            "OTHER_CLIENT_FAILURE",
            "STEP_ORIGINAL_AUTHORITY",
            "STEP_CURRENT_AUTHORED_STEP",
            "STEP_CODE_SHAPE",
            "STEP_CAPTURES",
            "STEP_USES",
            "STEP_CONTRACT",
            "STEP_CHOICES",
            "STEP_TARGET_REF",
            "STEP_SELECTED_CHOICE",
            "STEP_RESERVATION",
            // Prepare refusals: persisted in progress.refusalGate, never receipted.
            "STEP_SYNTAX",
            "STEP_PRE_FENCE"),
        java.util.Arrays.stream(Gate.values()).map(Enum::name).toList());
    for (Gate gate : Gate.values()) {
      assertTrue(receipt(gate).bytes().length <= 256);
    }
    var receipt = receipt(Gate.APPLICATION);
    var value = new com.fasterxml.jackson.databind.ObjectMapper().readTree(receipt.bytes());
    assertEquals(5, value.size());
    assertEquals(
        java.util.Set.of("event", "version", "sessionId", "attemptId", "gate"),
        new java.util.HashSet<>() {
          {
            value.fieldNames().forEachRemaining(this::add);
          }
        });
    assertEquals("GUIDED_REFUSAL_GATE", value.path("event").asText());
    assertEquals(1, value.path("version").asInt());
    assertTrue(receipt.bytes().length <= GuidedRefusalDiagnostics.FilePublisher.MAX_RECORD_BYTES);
    assertTrue(
        java.util.Arrays.stream(GuidedRefusalDiagnostics.Capture.class.getMethods())
            .filter(method -> java.lang.reflect.Modifier.isAbstract(method.getModifiers()))
            .allMatch(
                method ->
                    java.util.Arrays.equals(
                        method.getParameterTypes(), new Class<?>[] {Gate.class})));
  }

  @Test
  void defaultOffAndMalformedIdentityHaveNoThreadFileOrPublicationBehavior() {
    assertNull(System.getProperty(GuidedRefusalDiagnostics.FILE_PROPERTY));
    long before = writerCount();
    var attempt =
        GuidedRefusalDiagnostics.configured()
            .attempt(UUID.randomUUID().toString(), UUID.randomUUID().toString());
    assertFalse(attempt.enabled());
    attempt.record(Gate.APPLICATION);
    attempt.enterApplication();
    attempt.applicationReturned();
    attempt.rejectedAfterCommit(false);
    assertEquals(before, writerCount());
    var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
    assertFalse(
        new GuidedRefusalDiagnostics(events::add)
            .attempt("request-id-canary", "not-server-owned")
            .enabled());
    assertTrue(events.isEmpty());
  }

  @Test
  void actualCommitPublishesOnceButJoinedOuterRollbackPublishesNothing() {
    var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
    var tx = new TransactionTemplate(new LocalTransactions());
    var attempt = attempt(events::add);
    tx.executeWithoutResult(
        status -> {
          attempt.record(Gate.STRICT_SCHEMA);
          attempt.record(Gate.ADAPTER_CONTENT);
          attempt.rejectedAfterCommit(false);
          attempt.rejectedAfterCommit(false);
          assertTrue(events.isEmpty());
        });
    assertEquals(1, events.size());
    assertEquals(Gate.STRICT_SCHEMA, events.getFirst().gate());
    events.clear();
    var joined = attempt(events::add);
    assertThrows(
        UnexpectedRollbackException.class,
        () ->
            tx.executeWithoutResult(
                outer -> {
                  tx.executeWithoutResult(
                      inner -> {
                        joined.rejectedAfterCommit(false);
                        inner.setRollbackOnly();
                      });
                  assertTrue(events.isEmpty());
                }));
    assertTrue(events.isEmpty());
  }

  @Test
  void phaseIsActualApplicationEntryAndNormalReturn() {
    var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
    var tx = new TransactionTemplate(new LocalTransactions());
    var before = attempt(events::add);
    before.record(Gate.WIRE_CANONICAL);
    tx.executeWithoutResult(status -> before.rejectedAfterCommit(true));
    var inside = attempt(events::add);
    inside.enterApplication();
    tx.executeWithoutResult(status -> inside.rejectedAfterCommit(true));
    var after = attempt(events::add);
    after.enterApplication();
    after.applicationReturned();
    tx.executeWithoutResult(status -> after.rejectedAfterCommit(true));
    assertEquals(
        List.of(Gate.SETTLEMENT_AUTHORITY, Gate.APPLICATION, Gate.SETTLEMENT_AUTHORITY),
        events.stream().map(GuidedRefusalDiagnostics.Receipt::gate).toList());
  }

  @Test
  void exactNextAllowlistOnlyInsideFailedApplyAndFirstLeafWins() {
    var tx = new TransactionTemplate(new LocalTransactions());
    for (Gate gate : Gate.values()) {
      for (int phase = 0; phase < 3; phase++) {
        var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
        var attempt = attempt(events::add);
        attempt.record(gate);
        attempt.record(Gate.STEP_RESERVATION);
        if (phase > 0) {
          attempt.enterApplication();
        }
        if (phase > 1) {
          attempt.applicationReturned();
        }
        tx.executeWithoutResult(status -> attempt.rejectedAfterCommit(true));
        Gate first = gate == Gate.UNKNOWN ? Gate.STEP_RESERVATION : gate;
        assertEquals(
            phase != 1
                ? Gate.SETTLEMENT_AUTHORITY
                : first.name().startsWith("STEP_") ? first : Gate.APPLICATION,
            events.getFirst().gate());
      }
    }
  }

  @TestFactory
  Stream<DynamicTest> everyFineClientGateIsFilteredInEveryPhaseWithRealCommitOnly() {
    // The exact enum test separately binds these appended23 values to the accepted literal list.
    return java.util.Arrays.stream(Gate.values())
        .skip(11)
        // The RUNNER_* values are runner-time refusals persisted on the session, never recorded
        // on a model-reply capture, so they have no receipt phase to filter.
        .filter(gate -> gate.name().startsWith("STEP_"))
        .flatMap(
            gate ->
                java.util.stream.IntStream.range(0, 3)
                    .mapToObj(
                        phase ->
                            DynamicTest.dynamicTest(
                                gate + "_CLIENT_PHASE_" + phase + "_COMMIT_ROLLBACK_NO_TRANSACTION",
                                () -> {
                                  var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
                                  var tx = new TransactionTemplate(new LocalTransactions());
                                  var noTransaction = finePhaseAttempt(events, gate, phase);
                                  noTransaction.rejectedAfterCommit(false);
                                  assertTrue(events.isEmpty());
                                  var committed = finePhaseAttempt(events, gate, phase);
                                  tx.executeWithoutResult(
                                      status -> {
                                        committed.rejectedAfterCommit(false);
                                        committed.rejectedAfterCommit(true);
                                        assertTrue(events.isEmpty());
                                      });
                                  assertEquals(1, events.size());
                                  assertEquals(Gate.OTHER_CLIENT_FAILURE, events.getFirst().gate());
                                  events.clear();
                                  var rolledBack = finePhaseAttempt(events, gate, phase);
                                  tx.executeWithoutResult(
                                      outer -> {
                                        tx.executeWithoutResult(
                                            inner -> {
                                              rolledBack.rejectedAfterCommit(false);
                                              assertTrue(events.isEmpty());
                                            });
                                        assertTrue(events.isEmpty());
                                        outer.setRollbackOnly();
                                      });
                                  assertTrue(events.isEmpty());
                                })));
  }

  private static GuidedRefusalDiagnostics.Attempt finePhaseAttempt(
      List<GuidedRefusalDiagnostics.Receipt> events, Gate gate, int phase) {
    var attempt = attempt(events::add);
    attempt.record(gate);
    // Filtering the first fine capture must not promote a later old client gate.
    attempt.record(Gate.STRICT_SCHEMA);
    if (phase > 0) {
      attempt.enterApplication();
    }
    if (phase > 1) {
      attempt.applicationReturned();
    }
    return attempt;
  }

  @Test
  void allOldElevenClientGateSelectionsRemainIdenticalInEveryPhase() {
    var tx = new TransactionTemplate(new LocalTransactions());
    for (Gate gate : java.util.Arrays.stream(Gate.values()).limit(11).toList()) {
      for (int phase = 0; phase < 3; phase++) {
        var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
        var attempt = attempt(events::add);
        attempt.record(gate);
        if (phase > 0) {
          attempt.enterApplication();
        }
        if (phase > 1) {
          attempt.applicationReturned();
        }
        tx.executeWithoutResult(
            status -> {
              attempt.rejectedAfterCommit(false);
              assertTrue(events.isEmpty());
            });
        assertEquals(1, events.size());
        assertEquals(
            gate == Gate.UNKNOWN ? Gate.OTHER_CLIENT_FAILURE : gate, events.getFirst().gate());
      }
    }
  }

  @Test
  void noTransactionRollbackAndSinkFailureCannotChangeProductOutcome() {
    var events = new ArrayList<GuidedRefusalDiagnostics.Receipt>();
    attempt(events::add).rejectedAfterCommit(false);
    var tx = new TransactionTemplate(new LocalTransactions());
    tx.executeWithoutResult(
        status -> {
          attempt(events::add).rejectedAfterCommit(false);
          status.setRollbackOnly();
        });
    assertTrue(events.isEmpty());
    Object expected = new Object();
    assertSame(
        expected,
        tx.execute(
            status -> {
              attempt(
                      receipt -> {
                        throw new AssertionError("synthetic-sink-error-canary");
                      })
                  .rejectedAfterCommit(false);
              return expected;
            }));
    assertDoesNotThrow(
        () ->
            GuidedRefusalDiagnostics.record(
                gate -> {
                  throw new AssertionError("canary");
                },
                Gate.APPLICATION));
  }

  @Test
  void concurrentAttemptsKeepIndependentFirstFailuresAndExactlyOneCommitReceipt() throws Exception {
    var events = new ConcurrentLinkedQueue<GuidedRefusalDiagnostics.Receipt>();
    var tx = new TransactionTemplate(new LocalTransactions());
    try (var threads = Executors.newFixedThreadPool(4)) {
      List<java.util.concurrent.Future<?>> tasks = new ArrayList<>();
      for (int index = 0; index < 8; index++) {
        tasks.add(
            threads.submit(
                () ->
                    tx.executeWithoutResult(
                        status -> {
                          var attempt = attempt(events::add);
                          attempt.record(Gate.ADAPTER_FINISH);
                          attempt.record(Gate.STRICT_SCHEMA);
                          attempt.rejectedAfterCommit(false);
                          attempt.rejectedAfterCommit(true);
                        })));
      }
      for (var task : tasks) {
        task.get(5, TimeUnit.SECONDS);
      }
    }
    assertEquals(8, events.size());
    assertEquals(
        8, events.stream().map(GuidedRefusalDiagnostics.Receipt::attemptId).distinct().count());
    assertTrue(events.stream().allMatch(event -> event.gate() == Gate.ADAPTER_FINISH));
  }

  @Test
  void precreatedPrivateSinkIsBoundedAndChangedTargetFailsClosed() throws Exception {
    Path file = privateFile("bounded");
    var sink = publisher(file);
    for (int index = 0; index < 100; index++) {
      sink.accept(receipt(Gate.ADAPTER_CONTENT));
    }
    waitUntil(() -> !available(sink));
    assertEquals(16, Files.readAllLines(file).size(), "CONTROL_FILE_QUOTA");
    assertTrue(Files.size(file) <= 16 * 256);
    Path changed = privateFile("changed");
    var bound = publisher(changed);
    bound.accept(receipt(Gate.APPLICATION));
    waitUntil(() -> Files.size(changed) > 0);
    Path old = changed.resolveSibling("old-private");
    Files.move(changed, old);
    Files.createFile(
        changed,
        PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
    bound.accept(receipt(Gate.APPLICATION));
    waitUntil(() -> !available(bound));
    assertEquals(0, Files.size(changed));
    assertEquals(1, Files.readAllLines(old).size());
  }

  @Test
  void badModesSymlinksForeignOwnerAndNonemptyFilesRefuseWithoutFallback() throws Exception {
    Path file = privateFile("bad-mode");
    Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-r-----"));
    var mode = publisher(file);
    mode.accept(receipt(Gate.APPLICATION));
    waitUntil(() -> !available(mode));
    assertEquals(0, Files.size(file));
    Path valid = privateFile("symlink-target");
    var boundTarget = target(valid);
    var boundChannel =
        FileChannel.open(
            valid, java.nio.file.StandardOpenOption.WRITE, java.nio.file.StandardOpenOption.APPEND);
    Path original = valid.resolveSibling("old-private");
    Files.move(valid, original);
    Files.createSymbolicLink(valid, original.getFileName());
    var symbolic = new GuidedRefusalDiagnostics.FilePublisher(boundChannel, boundTarget);
    symbolic.accept(receipt(Gate.APPLICATION));
    waitUntil(() -> !available(symbolic));
    assertEquals(0, Files.size(original));
    Path owned = privateFile("foreign-owner");
    var ownedTarget = target(owned);
    assertThrows(
        Exception.class,
        () ->
            GuidedRefusalDiagnostics.verifyNode(
                owned,
                new UnixSystem().getUid() + 1,
                ownedTarget.fileDev(),
                ownedTarget.fileIno(),
                false));
    Path occupied = privateFile("nonempty");
    Files.writeString(occupied, "public-fake-body-canary");
    var nonempty = publisher(occupied);
    nonempty.accept(receipt(Gate.APPLICATION));
    waitUntil(() -> !available(nonempty));
    assertEquals("public-fake-body-canary", Files.readString(occupied));
  }

  @Test
  void partialWriteOrConcurrentAppendIsNeverRetried() throws Exception {
    FileChannel channel = mock(FileChannel.class);
    when(channel.size()).thenReturn(0L);
    when(channel.write(any(java.nio.ByteBuffer.class))).thenReturn(1);
    assertFalse(GuidedRefusalDiagnostics.FilePublisher.appendOnce(channel, new byte[10], 0));
    verify(channel, times(1)).write(any(java.nio.ByteBuffer.class));
    when(channel.size()).thenReturn(5L);
    assertFalse(GuidedRefusalDiagnostics.FilePublisher.appendOnce(channel, new byte[10], 0));
    verify(channel, times(1)).write(any(java.nio.ByteBuffer.class));
  }

  @Test
  void asynchronousOfferNeverWaitsForBlockedWriterAndFailureRetiresPermanently() throws Exception {
    Path file = privateFile("blocked-writer");
    FileChannel channel = mock(FileChannel.class);
    var entered = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    when(channel.size())
        .thenAnswer(
            invocation -> {
              entered.countDown();
              release.await();
              throw new java.io.IOException("public-fake-io-error");
            });
    var sink = new GuidedRefusalDiagnostics.FilePublisher(channel, target(file));
    assertTrue(entered.await(2, TimeUnit.SECONDS));
    assertTimeoutPreemptively(
        java.time.Duration.ofSeconds(1),
        () -> {
          for (int index = 0; index < 100; index++) {
            sink.accept(receipt(Gate.APPLICATION));
          }
        });
    release.countDown();
    waitUntil(() -> !available(sink));
    sink.accept(receipt(Gate.APPLICATION));
    verify(channel, never()).write(any(java.nio.ByteBuffer.class));
    assertEquals(0, Files.size(file));
  }

  @Test
  void modeLinkAndExternalSizeChangesRefuseFurtherWrites() throws Exception {
    for (String kind : List.of("mode", "link", "size")) {
      Path file = privateFile("change-" + kind);
      var sink = publisher(file);
      sink.accept(receipt(Gate.APPLICATION));
      waitUntil(() -> Files.size(file) > 0);
      long original = Files.size(file);
      if (kind.equals("mode")) {
        Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-r--r--"));
      }
      if (kind.equals("link")) {
        Files.createLink(file.resolveSibling("other-link"), file);
      }
      if (kind.equals("size")) {
        Files.writeString(file, "PUBLIC_EXTRA_CANARY", java.nio.file.StandardOpenOption.APPEND);
      }
      long changed = Files.size(file);
      sink.accept(receipt(Gate.STRICT_SCHEMA));
      waitUntil(() -> !available(sink));
      sink.accept(receipt(Gate.ADAPTER_CONTENT));
      assertEquals(changed, Files.size(file));
      assertTrue(changed >= original);
    }
  }

  @Test
  void retirementPrecedesPotentiallyBlockedCloseAndEmbeddedProcessDefaultsDoNotInheritStdin()
      throws Exception {
    var process = new ProcessBuilder("PUBLIC_UNEXECUTED_SYNTHETIC_COMMAND");
    assertEquals(ProcessBuilder.Redirect.PIPE, process.redirectInput());
    process
        .redirectOutput(ProcessBuilder.Redirect.INHERIT)
        .redirectError(ProcessBuilder.Redirect.INHERIT);
    assertEquals(ProcessBuilder.Redirect.PIPE, process.redirectInput());
    Path file = privateFile("blocked-close");
    FileChannel channel = mock(FileChannel.class);
    var closing = new java.util.concurrent.CountDownLatch(1);
    var release = new java.util.concurrent.CountDownLatch(1);
    when(channel.size()).thenThrow(new java.io.IOException("PUBLIC_ERROR_CANARY"));
    doAnswer(
            invocation -> {
              closing.countDown();
              release.await();
              return null;
            })
        .when(channel)
        .close();
    var publisher = new GuidedRefusalDiagnostics.FilePublisher(channel, target(file));
    assertTrue(closing.await(2, TimeUnit.SECONDS));
    assertFalse(available(publisher));
    assertTimeoutPreemptively(
        java.time.Duration.ofSeconds(1),
        () -> {
          for (int index = 0; index < 100; index++) {
            publisher.accept(receipt(Gate.APPLICATION));
          }
        });
    verify(channel, never()).write(any(java.nio.ByteBuffer.class));
    release.countDown();
  }

  private Path privateFile(String name) throws Exception {
    temporary = temporary.toRealPath();
    Files.setPosixFilePermissions(temporary, PosixFilePermissions.fromString("rwx------"));
    Path root =
        Files.createDirectory(
            temporary.resolve(name),
            PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
    return Files.createFile(
        root.resolve("gate.jsonl"),
        PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
  }

  private static GuidedRefusalDiagnostics.Target target(Path file) throws Exception {
    Path root = file.getParent();
    return new GuidedRefusalDiagnostics.Target(
        root,
        new UnixSystem().getUid(),
        ((Number) Files.getAttribute(root, "unix:dev")).longValue(),
        ((Number) Files.getAttribute(root, "unix:ino")).longValue(),
        ((Number) Files.getAttribute(file, "unix:dev")).longValue(),
        ((Number) Files.getAttribute(file, "unix:ino")).longValue());
  }

  private static GuidedRefusalDiagnostics.FilePublisher publisher(Path file) throws Exception {
    return new GuidedRefusalDiagnostics.FilePublisher(
        FileChannel.open(
            file, java.nio.file.StandardOpenOption.WRITE, java.nio.file.StandardOpenOption.APPEND),
        target(file));
  }

  static GuidedRefusalDiagnostics.Attempt attempt(
      java.util.function.Consumer<GuidedRefusalDiagnostics.Receipt> publisher) {
    return new GuidedRefusalDiagnostics(publisher)
        .attempt(UUID.randomUUID().toString(), UUID.randomUUID().toString());
  }

  private static GuidedRefusalDiagnostics.Receipt receipt(Gate gate) {
    return new GuidedRefusalDiagnostics.Receipt(UUID.randomUUID(), UUID.randomUUID(), gate);
  }

  private static long writerCount() {
    return Thread.getAllStackTraces().keySet().stream()
        .filter(thread -> thread.getName().equals("guided-private-refusal-writer"))
        .count();
  }

  private static boolean available(GuidedRefusalDiagnostics.FilePublisher publisher)
      throws Exception {
    var field = publisher.getClass().getDeclaredField("available");
    field.setAccessible(true);
    return ((AtomicBoolean) field.get(publisher)).get();
  }

  private static void waitUntil(CheckedBoolean condition) throws Exception {
    for (int count = 0; count < 200; count++) {
      if (condition.get()) {
        return;
      }
      Thread.sleep(10);
    }
    fail("bounded synthetic condition not reached");
  }

  private interface CheckedBoolean {
    boolean get() throws Exception;
  }

  /** Real Spring REQUIRED participation and commit callbacks, with no database resource. */
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

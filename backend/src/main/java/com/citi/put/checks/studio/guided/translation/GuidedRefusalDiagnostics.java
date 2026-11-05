package com.citi.put.checks.studio.guided.translation;

import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Optional local-unit diagnostic. Never a product result, authority, logger or retry mechanism. */
public final class GuidedRefusalDiagnostics {
  /** Retained name only: this old path property never enables publication or a fallback. */
  public static final String FILE_PROPERTY = "checks.guided.private-refusal-file";

  public static final String FD0_PROPERTY = "checks.guided.private-refusal.fd0";

  public enum Gate {
    UNKNOWN,
    ADAPTER_USAGE,
    ADAPTER_CANDIDATE,
    ADAPTER_FINISH,
    ADAPTER_CONTENT,
    WIRE_CANONICAL,
    STRICT_SCHEMA,
    REQUEST_IDENTITY,
    APPLICATION,
    SETTLEMENT_AUTHORITY,
    OTHER_CLIENT_FAILURE,
    STEP_ORIGINAL_AUTHORITY,
    STEP_CURRENT_AUTHORED_STEP,
    STEP_CODE_SHAPE,
    STEP_CAPTURES,
    STEP_USES,
    STEP_CONTRACT,
    STEP_CHOICES,
    STEP_TARGET_REF,
    STEP_SELECTED_CHOICE,
    STEP_RESERVATION,
    /** The runner refused the code at prepare: it does not parse (line and column). */
    STEP_SYNTAX,
    /** The runner refused at prepare: the code failed before its first effectful call. */
    STEP_PRE_FENCE
  }

  private static void ignore(Gate gate) {}

  @FunctionalInterface
  public interface Capture {
    Capture NONE = GuidedRefusalDiagnostics::ignore;

    void record(Gate gate);
  }

  record Receipt(UUID sessionId, UUID attemptId, Gate gate) {
    byte[] bytes() {
      return ("{\"event\":\"GUIDED_REFUSAL_GATE\",\"version\":1,\"sessionId\":\""
              + sessionId
              + "\",\"attemptId\":\""
              + attemptId
              + "\",\"gate\":\""
              + gate.name()
              + "\"}\n")
          .getBytes(StandardCharsets.US_ASCII);
    }
  }

  private static final GuidedRefusalDiagnostics DISABLED = new GuidedRefusalDiagnostics(null);
  private final Consumer<Receipt> publisher;

  GuidedRefusalDiagnostics(Consumer<Receipt> publisher) {
    this.publisher = publisher;
  }

  private static volatile GuidedRefusalDiagnostics configured = DISABLED;

  static GuidedRefusalDiagnostics configured() {
    return configured;
  }

  /** Only the reviewed opt-in launcher selects this fixed main; old path properties do nothing. */
  public static final class Bootstrap {
    private static final AtomicBoolean ENTERED = new AtomicBoolean();
    private static InputStream retainedOriginalInput;
    private static FileOutputStream retainedOutput;

    public static void main(String[] args) {
      if ("1".equals(System.getProperty(FD0_PROPERTY))) {
        if (!ENTERED.compareAndSet(false, true) || !takeCustody()) {
          System.exit(78);
          return;
        }
      }
      // The original application exception/return is deliberately neither caught nor retried.
      com.citi.put.checks.ChecksApplication.main(args);
    }

    private static boolean takeCustody() {
      try {
        retainedOriginalInput = System.in;
        if (retainedOriginalInput == null) {
          return false;
        }
        InputStream eof = InputStream.nullInputStream();
        System.setIn(eof);
        if (System.in != eof) {
          return false;
        }
      } catch (Throwable unavailable) {
        return false;
      }
      try {
        Target target = Target.fromProperties();
        if (!posixDiagnosticsAvailable(target.root())) {
          return true; // POSIX_ONLY: custody stands, diagnostics stay disabled.
        }
        retainedOutput = new FileOutputStream(FileDescriptor.in);
        FileChannel channel = retainedOutput.getChannel();
        configured = new GuidedRefusalDiagnostics(new FilePublisher(channel, target));
      } catch (Throwable unavailable) {
        // EOF custody is established: attachment failure disables diagnostics, never the app.
      }
      return true;
    }
  }

  static GuidedRefusalDiagnostics disabled() {
    return DISABLED;
  }

  static void record(Capture capture, Gate gate) {
    try {
      capture.record(gate);
    } catch (Throwable unavailable) {
      // An optional diagnostic cannot replace an original return, exception or transaction.
    }
  }

  /** Original call/argument scope only; never examines the propagated refusal. */
  static <T> T call(Capture capture, Gate gate, java.util.function.Supplier<T> original) {
    if (capture == Capture.NONE) {
      return original.get();
    }
    try {
      return original.get();
    } catch (com.citi.put.checks.studio.guided.session.GuidedSessionException refusal) {
      record(capture, gate);
      throw refusal;
    }
  }

  /** Receives the already once-evaluated original condition and unchanged require arguments. */
  static void requireCaptured(
      boolean condition, String code, int status, Capture capture, Gate gate) {
    if (!condition && capture != Capture.NONE) {
      record(capture, gate);
    }
    com.citi.put.checks.studio.guided.session.GuidedSessionException.require(
        condition, code, status);
  }

  private static boolean stepFailure(Gate gate) {
    return switch (gate) {
      case STEP_ORIGINAL_AUTHORITY,
              STEP_CURRENT_AUTHORED_STEP,
              STEP_CODE_SHAPE,
              STEP_CAPTURES,
              STEP_USES,
              STEP_CONTRACT,
              STEP_CHOICES,
              STEP_TARGET_REF,
              STEP_SELECTED_CHOICE,
              STEP_RESERVATION,
              STEP_SYNTAX,
              STEP_PRE_FENCE ->
          true;
      default -> false;
    };
  }

  Attempt attempt(String sessionId, String attemptId) {
    if (publisher != null) {
      try {
        UUID session = UUID.fromString(sessionId), attempt = UUID.fromString(attemptId);
        if (session.toString().equals(sessionId) && attempt.toString().equals(attemptId)) {
          return new Attempt(session, attempt, publisher);
        }
      } catch (Throwable unavailable) {
        // Malformed or unavailable original server identity grants no diagnostic authority.
      }
    }
    return Attempt.NONE;
  }

  Attempt attempt(GuidedTranslationStore.Attempt reserved) {
    if (publisher != null) {
      try {
        var identity = reserved.identity();
        if (identity.path("attemptId").asText().equals(reserved.attemptId())) {
          return attempt(identity.path("sessionId").asText(), reserved.attemptId());
        }
      } catch (Throwable unavailable) {
        // No body, request ID, exception or failed diagnostic crosses into a product outcome.
      }
    }
    return Attempt.NONE;
  }

  static final class Attempt implements Capture {
    private static final Attempt NONE = new Attempt(null, null, null);
    private final UUID session, attempt;
    private final Consumer<Receipt> publisher;
    private final AtomicReference<Gate> first = new AtomicReference<>(Gate.UNKNOWN);
    private final AtomicBoolean registered = new AtomicBoolean();
    private boolean entered, returned;

    private Attempt(UUID session, UUID attempt, Consumer<Receipt> publisher) {
      this.session = session;
      this.attempt = attempt;
      this.publisher = publisher;
    }

    boolean enabled() {
      return publisher != null;
    }

    @Override
    public void record(Gate gate) {
      if (enabled() && gate != null && gate != Gate.UNKNOWN) {
        first.compareAndSet(Gate.UNKNOWN, gate);
      }
    }

    void enterApplication() {
      if (enabled()) {
        entered = true;
      }
    }

    void applicationReturned() {
      if (enabled()) {
        returned = true;
      }
    }

    /** Call only after the original REJECTED finish succeeds, within its actual transaction. */
    void rejectedAfterCommit(boolean exceptionPath) {
      if (!enabled()) {
        return;
      }
      try {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
            || !TransactionSynchronizationManager.isSynchronizationActive()
            || !registered.compareAndSet(false, true)) {
          return;
        }
        Gate captured = first.get();
        Gate gate =
            exceptionPath
                ? entered && !returned
                    ? stepFailure(captured) ? captured : Gate.APPLICATION
                    : Gate.SETTLEMENT_AUTHORITY
                : captured == Gate.UNKNOWN || stepFailure(captured)
                    ? Gate.OTHER_CLIENT_FAILURE
                    : captured;
        Receipt receipt = new Receipt(session, attempt, gate);
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
              @Override
              public void afterCommit() {
                try {
                  publisher.accept(receipt);
                } catch (Throwable unavailable) {
                  // No fallback logging, I/O retry or product failure.
                }
              }
            });
      } catch (Throwable unavailable) {
        // Registration failure cannot replace a product outcome.
      }
    }
  }

  /** Launch-pinned identity supplements, but never substitutes for, native descriptor binding. */
  record Target(Path root, long uid, long rootDev, long rootIno, long fileDev, long fileIno) {
    static Target fromProperties() {
      String prefix = "checks.guided.private-refusal.";
      return new Target(
          Path.of(System.getProperty(prefix + "root")),
          Long.parseLong(System.getProperty(prefix + "uid")),
          Long.parseLong(System.getProperty(prefix + "rootDev")),
          Long.parseLong(System.getProperty(prefix + "rootIno")),
          Long.parseLong(System.getProperty(prefix + "fileDev")),
          Long.parseLong(System.getProperty(prefix + "fileIno")));
    }

    void verify() throws Exception {
      verifyNode(root, uid, rootDev, rootIno, true);
      verifyNode(root.resolve("gate.jsonl"), uid, fileDev, fileIno, false);
    }
  }

  /** One bounded daemon; it writes only the native-bound inherited descriptor, never a path. */
  static final class FilePublisher implements Consumer<Receipt> {
    static final int MAX_RECORDS = 16, MAX_RECORD_BYTES = 256;
    private final ArrayBlockingQueue<Receipt> queue = new ArrayBlockingQueue<>(MAX_RECORDS);
    private final AtomicInteger accepted = new AtomicInteger();
    private final AtomicBoolean available = new AtomicBoolean(true);

    FilePublisher(FileChannel channel, Target target) {
      Thread writer = new Thread(() -> write(channel, target), "guided-private-refusal-writer");
      writer.setDaemon(true);
      writer.start();
    }

    @Override
    public void accept(Receipt receipt) {
      if (available.get()
          && accepted.getAndUpdate(value -> Math.min(value + 1, MAX_RECORDS)) < MAX_RECORDS) {
        queue.offer(receipt);
      }
    }

    private void write(FileChannel supplied, Target target) {
      FileChannel channel = supplied;
      try {
        target.verify();
        if (channel.size() != 0) {
          return;
        }
        long written = 0;
        for (int count = 0; count < MAX_RECORDS; count++) {
          Receipt receipt = queue.take();
          target.verify();
          byte[] bytes = receipt.bytes();
          if (bytes.length > MAX_RECORD_BYTES || !appendOnce(channel, bytes, written)) {
            return;
          }
          written += bytes.length;
          target.verify();
        }
      } catch (Throwable unavailable) {
        // No reopen, write loop, retry, flush, create, truncate, logger or public fallback.
      } finally {
        available.set(false);
        queue.clear();
        try {
          channel.close();
        } catch (Throwable unavailable) {
          // Retirement precedes even a potentially blocking close on the sole daemon.
        }
      }
    }

    static boolean appendOnce(FileChannel channel, byte[] bytes, long written) throws Exception {
      return channel.size() == written
          && channel.write(ByteBuffer.wrap(bytes)) == bytes.length
          && channel.size() == written + bytes.length;
    }
  }

  /**
   * The private sink is bound by POSIX mode, owner, device, inode and link count. A file system
   * without the {@code posix} and {@code unix} attribute views (Windows) cannot be verified, so
   * there this POSIX-only diagnostic is unavailable: no sink is attached and nothing is written.
   * Product behaviour is the same either way.
   */
  static final String POSIX_ONLY = "POSIX-only diagnostics unavailable";

  static boolean posixDiagnosticsAvailable(Path path) {
    Set<String> views = path.getFileSystem().supportedFileAttributeViews();
    return views.contains("posix") && views.contains("unix");
  }

  static void verifyNode(Path path, long uid, long dev, long ino, boolean directory)
      throws Exception {
    if (!posixDiagnosticsAvailable(path)) {
      throw new UnsupportedOperationException(POSIX_ONLY);
    }
    BasicFileAttributes attributes =
        Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
    Set<PosixFilePermission> expected =
        directory
            ? Set.of(
                PosixFilePermission.OWNER_READ,
                PosixFilePermission.OWNER_WRITE,
                PosixFilePermission.OWNER_EXECUTE)
            : Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
    if (attributes.isSymbolicLink()
        || (directory ? !attributes.isDirectory() : !attributes.isRegularFile())
        || !Files.getPosixFilePermissions(path, LinkOption.NOFOLLOW_LINKS).equals(expected)
        || ((Number) Files.getAttribute(path, "unix:uid", LinkOption.NOFOLLOW_LINKS)).longValue()
            != uid
        || ((Number) Files.getAttribute(path, "unix:dev", LinkOption.NOFOLLOW_LINKS)).longValue()
            != dev
        || ((Number) Files.getAttribute(path, "unix:ino", LinkOption.NOFOLLOW_LINKS)).longValue()
            != ino
        || !directory
            && ((Number) Files.getAttribute(path, "unix:nlink", LinkOption.NOFOLLOW_LINKS))
                    .longValue()
                != 1) {
      throw new IllegalStateException();
    }
  }
}

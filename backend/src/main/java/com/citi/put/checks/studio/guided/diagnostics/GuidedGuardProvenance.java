package com.citi.put.checks.studio.guided.diagnostics;

import java.io.FileDescriptor;
import java.io.FileOutputStream;
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
import java.util.function.Consumer;
import java.util.function.Supplier;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Optional observation of original rejecting branches, never an authority or product outcome. */
public final class GuidedGuardProvenance {
  public enum Guard {
    REQUEST_INPUT_SIZE,
    SESSION_RESERVATION_LIMITS,
    CSI_DAILY_CHARGE,
    LATE_USAGE_LIMITS,
    SETTLEMENT_USAGE_LIMITS,
    ACQUISITION_WINDOW,
    ACQUISITION_REMAINING,
    ACQUISITION_POLL_LIMITS,
    ACQUISITION_SETTLEMENT_WINDOW,
    PASSIVE_REMAINING,
    PASSIVE_WAIT_TIMEOUT,
    PASSIVE_WAIT_INTERRUPTED,
    OBSERVATION_SHAPE,
    OBSERVATION_COUNT_RESERVE,
    OBSERVATION_EVIDENCE_RESERVE,
    OBSERVATION_REFRESH_LIMITS;

    boolean passive() {
      return this == PASSIVE_REMAINING
          || this == PASSIVE_WAIT_TIMEOUT
          || this == PASSIVE_WAIT_INTERRUPTED;
    }
  }

  public enum Transaction {
    COMMITTED,
    ROLLED_BACK,
    NO_TRANSACTION
  }

  record Receipt(UUID sessionId, Guard guard, Transaction transaction) {
    byte[] bytes() {
      return ("{\"event\":\"GUIDED_REJECTING_GUARD\",\"version\":1,\"sessionId\":\""
              + sessionId
              + "\",\"guard\":\""
              + guard.name()
              + "\",\"transaction\":\""
              + transaction.name()
              + "\"}\n")
          .getBytes(StandardCharsets.US_ASCII);
    }
  }

  static final int MAX_RECORDS = 16, MAX_RECORD_BYTES = 256;
  private static final GuidedGuardProvenance DISABLED = new GuidedGuardProvenance(null);
  private static volatile GuidedGuardProvenance configured = DISABLED;
  private final Consumer<Receipt> publisher;
  // Lifetime admission bounds BOTH unfinished transaction registrations and eventual output.
  private final AtomicInteger admitted = new AtomicInteger();

  GuidedGuardProvenance(Consumer<Receipt> publisher) {
    this.publisher = publisher;
  }

  /** No supplied identity/body/property is read on the constant disabled path. */
  public static void observe(Guard guard, Supplier<String> identity) {
    GuidedGuardProvenance selected = configured;
    if (selected == DISABLED) {
      return;
    }
    selected.observation(guard, identity).register();
  }

  /** The original expression has already evaluated once, with its original short-circuit order. */
  public static boolean passing(boolean condition, Guard guard, Supplier<String> identity) {
    if (!condition && guard != null) {
      observe(guard, identity);
    }
    return condition;
  }

  Observation observation(Guard guard, Supplier<String> identity) {
    if (publisher == null || guard == null) {
      return Observation.NONE;
    }
    try {
      String original = identity.get();
      UUID session = UUID.fromString(original);
      if (session.toString().equals(original)) {
        return new Observation(this, session, guard);
      }
    } catch (Throwable unavailable) {
      // Optional identity failure grants no diagnostic authority and has no public effect.
    }
    return Observation.NONE;
  }

  private boolean admit() {
    return admitted.getAndUpdate(value -> Math.min(value + 1, MAX_RECORDS)) < MAX_RECORDS;
  }

  private void publish(UUID session, Guard guard, Transaction outcome) {
    try {
      publisher.accept(new Receipt(session, guard, outcome));
    } catch (Throwable unavailable) {
      /* No logger, retry, fallback or product effect. */
    }
  }

  static final class Observation {
    static final Observation NONE = new Observation(null, null, null);
    private final GuidedGuardProvenance owner;
    private final UUID session;
    private final Guard guard;
    private final AtomicBoolean registered = new AtomicBoolean();

    private Observation(GuidedGuardProvenance owner, UUID session, Guard guard) {
      this.owner = owner;
      this.session = session;
      this.guard = guard;
    }

    void register() {
      if (owner == null) {
        return;
      }
      try {
        boolean actual = TransactionSynchronizationManager.isActualTransactionActive();
        boolean synchronizedTransaction =
            TransactionSynchronizationManager.isSynchronizationActive();
        if (guard.passive()) {
          if (actual
              || synchronizedTransaction
              || !registered.compareAndSet(false, true)
              || !owner.admit()) {
            return;
          }
          owner.publish(session, guard, Transaction.NO_TRANSACTION);
          return;
        }
        if (!actual
            || !synchronizedTransaction
            || !registered.compareAndSet(false, true)
            || !owner.admit()) {
          return;
        }
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
              private final AtomicBoolean completed = new AtomicBoolean();

              @Override
              public void afterCompletion(int status) {
                if (!completed.compareAndSet(false, true)) {
                  return;
                }
                if (status == STATUS_COMMITTED) {
                  owner.publish(session, guard, Transaction.COMMITTED);
                } else if (status == STATUS_ROLLED_BACK) {
                  owner.publish(session, guard, Transaction.ROLLED_BACK);
                }
                // UNKNOWN or any inconsistent completion is intentionally absent evidence.
              }
            });
      } catch (Throwable unavailable) {
        // Registration/state/identity/sink faults must never replace the original outcome.
      }
    }
  }

  /**
   * Only the separately selected, reviewed guard bootstrap calls this after exclusive fd0 custody.
   */
  static void attachInheritedDescriptor() {
    try {
      FileOutputStream output = new FileOutputStream(FileDescriptor.in);
      configured =
          new GuidedGuardProvenance(
              new FilePublisher(output.getChannel(), Target.fromProperties()));
    } catch (Throwable unavailable) {
      // Custody is already EOF; attachment failure leaves diagnostics disabled.
    }
  }

  record Target(Path root, long uid, long rootDev, long rootIno, long fileDev, long fileIno) {
    static Target fromProperties() {
      String prefix = "checks.guided.private-guard.";
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
      verifyNode(root.resolve("guard.jsonl"), uid, fileDev, fileIno, false);
    }
  }

  /** One bounded daemon performs all file work; product calls only offer to its bounded queue. */
  static final class FilePublisher implements Consumer<Receipt> {
    private final ArrayBlockingQueue<Receipt> queue = new ArrayBlockingQueue<>(MAX_RECORDS);
    private final AtomicInteger accepted = new AtomicInteger();
    private final AtomicBoolean available = new AtomicBoolean(true);

    FilePublisher(FileChannel channel, Target target) {
      Thread writer = new Thread(() -> write(channel, target), "guided-private-guard-writer");
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
      try {
        target.verify();
        if (supplied.size() != 0) {
          return;
        }
        long written = 0;
        for (int count = 0; count < MAX_RECORDS; count++) {
          Receipt receipt = queue.take();
          target.verify();
          byte[] bytes = receipt.bytes();
          if (bytes.length > MAX_RECORD_BYTES || !appendOnce(supplied, bytes, written)) {
            return;
          }
          written += bytes.length;
          target.verify();
        }
      } catch (Throwable unavailable) {
        // No reopen, write loop, retry, flush/join, create/truncate or logger fallback.
      } finally {
        available.set(false);
        queue.clear();
        try {
          supplied.close();
        } catch (Throwable unavailable) {
          /* Retired sole daemon. */
        }
      }
    }

    static boolean appendOnce(FileChannel channel, byte[] bytes, long written) throws Exception {
      return channel.size() == written
          && channel.write(ByteBuffer.wrap(bytes)) == bytes.length
          && channel.size() == written + bytes.length;
    }
  }

  static void verifyNode(Path path, long uid, long dev, long ino, boolean directory)
      throws Exception {
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

package com.citi.put.checks.studio.guided.examples;

import com.citi.put.checks.studio.guided.examples.StepExampleStore.Candidate;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * The frozen example store for gate runs (ADR-SC-008 D6, FR-14). {@link #freeze} checks eligibility
 * once and leaves out every example whose normalized step text equals an excluded text (the 14 gate
 * positives, N1-N3 and the smoke steps). Text alone is matched, not text plus origin: the gate
 * table has one site per test while origins are per step, so an origin match could let a redirected
 * gate step through. The cost is fewer examples for generic steps, a deliberate deviation from ADR
 * D6. Reading a snapshot reads its members only, so inserts after the freeze are invisible and
 * {@code snapshot_hash} describes exactly what it holds.
 *
 * <p>The gate harness (E22a) decides how it calls this; the texts come from the gate table and the
 * smoke list, parsed outside main code.
 */
@Component
public class StepExampleSnapshots {
  private final StepExampleStore store;

  public StepExampleSnapshots(StepExampleStore store) {
    this.store = store;
  }

  /** A stored snapshot: its id, its hash and its member count. */
  public record Snapshot(UUID id, String hash, int size) {}

  /** A snapshot member matches an excluded step text. Names ids only, never the text. */
  public static final class SnapshotContaminatedException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final transient List<UUID> exampleIds;

    SnapshotContaminatedException(List<UUID> ids) {
      super("The example snapshot holds " + ids.size() + " excluded step(s): " + ids);
      this.exampleIds = List.copyOf(ids);
    }

    public List<UUID> exampleIds() {
      return exampleIds;
    }
  }

  /**
   * @throws IllegalArgumentException when no exclusion is given: a gate freeze without them is a
   *     mistake
   */
  public Snapshot freeze(Collection<String> excludedStepTexts) {
    if (excludedStepTexts.isEmpty()) {
      throw new IllegalArgumentException("A gate snapshot needs the excluded step texts");
    }
    Set<String> excluded = normalized(excludedStepTexts);
    List<UUID> ids =
        store.eligibleAll().stream()
            .filter(c -> !excluded.contains(StepExampleSanitizer.normalize(c.stepText())))
            .map(Candidate::id)
            .sorted()
            .toList();
    String hash = hash(ids);
    return new Snapshot(store.insertSnapshot(hash, ids), hash, ids.size());
  }

  /**
   * @throws SnapshotContaminatedException when a member matches an excluded step text
   */
  public void verify(UUID snapshotId, Collection<String> excludedStepTexts) {
    Set<String> excluded = normalized(excludedStepTexts);
    List<Candidate> members =
        store
            .allSnapshotMembers(snapshotId)
            .orElseThrow(() -> new IllegalStateException("The example snapshot does not exist"));
    List<UUID> hits =
        members.stream()
            .filter(c -> excluded.contains(StepExampleSanitizer.normalize(c.stepText())))
            .map(Candidate::id)
            .toList();
    if (!hits.isEmpty()) {
      throw new SnapshotContaminatedException(hits);
    }
  }

  static String hash(List<UUID> sortedIds) {
    try {
      String lines = sortedIds.stream().map(UUID::toString).collect(Collectors.joining("\n"));
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(lines.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }

  private static Set<String> normalized(Collection<String> texts) {
    return texts.stream().map(StepExampleSanitizer::normalize).collect(Collectors.toSet());
  }
}

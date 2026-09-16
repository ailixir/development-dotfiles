package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * Story 10.15 AC-16, structural half — the API-side video store is read-only <b>by
 * construction</b>.
 *
 * <p>Asserted by reflecting over {@link VideoObjectStore} itself. That is the criterion, not a
 * stylistic choice: the epic's sixteenth catalogued vacuous shape is a guard whose <em>name</em>
 * states a property of a production symbol while its <em>body</em> asserts over a test-local
 * stand-in, and it survives mutation testing because a sibling reddens it. A test that said "the
 * fake has no put method" would be prose.
 *
 * <p>The story is explicit that this half is the weaker one and that the behavioural half — the
 * instrumented byte count in {@code ExecutionVideoRangeIT} — is the real evidence. Both ship.
 */
class VideoObjectStoreSurfaceTest {

  @Test
  void theProductionInterfaceDeclaresExactlyARangedReadAndASizeRead() {
    Set<String> declared =
        Arrays.stream(VideoObjectStore.class.getDeclaredMethods())
            .map(Method::getName)
            .collect(Collectors.toSet());

    assertThat(declared)
        .as("the API-side store declares exactly the two operations this route needs")
        .containsExactlyInAnyOrder("metadata", "read");
  }

  @Test
  void itDeclaresNoWriteNoDeleteNoListAndNoCopy() {
    Set<String> declared =
        Arrays.stream(VideoObjectStore.class.getDeclaredMethods())
            .map(method -> method.getName().toLowerCase(java.util.Locale.ROOT))
            .collect(Collectors.toSet());

    // Named rather than inferred from the set above, so that a future method called `putRange`
    // fails on the word as well as on the count.
    for (String forbidden : Set.of("put", "write", "upload", "delete", "remove", "list", "copy")) {
      assertThat(declared)
          .as(
              "§6.2 gives the API read-only credentials; `%s` would be a permission in Java",
              forbidden)
          .noneMatch(name -> name.contains(forbidden));
    }
  }

  /**
   * The distinction AC-17 needs lives in the type rather than in a comment: an absent object is an
   * empty {@link Optional}, and an unreachable store is an exception.
   */
  @Test
  void theSeamCarriesTheAbsentVersusUnreachableDistinctionInItsOwnSignatures() throws Exception {
    Method metadata = VideoObjectStore.class.getDeclaredMethod("metadata", String.class);

    assertThat(metadata.getReturnType())
        .as("an absent object must be representable without an exception")
        .isEqualTo(Optional.class);
    assertThat(VideoObjectStoreUnavailableException.class)
        .as("and an unreachable store must have a type of its own")
        .isNotEqualTo(IllegalStateException.class);

    Method read =
        VideoObjectStore.class.getDeclaredMethod("read", String.class, long.class, long.class);
    assertThat(read.getReturnType())
        .as("a ranged read returns the range, not a handle the caller slices")
        .isEqualTo(byte[].class);
    assertThat(read.getParameterCount())
        .as("and it takes the bounds, which is what makes 'only the range was read' observable")
        .isEqualTo(3);
  }
}

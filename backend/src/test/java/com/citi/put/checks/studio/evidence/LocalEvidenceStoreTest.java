package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.recovery.LocalResultManifestStore;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalEvidenceStoreTest {

  @TempDir Path root;

  @Test
  void readsOnlyTheRequestedRangeAndRejectsKeysOutsideTheRoot() throws Exception {
    Path object = root.resolve("studio/60406/video.webm");
    Files.createDirectories(object.getParent());
    Files.write(object, new byte[] {0, 1, 2, 3, 4, 5});
    LocalVideoObjectStore store = new LocalVideoObjectStore(root);

    assertThat(store.metadata("studio/60406/video.webm").orElseThrow().sizeBytes()).isEqualTo(6);
    assertThat(store.read("studio/60406/video.webm", 2, 4)).containsExactly(2, 3, 4);
    assertThatThrownBy(() -> store.metadata("../outside"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void readsABoundedManifestAndDistinguishesMissing() throws Exception {
    Path object = root.resolve("studio/result.json");
    Files.createDirectories(object.getParent());
    Files.writeString(
        object,
        """
        {"schemaVersion":1,"executionId":"e","attemptId":"a","outcome":"PASSED"}
        """);
    LocalResultManifestStore store = new LocalResultManifestStore(root, 1024, new ObjectMapper());

    assertThat(store.read("studio/result.json")).isPresent();
    assertThat(store.read("studio/missing.json")).isEmpty();

    LocalResultManifestStore bounded = new LocalResultManifestStore(root, 8, new ObjectMapper());
    assertThatThrownBy(() -> bounded.read("studio/result.json"))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("size bound");
  }
}

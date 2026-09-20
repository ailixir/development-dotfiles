package com.citi.put.checks.studio.storage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.evidence.VideoObjectStoreUnavailableException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FilesystemStorageTest {
  @TempDir Path directory;

  @Test
  void readsRunnerBytesAndSerializedManifestFromOneDirectoryAfterRestart() throws Exception {
    Path root = directory.resolve("objects");
    var store = new FilesystemVideoObjectStore(root);
    Path video = root.resolve("studio/csi/test/execution/attempt/video.webm");
    Files.createDirectories(video.getParent());
    Files.write(video, new byte[] {10, 20, 30, 40, 50});
    assertThat(
            store
                .metadata("studio/csi/test/execution/attempt/video.webm")
                .orElseThrow()
                .sizeBytes())
        .isEqualTo(5);
    assertThat(store.read("studio/csi/test/execution/attempt/video.webm", 1, 3))
        .containsExactly(20, 30, 40);
    var restarted = new FilesystemVideoObjectStore(root);
    assertThat(restarted.read("studio/csi/test/execution/attempt/video.webm", 4, 4))
        .containsExactly(50);
    String manifestKey = "studio/csi/test/execution/attempt/result.json";
    Files.copy(
        Path.of("../studio-runner/test/fixtures/result-manifest.json"), root.resolve(manifestKey));
    var reader =
        new ObjectStoreManifestReader(
            restarted, new ObjectMapper().registerModule(new JavaTimeModule()));
    var result = reader.read(manifestKey).orElseThrow();
    assertThat(result.schemaVersion()).isEqualTo(1);
    assertThat(result.executionId()).isNotBlank();
    assertThat(result.runtimeVersions()).isNotEmpty();
    assertThat(reader.read("studio/missing.json")).isEmpty();
    assertThat(reader.isAvailable()).isTrue();
  }

  @Test
  void missingObjectDiffersFromUnavailableRootAndInvalidManifest() throws Exception {
    Path root = directory.resolve("objects");
    var store = new FilesystemVideoObjectStore(root);
    var reader = new ObjectStoreManifestReader(store, new ObjectMapper());
    assertThat(store.metadata("missing")).isEmpty();
    Files.writeString(root.resolve("bad.json"), "invalid");
    assertThatThrownBy(() -> reader.read("bad.json")).isInstanceOf(IllegalStateException.class);
    Files.write(root.resolve("large.json"), new byte[1024 * 1024 + 1]);
    assertThatThrownBy(() -> reader.read("large.json")).hasMessageContaining("size limit");
    Files.delete(root.resolve("bad.json"));
    Files.delete(root.resolve("large.json"));
    Files.delete(root);
    assertThatThrownBy(() -> store.metadata("missing"))
        .isInstanceOf(VideoObjectStoreUnavailableException.class);
    assertThat(reader.isAvailable()).isFalse();
  }

  @Test
  void rejectsTraversalSymlinksAndOutOfBoundsReads() throws Exception {
    var store = new FilesystemVideoObjectStore(directory.resolve("objects"));
    Files.writeString(directory.resolve("secret"), "secret");
    assertThatThrownBy(() -> store.metadata("../secret"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> store.metadata(directory.resolve("secret").toString()))
        .isInstanceOf(IllegalArgumentException.class);
    Files.createSymbolicLink(directory.resolve("objects/link"), directory.resolve("secret"));
    assertThatThrownBy(() -> store.metadata("link"))
        .isInstanceOf(VideoObjectStoreUnavailableException.class);
    Files.writeString(directory.resolve("objects/video"), "abc");
    assertThatThrownBy(() -> store.read("video", -1, 2))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> store.read("video", 0, 5))
        .isInstanceOf(VideoObjectStoreUnavailableException.class);
  }
}

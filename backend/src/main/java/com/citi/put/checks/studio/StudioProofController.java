package com.citi.put.checks.studio;

import java.nio.file.Path;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Serves locally generated proof artifacts only while the local profile is active. */
@RestController
@Profile("local")
@RequestMapping("/api/v1/studio/proof")
public class StudioProofController {

  private final Path proofsDir = Path.of(System.getProperty("user.dir")).resolve("build/studio-proofs");

  @GetMapping("/{executionId}/{filename:.+}")
  public ResponseEntity<Resource> proof(@PathVariable UUID executionId, @PathVariable String filename) {
    Path file = proofsDir.resolve(executionId.toString()).resolve(filename).normalize();
    if (!file.startsWith(proofsDir) || !file.toFile().isFile()) {
      return ResponseEntity.notFound().build();
    }
    MediaType mediaType = filename.endsWith(".webm") ? MediaType.valueOf("video/webm") : MediaType.IMAGE_PNG;
    return ResponseEntity.ok().contentType(mediaType).body(new FileSystemResource(file));
  }
}

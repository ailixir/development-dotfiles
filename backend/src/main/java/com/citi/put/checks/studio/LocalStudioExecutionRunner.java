package com.citi.put.checks.studio;

import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Runs Studio tests against the locally installed Chrome and persists its video/screenshots. */
@Component
@Profile("local")
public class LocalStudioExecutionRunner {

  private static final TypeReference<List<String>> STEPS = new TypeReference<>() {};
  private static final TypeReference<Map<String, Object>> RESULT = new TypeReference<>() {};

  private final UITestExecutionRepository executions;
  private final ObjectMapper objectMapper;
  private final AsyncTaskExecutor executor;
  private final Path frontendDir;
  private final Path proofsDir;

  public LocalStudioExecutionRunner(
      UITestExecutionRepository executions,
      ObjectMapper objectMapper,
      @Qualifier("uiTestExecutor") AsyncTaskExecutor executor) {
    this.executions = executions;
    this.objectMapper = objectMapper;
    this.executor = executor;
    this.frontendDir = Path.of(System.getProperty("user.dir")).resolve("../frontend").normalize();
    this.proofsDir = Path.of(System.getProperty("user.dir")).resolve("build/studio-proofs");
  }

  public void submit(UUID executionId, UITest test) {
    executor.execute(() -> run(executionId, test));
  }

  @Transactional
  void run(UUID executionId, UITest test) {
    Instant started = Instant.now();
    UITestExecution execution = executions.findById(executionId).orElseThrow();
    execution.setStatus("RUNNING");
    try {
      Path artifactDir = proofsDir.resolve(executionId.toString());
      Files.createDirectories(artifactDir);
      Path input = artifactDir.resolve("input.json");
      Path result = artifactDir.resolve("result.json");
      List<String> steps = objectMapper.readValue(test.getSteps(), STEPS);
      objectMapper.writeValue(
          input.toFile(),
          Map.of("steps", steps, "viewport", Map.of("width", test.getViewportWidth(), "height", test.getViewportHeight())));

      Process process =
          new ProcessBuilder("node", "scripts/run-studio-test.mjs", input.toString(), result.toString())
              .directory(frontendDir.toFile())
              .redirectErrorStream(true)
              .start();
      String processOutput = new String(process.getInputStream().readAllBytes());
      boolean finished = process.waitFor(2, TimeUnit.MINUTES);
      if (!finished) {
        process.destroyForcibly();
        throw new IllegalStateException("Local browser run timed out after two minutes");
      }
      Map<String, Object> runnerResult = objectMapper.readValue(result.toFile(), RESULT);
      execution.setStatus((String) runnerResult.getOrDefault("status", "FAILED"));
      execution.setLogs(objectMapper.writeValueAsString(runnerResult.getOrDefault("logs", List.of())));
      execution.setErrorDetails(objectMapper.writeValueAsString(runnerResult.getOrDefault("stepResults", List.of())));
      @SuppressWarnings("unchecked")
      List<String> screenshots = (List<String>) runnerResult.getOrDefault("screenshots", List.of());
      execution.setScreenshotUrls(
          screenshots.stream()
              .map(name -> "/api/v1/studio/proof/" + executionId + "/" + name)
              .toArray(String[]::new));
      try (var files = Files.list(artifactDir)) {
        files.filter(path -> path.getFileName().toString().endsWith(".webm"))
            .findFirst()
            .ifPresent(path -> execution.setVideoUrl("/api/v1/studio/proof/" + executionId + "/" + path.getFileName()));
      }
      if (process.exitValue() != 0 && "COMPLETED".equals(execution.getStatus())) {
        execution.setStatus("FAILED");
      }
      if (!processOutput.isBlank()) {
        execution.setLogs(
            objectMapper.writeValueAsString(
                List.of(Map.of("timestamp", Instant.now().toString(), "type", "info", "message", processOutput.trim()))));
      }
    } catch (IOException | InterruptedException exception) {
      Thread.currentThread().interrupt();
      execution.setStatus("FAILED");
      execution.setLogs(
          "[{\"timestamp\":\"" + Instant.now() + "\",\"type\":\"error\",\"message\":\"" + exception.getMessage().replace("\"", "'") + "\"}]");
    } catch (Exception exception) {
      execution.setStatus("FAILED");
      execution.setLogs(
          "[{\"timestamp\":\"" + Instant.now() + "\",\"type\":\"error\",\"message\":\"" + exception.getMessage().replace("\"", "'") + "\"}]");
    } finally {
      execution.setEndedAt(Instant.now());
      execution.setDurationMs((int) Duration.between(started, execution.getEndedAt()).toMillis());
    }
  }
}

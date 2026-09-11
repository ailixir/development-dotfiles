package com.citi.put.checks.studio.compile;

import com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import com.citi.put.checks.studio.readiness.RuntimePinProperties;
import java.time.Duration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * Wires the compile pipeline and validates its bounds at startup (Story 10.8, AC-19).
 *
 * <p>The bounds are checked here rather than on first use so a deployment that configures an
 * unusable bound fails to start instead of failing its first compile — a pipeline whose budget is
 * shorter than its gateway timeout is misconfigured whether or not anyone has compiled anything
 * yet.
 */
@Configuration
@EnableConfigurationProperties({
  StudioCompileProperties.class,
  StudioRunnerProperties.class,
  RuntimePinProperties.class
})
public class StudioCompileConfig {

  /**
   * Fails startup when a bound, the runner configuration or the artifact-version pin is unusable.
   *
   * @param compile this story's bounds
   * @param gateway 10.5's gateway configuration
   * @param runner the runner endpoint configuration
   * @param pin the configured runtime pin
   * @return a marker bean, so the validation runs during context refresh
   */
  @Bean
  public StudioCompileBoundsValidator studioCompileBoundsValidator(
      StudioCompileProperties compile,
      StudioGatewayProperties gateway,
      StudioRunnerProperties runner,
      RuntimePinProperties pin) {
    compile.validate(gateway);
    runner.validate();
    if (pin.artifactSchemaVersion() != CompilePins.SUPPORTED_ARTIFACT_VERSION) {
      throw new IllegalStateException(
          "studio.runtime.pin.artifact-schema-version is "
              + pin.artifactSchemaVersion()
              + " but this build can only execute artifact schema version "
              + CompilePins.SUPPORTED_ARTIFACT_VERSION
              + ". The pin is a deployment statement of the same fact, not a second opinion.");
    }
    return new StudioCompileBoundsValidator();
  }

  /**
   * The HTTP client for {@code POST /v1/validate}.
   *
   * <p>Deliberately a bare {@link RestClient} over a request factory with explicit connect and read
   * timeouts, and deliberately <em>not</em> a shared, interceptor-laden builder: this call must not
   * inherit a retry, a circuit breaker or a redirect policy that someone adds for an unrelated
   * client. Exactly one call, no retry, a bounded deadline (AC-12a).
   *
   * @param properties the runner endpoint configuration
   * @return the validation client
   */
  @Bean
  public RunnerValidationClient runnerValidationClient(StudioRunnerProperties properties) {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    Duration connect =
        properties.connectTimeout() == null ? Duration.ofSeconds(2) : properties.connectTimeout();
    Duration read =
        properties.validateTimeout() == null
            ? Duration.ofSeconds(10)
            : properties.validateTimeout();
    factory.setConnectTimeout((int) connect.toMillis());
    factory.setReadTimeout((int) read.toMillis());
    return new RunnerValidationClient(
        RestClient.builder().requestFactory(factory).build(), properties);
  }

  /** Marker for the startup bound validation; carries no behaviour. */
  public static final class StudioCompileBoundsValidator {}
}

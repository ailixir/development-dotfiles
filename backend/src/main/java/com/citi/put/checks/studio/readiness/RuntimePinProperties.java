package com.citi.put.checks.studio.readiness;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The configured runtime pin the readiness gate compares against (Story 10.8, AC-25; architecture
 * &sect;4.6, &sect;8.5).
 *
 * <h2>Which terms live here, and why the rest do not</h2>
 *
 * <p>There is <em>one</em> runtime-compatibility rule and it lives in the runner ({@code
 * isCompatible}, story 10.3 AC-7), which revalidates before any browser launch. Re-implementing its
 * ranged Playwright/executor comparison in Java would create exactly the drift {@code
 * ArtifactSchemaDriftTest} exists to prevent — two implementations of one rule, diverging at the
 * first version bump nobody applied twice.
 *
 * <p>So the backend gate holds only the <b>exact-match</b> terms, which are single-value
 * comparisons that cannot drift into a different rule: artifact schema version, validator schema
 * version and syntax reference version. A future reviewer should read the backend gate as
 * deliberately partial, not as incomplete.
 *
 * <p>{@code executorVersion} and {@code playwrightVersion} are configured here for one reason only:
 * &sect;8.1 requires them on a revision's provenance so the runner has something to compare. They
 * are <b>recorded, never compared</b> by this backend.
 *
 * @param artifactSchemaVersion the only artifact envelope version this deployment can execute
 * @param validatorSchemaVersion the accepted-language schema + parser pair, compared exactly
 * @param syntaxReferenceVersion the reference corpus a proposal was made against, compared exactly
 * @param executorVersion recorded on provenance; the runner owns its ranged comparison
 * @param playwrightVersion recorded on provenance; the runner owns its comparison
 */
@ConfigurationProperties(prefix = "studio.runtime.pin")
public record RuntimePinProperties(
    @DefaultValue("1") int artifactSchemaVersion,
    @DefaultValue("2.0.0") String validatorSchemaVersion,
    @DefaultValue("2.0.0") String syntaxReferenceVersion,
    @DefaultValue("2.0.0") String executorVersion,
    @DefaultValue("1.63.0") String playwrightVersion) {}

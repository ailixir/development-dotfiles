package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/**
 * The frozen {@code ConfirmCompileRequest} body (architecture §4.2; {@code
 * docs/specs/studio/openapi.yaml}).
 *
 * <p>Exactly four fields, all required, and every one of them is carried into the conditional
 * {@code UPDATE ... WHERE} of {@link
 * com.citi.put.checks.studio.compile.CompileStateService#confirm} rather than read back and
 * compared in Java. Approving "the candidate" is not the contract; approving <em>this exact
 * revision, with this exact artifact, for this exact source and configuration</em> is.
 *
 * <h2>Not a closed schema</h2>
 *
 * <p>An undeclared extra key is <strong>ignored</strong>, not rejected. ADR-002 §6.2 closes
 * runner-<em>produced</em> bodies, because an open schema over a wire body written by another
 * component is a suggestion; a client-supplied request body carries no such guarantee and rejecting
 * an unknown key here would invent a {@code 400} code the frozen operation does not declare. The
 * annotation states the behaviour explicitly rather than leaving it to a global Jackson default
 * that a future configuration change could flip underneath this route.
 *
 * @param revisionId the revision the author reviewed
 * @param artifactHash its canonical artifact hash, exactly 64 characters
 * @param sourceRevision the draft source revision the author reviewed
 * @param configurationRevision the draft configuration revision the author reviewed
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ConfirmCompileRequestDto(
    @NotNull UUID revisionId,
    @NotNull @Size(min = 64, max = 64) String artifactHash,
    @NotNull Long sourceRevision,
    @NotNull Long configurationRevision) {}

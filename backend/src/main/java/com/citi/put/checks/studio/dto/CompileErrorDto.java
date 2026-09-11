package com.citi.put.checks.studio.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Why a compile attempt ended without a candidate, for a reason that is <strong>not</strong> the
 * author's source (ADR-002 §16.2; architecture §4.7).
 *
 * <p>Non-null only with {@code compileStatus: STALE}, and never non-null at the same time as {@link
 * CompileDiagnosticsDto}.
 *
 * <p><strong>A bounded code and nothing else.</strong> No prompt, no gateway response body, no
 * source text, no stack trace and no resolved value ever reaches this field (§4.3, §9.2). Every
 * condition it names is retryable by the author with no loss: the draft is saved and unchanged, the
 * confirmed revision still runs, and an explicit recompile is the whole remedy.
 *
 * <p>{@code code} stays a free string for the same reason {@code ErrorResponse.error} does; the
 * exhaustive set the deployed API can write is the contract's {@code x-compile-error-codes}
 * (ADR-002 §14.6, §16.4).
 *
 * @param code the bounded, scrubbed failure code
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CompileErrorDto(String code) {}

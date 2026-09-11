package com.citi.put.checks.studio.compile;

/**
 * Payload of a validated compile candidate, stored verbatim as an immutable revision row
 * (Architecture §4.2, §8.1).
 *
 * <p>All JSON fields are canonical JSON documents produced by the compile pipeline (10.8). The CSI
 * and source revision are not part of this record: they are taken from the locked draft row so a
 * revision can never be attributed to a different CSI than the test it belongs to.
 *
 * @param configurationRevision configuration revision the candidate was compiled for
 * @param source ordered {@code originalText} source document
 * @param sourceHash hash over the canonical JSON of the ordered source
 * @param artifact compiled artifact document
 * @param artifactHash hash over the canonical artifact bytes
 * @param artifactSchemaVersion schema version of the artifact document
 * @param configuration nonsecret execution configuration snapshot
 * @param references declared variable/secret references (never resolved values)
 * @param provenance model, prompt, language-policy, syntax-reference, validator, executor and
 *     runtime-compatibility versions
 * @param createdBy principal that produced the candidate
 */
public record CandidateRevision(
    long configurationRevision,
    String source,
    String sourceHash,
    String artifact,
    String artifactHash,
    int artifactSchemaVersion,
    String configuration,
    String references,
    String provenance,
    String createdBy) {}

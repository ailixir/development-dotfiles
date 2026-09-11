package com.citi.put.checks.studio.dispatch;

import java.util.List;
import java.util.UUID;

/**
 * The job envelope the dispatcher sends to the runner (§8.4).
 *
 * <p>It carries declared reference <b>names</b> and never resolved values (§9.2): the runner holds
 * no vault credential and has nothing to do with a value.
 *
 * <p>It carries no approved-target or secret-use policy field. ADR-002 O-6 is still open and SPK-05
 * has not ruled between carrying that policy on the job and enforcing it solely at the egress
 * layer; adding a field to a closed runner-consumed body is §12 Class B, which an architect must
 * rule on first and which a story may propose but not land. Inventing a representation for a policy
 * nobody has specified would be an Article IV violation wearing a schema's clothes. What is
 * decidable today — which policy identity this dispatch ran under — is recorded on the execution
 * instead (AC-13b).
 */
public record RunJob(
    UUID executionId,
    UUID attemptId,
    UUID testId,
    String csiId,
    UUID revisionId,
    String environment,
    List<String> references,
    String callbackBaseUrl) {}

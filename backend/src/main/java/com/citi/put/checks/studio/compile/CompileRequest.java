package com.citi.put.checks.studio.compile;

import java.util.UUID;

/**
 * Identity of a persisted compile request together with the draft revisions it was started for
 * (Architecture §4.2).
 *
 * <p>An asynchronous compile result may only be published while {@code
 * ui_tests.compile_request_id}, {@code ui_tests.source_revision} and {@code
 * ui_tests.configuration_revision} all still equal these values, so an edit made while the compile
 * was in flight discards the result rather than having its mandated {@code STALE} overwritten
 * (AC-8).
 *
 * @param requestId persisted compile request identity
 * @param sourceRevision draft source revision the compile was started for
 * @param configurationRevision draft configuration revision the compile was started for
 */
public record CompileRequest(UUID requestId, long sourceRevision, long configurationRevision) {}

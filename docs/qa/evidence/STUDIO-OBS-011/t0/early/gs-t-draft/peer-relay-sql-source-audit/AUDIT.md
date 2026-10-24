# Peer relay JDBC parameter audit

The archived unit04 fixture contains a source defect in the `/context` relay query at `GuidedServiceTransportFaultIT.java:5561`. The query uses the PostgreSQL JSONB `?` operator and a `session_id=?` placeholder, then passes exactly one `id` argument to `JdbcTemplate.queryForObject(String, Class, Object...)` at line5560.

For a parameterized query, pgjdbc treats each unescaped `?` as a bind marker. Its `??` escape emits a literal `?` without adding a bind. This follows the [tagged pgjdbc42.7.4 Parser source](https://github.com/pgjdbc/pgjdbc/blob/REL42.7.4/pgjdbc/src/main/java/org/postgresql/core/Parser.java#L127-L144). The [tagged Spring6.1.14 JdbcTemplate source](https://github.com/spring-projects/spring-framework/blob/v6.1.14/spring-jdbc/src/main/java/org/springframework/jdbc/core/JdbcTemplate.java#L915-L917) routes this overload through the argument setter. In that branch, the old expression creates two bind positions for one supplied value. The [parameter-list source](https://github.com/pgjdbc/pgjdbc/blob/REL42.7.4/pgjdbc/src/main/java/org/postgresql/core/v3/SimpleParameterList.java#L399-L406) rejects an unset parameter.

`primary-source-witness.json` pins the complete downloaded primary-source hashes and the exact excerpts with actual raw-file line numbers. It also pins cached pgjdbc42.7.4 and Spring JDBC6.1.14 JARs, relevant class-entry hashes, manifest versions, and the cached Boot3.3.5 BOM declaring those versions. This is a static dependency witness; it does not prove which class bytes the actual worker loaded.

The one-character fixture correction is:

```diff
- SELECT NOT (progress ? 'executionEvidence') FROM studio_guided_sessions WHERE session_id=?
+ SELECT NOT (progress ?? 'executionEvidence') FROM studio_guided_sessions WHERE session_id=?
```

Under the documented prepared-query branch, the corrected native SQL retains `progress ? 'executionEvidence'` and uses its sole bind for `session_id`. The JSONB operator, key literal, `NOT`, selected column, table, row predicate, argument, `Boolean.class`, callback condition, and real JDBC query remain intact. A missing key still yields true after `NOT`; a present key, including a JSON null value, still yields false. SQL NULL still yields SQL NULL and retains the existing Java Boolean-unboxing behavior. No `COALESCE`, alternate row default, or swallowed exception is introduced. These are source deductions from the identical PostgreSQL expression, not executed SQL results.

The actual finite unit04 projection reports `DATA_INTEGRITY` at `PEER_RELAY5560` and grouped `UNKNOWN_OUTCOME` at `CLIENT_SEND296`. It contains no SQLState, exception message, request/case join, or first-cause proof. The static defect is independently actionable, but neither the exact observed SQL failure nor the primary failure's cause is recovered. No claim is made that this correction fully remedies the unit.

The package carries complete Session, Lifecycle, and Transport candidates from the exact formatted unit04 archive. Session and Lifecycle are byte exact. Transport differs by the single added ASCII question mark. The verifier checks 80 ordered annotated methods, all751 original assertion expressions, byte-exact unit04 annotated bodies and assertions, the carried99-case catalog, nine Mode variants, 11 sentinel invocations, the unchanged finite-output filter, and exact forward/reverse patches. Patch reversal checks operate on text in memory.

Only this new off-tree directory was written. No product source, main506, migration, authority guard, observation, business assertion, timer, cleanup/completion wait, lock, process, native test, Java/compiler, SQL connection, private evidence body, or prior package was changed or invoked. No source/native/retry release is supplied. All original and later reds, gaps, custody qualifications, Replay/C8/generalW1, lane/IR, and external-input holds remain.

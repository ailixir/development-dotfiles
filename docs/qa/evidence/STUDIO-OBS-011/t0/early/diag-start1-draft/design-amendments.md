# Exact author refinements after initial design

The pre-code design remains `design.md`. The final exact proposal refines its output fields with requestBudgetMs (begin arithmetic) versus budgetMs/budgetObserved (actual original options.claim timeout observed at settlement), separate snapshot and marker write counters, and explicit diagnostic-observer pending count. The closed machine-readable schema is `event-schema.json`.

No separate CLAIM_SEND row is emitted: actual original timeout is retained on CLAIM_SETTLE or CLAIM_ABORT. This keeps the earliest timeline useful within32 records. The24-event/12KiB ordinary-record bound reserves remaining cap for stop/abort/start-settlement/close; any suppressed row marks truncation and remains incomplete diagnosis.

The temporary options.claim own descriptor now restores as soon as all corresponding original requestClaim promises settle, before the initial acquire continuation constructs runtime options by object spread. The existing ownership close still verifies/restores remaining owned descriptors; prototype and instance restoration attempts all execute, without short-circuiting after an earlier refusal. The abort listener remains until the full requestClaim settles, preserving observation of the original timeout race.

Temp removal on write failure requires the exact dev/ino of the descriptor created O_EXCL by that attempt. A pre-existing unowned temp is never deleted. The failure marker is mode/owner/regular checked and opened nonblocking, and snapshot/marker accounting remains wholly synchronous. Review this exact choice for observation overhead before authorizing a run.

The sticky failure marker is fixed at two bytes (rewritten at offset0, never appended). Ledger snapshots reserve those two bytes by enforcing16382 bytes, preserving the combined16KiB cap even when the marker exists. An unexpected oversized pre-existing marker is refused.

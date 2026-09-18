---
name: local-profile-auth-bypass
description: The put-checks `local` test profile injects a checks-admin identity into every request, so authorization assertions silently pass for the wrong reason
metadata:
  type: project
---

In `put-checks/backend`, `LocalDevAuthFilter` is active under the **`local` profile** and sets a
`checks-admin` identity on any request that arrives without one — ahead of
`BffSessionAuthenticationFilter`, so the `X-User-Id` / `X-User-Csi-Ownership` header path is ignored
entirely. A `@SpringBootTest(webEnvironment = RANDOM_PORT) @ActiveProfiles("local")` test that sends
a non-owner identity therefore gets an **administrator**, and every `403` assertion either passes
vacuously or fails confusingly.

**Why:** it exists so `./gradlew bootRun` needs no session cookie. It is not scoped away from tests.

**A second, deeper bypass makes `401` unreachable on any route, in every profile.**
`BffSessionAuthenticationFilter.isCoreServiceBypassed()` returns `true` **unconditionally** (a
hardcoded "temporary" bypass while the platform provides no Core services), so a request carrying no
identity headers at all is handed a `checks-admin` / `platform-admin` identity instead of a `401`.
Turning `checks.local-dev-auth.enabled` off does **not** reach it. This is `ED-02` in
`EPIC-10-EXECUTION.yaml`, `status: open`, and it is what the ~23 failing `*IT` tests in the backend
baseline are failing on. **An acceptance criterion that asks for a `401` cannot be satisfied while
it stands** — record it as a named disabled test with a live sibling asserting the current
behaviour, so the sibling goes red the day the bypass is removed. Do not "fix" the filter as a side
effect of another story.

**How to apply:** for any test that asserts an authorization decision, either use `@ActiveProfiles("test")`
(what `StudioAuthorizationIT` does) or add
`properties = "checks.local-dev-auth.enabled=false"` to the `@SpringBootTest` — the filter is
`@ConditionalOnProperty(..., matchIfMissing = true)`. The tell is a route answering a *downstream*
status (409/200) to a principal who should have been refused, while an unknown id still answers 403
because the id resolves to no CSI at all. Related: [[test-container-and-context-isolation]].

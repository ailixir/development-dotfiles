# BFF Identity Contract — Kickoff Message to Core Team

| Field | Value |
|---|---|
| **Status** | Draft — ready to send |
| **From** | put-checks backend team |
| **To** | `put-platform-shell` Core service team |
| **Purpose** | Satisfy story 1.4 AC-1 (kickoff for BFF identity contract) |
| **Drafted** | 2026-04-17 · @pm (Morgan) |
| **Related story** | `docs/stories/1.4.story.md` |
| **Related spec** | `docs/specs/backend/spec.md §7.1.3` |

---

## Recommended channels

Pick the one your Core team prefers; copy the body below verbatim. Suggested order:

1. **Jira ticket** in the Core team's project with component = `put-platform-shell/auth`. Link this doc.
2. **Slack channel** `#put-platform-shell-dev` (or equivalent) with a short prelude and a link to the Jira ticket.
3. **Follow-up email** only if async Jira/Slack doesn't get a reply within 2 business days.

---

## Message body (paste verbatim)

> **Subject:** Request: sign-off on BFF identity contract for put-checks module backend (blocks M1 walking skeleton)
>
> Hi Core team,
>
> The put-checks backend team is starting M1 (walking skeleton) and needs your sign-off on the shape of the identity and permission payloads Core emits to module backends. This is captured as story 1.4 in our EPIC-01 execution manifest and is explicitly gating story 1.5 (BFF auth filter) and every downstream `@PreAuthorize` wiring.
>
> **Context we've already aligned on** (per your `put-platform-shell/docs/content/docs/architecture/authentication.md`):
> - We use the BFF session cookie model. Module backends **do not** validate COIN OIDC JWTs directly.
> - Module backends call Core's introspection endpoints (`GET /api/v1/users/me`, `POST /api/v1/authz/check`) on each inbound request, caching results per-request.
> - The `put_session` cookie is opaque and owned by Core.
>
> **What we need from you (5 open questions)** — once answered, we commit a machine-checkable contract doc at `put-checks/docs/specs/backend/bff-identity-contract.md` that we'll reference in every story touching authz.
>
> 1. **`csi_ownership` shape.** Is it a flat list of CSI IDs (`["174523","99887"]`), a list of `{csi_id, role}` objects, or a nested org-context tree (cf. `put-platform-shell/RBAC.md §8.2`)? If role-bearing: what's the role vocabulary (`owner`/`contributor`/`viewer`/…)?
> 2. **Permission-name namespacing.** What's the canonical format for `POST /api/v1/authz/check` permission names? (e.g., `checks.monitors.edit`, `checks:bulk:execute`, `put-checks.bulk.execute`.) Who owns the registry of valid permission names?
> 3. **Role claim propagation.** Does `/users/me` return a `roles: []` array? If yes, what's the vocabulary (`checks-admin`, `platform-admin`, `checks-operator`, …)? If no, is role check only possible via `/authz/check`?
> 4. **Cookie scope for separate-origin deployments.** If put-checks backend is served from a different origin than the shell (e.g., `put-checks.citigroup.com` vs `put.citigroup.com`), is `put_session` domain-scoped to cover both, or does the module backend sit behind the shell's nginx (same-origin)? What deployment topologies do you support?
> 5. **Core error envelope.** On 401 from `/users/me`, does Core return JSON like `{"detail":"Unauthorized"}` or a richer envelope? What about 5xx? Our filter needs a stable shape to differentiate "session invalid" (→ propagate 401 to client, FE redirects to login) from "Core unavailable" (→ 503 to client; per your `AUTH_FLOW.md` rules we do NOT fall back to demo/mock mode).
>
> **Our proposed working session shape** (pick what works for you):
> - Option A: 30-minute sync call with your tech lead — we walk the 5 questions, capture decisions live.
> - Option B: async — reply in the Jira ticket with answers; we draft the contract doc + schemas; you review the PR and sign off.
>
> **Timeline pressure:** story 1.5 cannot start implementation until the contract is signed off. Every day of delay is a day of idle dev time. Our M1 target is ~4-5 weeks; starting the auth filter more than ~3 days late starts eating the milestone.
>
> **What "sign-off" looks like:** you approve a PR that adds `bff-identity-contract.md` to our repo; the PR body references the decisions you gave us; one of your engineers is named on the sign-off line. Our story 1.4 AC-3 requires that attribution.
>
> Thanks — happy to adjust this flow if your team has a preferred pattern for contract work with module teams.
>
> — put-checks backend team (via @pm)

---

## What to do with the replies

Once the Core team responds (via any channel), the @dev owner of story 1.4:

1. Captures the answers in `docs/specs/backend/bff-identity-contract.md` per AC-2 (prose summary, JSON Schema for `/users/me`, JSON Schema for `/authz/check`, worked examples, cookie scope decision, error envelope, evolution policy).
2. Adds a `DRAFT` banner at the top of the file until sign-off (per @po note N-1.4-1).
3. Builds `FakeCoreServiceClient` (test double) producing payloads that validate against the schemas (AC-4).
4. Adds `CoreContractComplianceTest` validating fake output against the schemas (AC-5).
5. Updates `spec.md §7.2.3`, `requirements.json` FR-AUTH-\*, and flips `EPIC-01-EXECUTION.yaml` R-08 to `mitigated` (AC-6/7/8).
6. Removes the DRAFT banner and appends the sign-off line only after a named Core engineer approves the final PR.

Until AC-3 lands (signed off), the hard gate on story 1.5 remains in effect.

---

## Escalation path

If no reply within 5 business days:

1. Escalate to the Core team's manager via the Jira ticket.
2. If still no reply at 10 business days: @pm raises in the platform-leadership standup with a one-page risk summary citing the cost per day of M1 delay.

This outreach document itself becomes the artifact of the attempt, even if coordination stalls — future retrospectives can cite it as the ask that was made and when.

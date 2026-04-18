# BFF Identity-Propagation Contract

> **STATUS: DRAFT — provisional shape, awaiting Core-team sign-off.**
> Do NOT treat the schemas below as authoritative until the sign-off line at the bottom is filled in.
> Story 1.5 may proceed against this DRAFT shape in dev/staging only. Production cutover is gated on AC-3 sign-off.

---

## 1. Summary

The `put-checks` backend authenticates users via BFF session cookies managed by the `put-platform-shell` Core service. There is no direct OIDC/JWT validation in this module (see DEBT-04). Instead:

1. Every request carries a `put_session` cookie set by the platform shell.
2. The checks backend calls `GET /api/v1/users/me` on the Core service, forwarding the cookie, to obtain the authenticated user's identity.
3. For fine-grained permission checks, the backend calls `POST /api/v1/authz/check` on the Core service.
4. If the cookie is missing or the Core service returns 401, the checks backend returns 401 to the client — the frontend redirects to the platform login page.

---

## 2. GET /api/v1/users/me — User Identity

### JSON Schema (Draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://put.citi.com/checks/contracts/users-me.schema.json",
  "title": "GET /api/v1/users/me Response",
  "type": "object",
  "required": ["user_id", "email", "name", "roles", "csi_ownership"],
  "properties": {
    "user_id": {
      "type": "string",
      "description": "Unique user identifier (typically the corporate email)."
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "User's corporate email address."
    },
    "name": {
      "type": "string",
      "description": "Display name."
    },
    "department": {
      "type": "string",
      "description": "Organizational unit. Optional — may be absent for service accounts."
    },
    "roles": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Platform-level roles. Known values: checks-admin, checks-operator, platform-admin."
    },
    "csi_ownership": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["csi_id", "role"],
        "properties": {
          "csi_id": {
            "type": "string",
            "description": "CSI system identifier."
          },
          "role": {
            "type": "string",
            "enum": ["owner", "contributor", "viewer"],
            "description": "User's relationship to this CSI system."
          }
        },
        "additionalProperties": false
      },
      "description": "List of CSI systems the user has access to, with their role per system."
    }
  },
  "additionalProperties": true
}
```

### Worked Example

```json
{
  "user_id": "alice@citi.com",
  "email": "alice@citi.com",
  "name": "Alice Brown",
  "department": "Global Ops",
  "roles": ["checks-operator"],
  "csi_ownership": [
    { "csi_id": "174523", "role": "owner" },
    { "csi_id": "99887", "role": "contributor" }
  ]
}
```

---

## 3. POST /api/v1/authz/check — Permission Check

### Request Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://put.citi.com/checks/contracts/authz-check-request.schema.json",
  "title": "POST /api/v1/authz/check Request",
  "type": "object",
  "required": ["permission"],
  "properties": {
    "permission": {
      "type": "string",
      "description": "Dot-delimited permission name (e.g., checks.monitors.edit, checks.bulk.execute)."
    },
    "resource": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "description": "Resource type (e.g., csi, check)."
        },
        "id": {
          "type": "string",
          "description": "Resource identifier."
        }
      },
      "additionalProperties": false,
      "description": "Optional resource context for resource-scoped permission checks."
    }
  },
  "additionalProperties": false
}
```

### Response Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://put.citi.com/checks/contracts/authz-check-response.schema.json",
  "title": "POST /api/v1/authz/check Response",
  "type": "object",
  "required": ["allowed"],
  "properties": {
    "allowed": {
      "type": "boolean",
      "description": "Whether the permission is granted."
    },
    "reason": {
      "type": "string",
      "description": "Human-readable explanation when denied. Absent when allowed=true."
    }
  },
  "additionalProperties": false
}
```

### Worked Examples

**Allowed:**
```json
// Request
{ "permission": "checks.monitors.edit", "resource": { "type": "csi", "id": "174523" } }
// Response
{ "allowed": true }
```

**Denied:**
```json
// Request
{ "permission": "checks.bulk.execute", "resource": { "type": "csi", "id": "99887" } }
// Response
{ "allowed": false, "reason": "User has contributor role on CSI 99887; bulk execute requires owner." }
```

---

## 4. Cookie Scope

| Attribute | Value | Notes |
|-----------|-------|-------|
| **Name** | `put_session` | Set by platform shell login flow |
| **Domain** | `.citigroup.com` (PROVISIONAL) | Covers same-origin and separate-origin topologies. Core team to confirm. |
| **Path** | `/` | All paths under the domain |
| **SameSite** | `Lax` | Allows top-level navigations; blocks cross-site POST |
| **Secure** | `true` | HTTPS only |
| **HttpOnly** | `true` | Not accessible to JavaScript |

### Deployment Topologies

1. **Same-origin (behind platform nginx):** `put.citigroup.com/api/checks/...` — cookie naturally scoped, no CORS needed.
2. **Separate-origin (module API):** `put-checks.citigroup.com/api/...` — requires domain-scoped cookie (`.citigroup.com`) and CORS configuration on the checks backend.

Core team to confirm which topology is targeted for production.

---

## 5. Error Envelope

The Core service returns a consistent error envelope on non-2xx responses:

```json
{
  "error": "<error_code>",
  "detail": "<human_readable_message>"
}
```

| HTTP Status | `error` value | `detail` (example) | Filter action |
|-------------|---------------|---------------------|---------------|
| 401 | `unauthorized` | `Session expired or invalid` | Return 401 to client (FE redirects to login) |
| 403 | `forbidden` | `Insufficient permissions` | Return 403 to client |
| 500 | `internal_error` | `Internal server error` | Return 503 to client (Core unavailable) |
| 502/503/504 | `service_unavailable` | `Core service temporarily unavailable` | Return 503 to client |

The filter distinguishes "session invalid" (401 → redirect to login) from "Core unavailable" (5xx → 503, no fallback per AUTH_FLOW.md §Error handling rules).

---

## 6. Evolution Policy

- **Additive fields** (new properties in response objects): backward-compatible, no version bump needed. Consumers MUST tolerate unknown fields (`additionalProperties: true` on the users/me schema).
- **Breaking changes** (removed fields, type changes, enum value removal): require a version bump in the URL path (`/api/v2/users/me`) and a deprecation period of at least one release cycle.
- **New enum values** in `csi_ownership.role`: additive. Consumers SHOULD handle unknown role values gracefully (treat as `viewer` for access-control purposes until the new role's semantics are documented).
- **Version header:** none planned for v1. If multi-version support is needed, the URL path approach is preferred over `Accept` header versioning.

---

## Q&A Appendix

_(Capture additional questions and answers from the Core-team coordination here.)_

---

## Sign-off

**Signed off by:** _(pending — Core-team engineer name + date)_

**Approval artifact:** _(pending — PR comment URL or Jira/Confluence ID)_

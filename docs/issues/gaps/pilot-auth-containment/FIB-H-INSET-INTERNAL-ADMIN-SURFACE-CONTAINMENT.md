# FIB-H INSET — Internal Admin Surface Containment Intent

**applies_to:** `FIB-H-PILOT-AUTH-CONTAINMENT-001`  
**status:** APPROVED INSET  
**date:** 2026-05-11  
**purpose:** Clarify the intended scope boundary of the pilot admin review surface

---

# Context

The pilot authentication containment model introduces an internal review surface for approving or rejecting pilot access requests.

Without explicit scope boundaries, this surface risks expanding into:

- a generalized admin platform
- user-management infrastructure
- invitation-management workflows
- RBAC administration
- CRM tooling
- operational analytics dashboards

This inset exists to freeze the intended scope before implementation begins.

---

# Core Decision

The internal admin surface is:

```text
pilot containment infrastructure
```

It is NOT:

```text
a production administrative platform
```

---

# Intended Purpose

The surface exists solely to:

1. review pilot access requests
2. approve or reject pilot participation
3. insert/remove allowlist entries
4. support controlled production access during pilot stage

The surface is an operational airlock.

Nothing more.

---

# Canonical Mental Model

Correct framing:

```text
temporary pilot airlock
```

Incorrect framing:

```text
multi-tenant administrative subsystem
```

---

# Minimal Functional Surface

The surface should remain intentionally small.

Expected functionality:

| Capability | Allowed |
|---|---|
| View pending requests | YES |
| Approve request | YES |
| Reject request | YES |
| Insert allowlist row | YES |
| Revoke allowlist access | YES |
| Add internal notes | YES |

---

# Explicitly Rejected Expansion

The following are OUT OF SCOPE for this surface:

- generalized admin dashboard
- analytics
- operator-management center
- tenant-management framework
- invitation lifecycle orchestration
- resend workflows
- approval chains
- seat management
- organization hierarchy management
- audit command center
- customer-support tooling
- CRM pipeline management
- enterprise RBAC administration
- permissions editor
- admin shell architecture
- moderation platform abstractions

If any become necessary, they require a separate FIB.

---

# UX Guidance

The surface should optimize for:

```text
speed
clarity
operational containment
```

not:

```text
product polish
platform extensibility
```

A table and a few actions are sufficient.

The implementation should remain intentionally utilitarian.

---

# Route Guidance

Recommended protected routes:

```text
/internal/pilot-access
```

or:

```text
/admin/pilot-access
```

Protection may initially be:

- authenticated session
- hardcoded owner/admin email check

A full RBAC system is not required for pilot scope.

---

# Architectural Constraint

The admin review surface must remain:

```text
operationally adjacent
```

to the authentication containment feature.

It must NOT become a new bounded context.

No new admin domain should emerge from this slice.

---

# Expansion Trigger Rule

Expansion beyond the contained pilot-review utility is permitted only if:

1. multiple admins require coordinated review
2. delegated property-level onboarding becomes necessary
3. customer account administration becomes externally exposed
4. formal operational support workflows emerge
5. pricing/subscription administration becomes active

Until then:

> keep the surface deliberately small.

---

# One-Line Invariant

If the admin review surface begins resembling a generalized SaaS administration platform, the pilot containment boundary has been violated.

## PRD-060: Company Registration & First Property Bootstrap — Delivery Precis

### What Changed

Previously, `rpc_bootstrap_casino` auto-created a synthetic company row copied from the casino name. Now, operators must explicitly register their company before bootstrapping their first casino — a two-step flow that establishes real company identity.

### Flow (Before → After)

**Before:** Sign in → `/bootstrap` → casino created with synthetic company name

**After:** Sign in → `/register` (new) → enter company name + optional legal name → `/bootstrap` → casino created under registered company

### Artifacts Delivered (20 files across 7 workstreams)

**Database (3 migrations)**
- `onboarding_registration` table with RLS, partial unique index (one pending per user), SELECT-only grants
- `rpc_register_company` — SECURITY DEFINER RPC (auth-flow exception, ADR-018) creates company + pending registration atomically
- `rpc_bootstrap_casino` amended — resolves company from registration (ADR-024 INV-8), marks consumed, raises P0002 fail-closed if no registration (ADR-030)

**Service Layer (`services/company/`)**
- New `CompanyService` bounded context: dtos, schemas, crud, keys, http, index
- `CompanyErrorCode` added to domain errors (REGISTRATION_CONFLICT → 409, REGISTRATION_NOT_FOUND → 404, BOOTSTRAP_NO_REGISTRATION)

**Frontend (5 files)**
- `/register` page — server component with auth guard + registration page guard
- `RegisterForm` — client component with `useActionState`, Card border-2, CONFLICT error handling
- Server action with `withServerAction({ skipAuth: true })`
- `/start` gateway — amended routing: no staff + pending → `/bootstrap`, no staff + no registration → `/register`
- `/bootstrap` page guard — redirects to `/register` if no pending registration

**Security Governance (3 files)**
- `rpc_register_company` added to SEC-004 public execute allowlist and SEC-006 context-first-line allowlists (SQL + shell)

**Tests (4 files)**
- RPC contract type assertions + mocked CRUD unit tests
- Playwright E2E spec: 5 scenarios (happy path, 2 URL bypass, CONFLICT, required-fields-only)

### Architecture Compliance

| ADR | Compliance |
|-----|-----------|
| ADR-024 INV-8 | No client-carried `company_id` — resolved server-side |
| ADR-018 | SECURITY DEFINER governance, auth-flow exception documented |
| ADR-030 | Fail-closed — P0002 if no pending registration |
| ADR-043 | Synthetic auto-create (D4) superseded |

### Known Limitations (per EXEC-SPEC risk register)

- Re-registration after consumed row creates a new company (not a retry of the original)
- No TTL/cleanup for abandoned pending registrations (one per user, tolerable)
- Bootstrap retry after lost response requires fresh registration path
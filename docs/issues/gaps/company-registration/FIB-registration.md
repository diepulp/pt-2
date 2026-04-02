# Feature Intake Brief

## A. Feature identity
- Feature name: Company Registration and First Property Bootstrap
- Feature ID / shorthand: FIB-COMPANY-REG-v0
- Related wedge / phase / slice: Foundational onboarding / tenant formation / current slice
- Requester / owner: Vladimir Ivanov
- Date opened: 2026-04-01
- Priority: P0
- Target decision horizon: current pilot-bound onboarding slice

## B. Operator problem statement
An operator setting up PT-2 cannot currently register the actual business entity that is buying and operating the product. The system silently invents a synthetic company from the casino name, which is wrong when one company may own multiple properties and leaves legal identity uncollected. As a result, onboarding forms the tenant incorrectly and teaches the wrong business model from the first step.

## C. Pilot-fit / current-slice justification
This belongs in the current slice because onboarding cannot form a correct tenant without it. The current flow creates a casino and quietly manufactures a fake company behind it, which is sufficient only for plumbing and fails as business identity. Without explicit company registration, the first property is attached to a synthetic parent, company metadata remains incomplete, and the onboarding path cannot truthfully reflect the Company → Casino model.

## D. Primary actor and operator moment
- Primary actor: initial company admin / operator performing first-time setup
- When does this happen?: during first-time product registration and bootstrap
- Primary surface: onboarding registration flow
- Trigger event: a new customer signs up and needs to establish their business and first property in PT-2

## E. Feature Containment Loop
1. Initial company admin starts onboarding → system presents a company registration step before casino bootstrap.
2. Initial company admin enters Company Name and optional Legal Name → system validates and creates a real company record.
3. System stores the created company context for onboarding → system advances to first-property bootstrap.
4. Initial company admin enters first casino/property details (casino name, timezone, gaming day start) → system creates the casino under the already-created company.
5. System completes bootstrap using the registered company rather than auto-creating a synthetic one → system lands the user in the existing post-bootstrap setup/dashboard flow.
6. Existing tenant with a synthetic company later visits settings → system allows company name and legal name to be viewed and corrected.
7. System preserves the one-company / one-initial-property onboarding boundary → system does not expose self-serve sister-property creation in this slice.

## F. Required outcomes
- A real company entity is registered explicitly before the first casino is created.
- Company name is captured independently from casino/property name.
- Legal name can be captured during onboarding, even if optional.
- First-property bootstrap attaches to the registered company instead of creating a synthetic company.
- Existing tenants with synthetic company rows can correct company metadata after onboarding.
- The onboarding flow teaches the correct Company → Casino relationship to the user.
- The feature remains limited to first company registration and first property bootstrap only.

## G. Explicit exclusions
- Self-serve “add sister property” flow.
- Payment, billing, pricing, quoting, invoicing, or subscription expansion workflow.
- Demo request flow, contact-sales flow, or sales-assist choreography.
- Cross-property management UI beyond preserving the model boundary.
- New enterprise console or new top-level property-management surface.
- Tax ID, billing contact, corporate address, or broader compliance profile collection.
- Marketing-site lead capture or CRM integration.
- Reworking PRD-051 cross-property behavior beyond keeping company identity correct.

## H. Adjacent ideas considered and rejected
| Idea | Why it came up | Why it is out now |
|---|---|---|
| Self-serve add-property workflow | Company is canonically multi-property capable | Additional property creation implies separate payment/provisioning workflow that does not exist yet |
| Demo-gated onboarding / contact sales | Similar B2B SaaS products often hide setup behind sales-led motion | No sales function exists, and registration plumbing is required regardless |
| Inline company fields inside casino bootstrap only | Faster and simpler to ship | Conflates company registration with property creation and muddies the Company → Casino boundary |
| Full company verification/profile collection | Legal/business identity naturally suggests more fields such as tax ID, billing contact, and address | Deferred because initial scope is tenant formation, not business verification or billing approval; adding these fields would introduce verification policy, data-handling obligations, and approval workflow not defined in this slice |

## I. Dependencies and assumptions
- The canonical domain model is Company → Casino (1:N), with company as purchasing/legal parent and casino as operational property.
- Existing schema already contains `company(id, name, legal_name, created_at)` and `casino.company_id`.
- Current bootstrap flow auto-creates a synthetic company and must be amended to accept an already-created company context.
- Existing onboarding/dashboard flow after bootstrap can remain in place.
- Additional property provisioning is intentionally deferred because commercial workflow is not yet defined.

## J. Out-of-scope but likely next
- Controlled post-onboarding company settings for richer business metadata.
- Additional property provisioning flow under an existing company once payment/entitlement rules exist.
- Company-level billing/subscription workflow.

## K. Expansion trigger rule
Amend this brief if any downstream artifact proposes:
- self-serve creation of a second property,
- payment or subscription workflow,
- new sales/demo lead-routing behavior,
- a new top-level company-management surface beyond onboarding and minimal settings correction,
- any new actor or workflow outside first company registration and first-property bootstrap.

## L. Scope authority block
- Intake version: v0
- Frozen for downstream design: Yes
- Downstream expansion allowed without amendment: No
- Open questions allowed to remain unresolved at scaffold stage:
  - whether legal_name is optional or required for MVP
  - where onboarding stores temporary company context between steps
  - whether legacy synthetic-company correction is handled via settings only or via first-login prompt
- Human approval / sign-off: Vladimir Ivanov / 2026-04-01
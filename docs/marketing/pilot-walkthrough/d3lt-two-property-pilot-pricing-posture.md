# d3lt Pilot Pricing Posture — Two-Property Washington Card Room Prospect

**Document type:** one-page commercial posture  
**Use case:** first vendor walkthrough / pricing question handling  
**Status:** internal baseline, not a public price sheet  
**Prospect context:** two Washington properties; assume Washington commercial card-room scale. Current WSGC public licensing language indicates commercial card-game licensees may not operate more than **15 card tables** per establishment. Therefore, model the pilot as **up to 30 licensed tables across two properties** unless the prospect confirms a smaller active-table footprint.

---

## 1. Pricing Position

d3lt should not be priced as “player tracking software.”

The product has grown into an operational platform covering:

- floor operations and player/session tracking
- cash accountability and financial event provenance
- staff, table, player, and gaming-day attribution
- compliance/audit-supporting records
- CRM / loyalty surfaces
- admin configuration
- reporting and operational intelligence preview

Therefore, pricing should be based on:

```text
property count + table scale + active modules + implementation effort + historical data scope
```

Not a flat per-user fee.

## Pilot anchor:
$20,000 fixed-fee / 90 days

Conversion:
Pilot fee partially credited toward first annual contract if signed within 30–60 days

Annual anchor:
$72,000/year for two properties
Core Ops + Player Tracking + Financial Accountability + Audit/Review + Reporting Preview

Not included:
Historical migration
Custom integrations
Production-grade BI replacement
Hardware/cage/accounting integrations

---

## 2. Walkthrough Answer if Asked “How Much?”

> "A bounded pilot subscription for a two-property regulated operator, discounted for early maturity, not a proven market-clearing price. “This is a conservative enterprise pilot anchor for the deployment burden and operational scope.”

Use this answer:

> “We price by deployment scope rather than a flat user fee, because d3lt can be used as a player-tracking replacement, an accountability layer, or a broader operating platform. For an early two-property pilot, the cleanest structure is a fixed-scope pilot covering defined workflows and modules, then converting to an annual modular subscription once we know what you actually want to keep active.”

Follow with:

> “For this conversation, I would model the pilot around two properties, table count, selected modules, onboarding effort, and whether historical data import is part of the evaluation.”

This avoids sounding unprepared while preserving pricing flexibility.

If the Buyer challanges pricing:

> “The pilot price is not based on a generic per-seat SaaS model. It is based on deployment scope: two properties, table count, operational workflows, onboarding, and selected modules. We are also intentionally discounting the early pilot because the reporting and intelligence layer should be validated against live workflows and historical data before being priced as a mature analytics module.”

---

## 3. Recommended Pilot Baseline

### Suggested commercial anchor

```text
Pilot term:                 90 days
Included scope:             2 properties, up to 30 licensed tables total
Pilot setup/configuration:  $7,500–$12,500 one-time
Pilot subscription:         $3,500–$5,500 per month
Recommended quote anchor:   $9,500 setup + $4,500/month
Total 90-day pilot anchor:  $23,000
```

This should be presented as an **early partner pilot structure**, not final public pricing.

### What the pilot includes

- Core floor operations
- player/session/rating workflow
- table configuration
- staff/admin configuration
- financial accountability workflow where currently operational
- review/audit trail surfaces
- management reporting preview
- operational intelligence preview / beta
- limited onboarding and workflow configuration

### What the pilot does not automatically include

- full historical data migration
- custom integrations
- accounting/reconciliation integrations
- external event feeds
- custom compliance report generation
- production-grade BI replacement
- multi-property enterprise customization beyond the two-property pilot scope

*BI* = Business Intelligence.
Software/reporting systems used for dashboards, analytics, metrics, trends, and decision support. “Production-grade BI replacement” means a mature enterprise analytics platform like Tableau/Power BI-style reporting, not just a few operational reports inside d3lt.

Commmercial Language: 
> “Historical data work has three stages. First is feasibility: reviewing sample exports and determining whether the data maps cleanly to d3lt. Second is sanitization and mapping: cleaning, normalizing, and resolving inconsistencies in the legacy data. Third is migration: loading validated records into the system. The migration itself may be straightforward once the data is clean, but the sanitization effort cannot be priced until we inspect the source data.”
---

## 4.Historical Data Mapping & Migration SOW

Historical data wiring should be a separate line item.

Do not include it casually in the pilot subscription.

Recommended structure:

```text
Historical data discovery:  $2,500–$5,000
Historical data import:     quoted after file/sample review
Expected import range:      $5,000–$20,000 depending on format, volume, and data quality
```

Buyer-facing language:

> “Historical data makes the reporting and intelligence layer more property-specific, but it has to be scoped after we inspect the available exports. We would not bundle that blindly into the base pilot.”

This protects against CSV hell, legacy export weirdness, and unbounded mapping work.

## Historical Data Migration Boundary

Historical data migration is not included in the initial walkthrough or base pilot price.

It requires a separate feasibility assessment because effort depends on:

- whether the vendor can provide exports at all
- export format: CSV, Excel, database dump, API, report extract
- field completeness
- player identity matching
- table/session/rating history structure
- financial transaction history structure
- timestamp and gaming-day consistency
- whether legacy values can be trusted or only imported as reference history
- mapping compatibility with d3lt’s data model
- cleanup, deduplication, and validation effort

Recommended process:

1. Vendor provides sample exports or schema documentation.
2. d3lt reviews field structure and data quality.
3. d3lt identifies which records are importable, partially importable, or unsuitable.
4. d3lt produces a migration feasibility note.
5. If feasible, migration is quoted as a separate SOW.

Until that assessment is complete, historical migration should be described as:

> “available after data review, quoted separately.”

---

## 5. Modular Subscription Direction After Pilot

After the pilot, convert to annual modular subscription.

Recommended packaging:

| Module | Buyer-facing value | Pricing posture |
|---|---|---|
| Core Operations | floor, table, player, session, rating workflow | base subscription |
| Financial Accountability | buy-ins, cash-outs, adjustments, fills/credits context, attribution | add-on / premium module |
| Compliance & Audit | MTL/threshold visibility, reviewable records, traceability | add-on |
| CRM / Loyalty | player CRM, loyalty ledger, comps/coupons | add-on |
| Reporting | shift/gaming-day operating brief | add-on or included in higher tier |
| Operational Intelligence Preview | anomaly/baseline layer, historical comparison | beta during pilot; priced after validation |
| Admin / Configuration | property setup, game settings, users, thresholds | included platform layer |

The monolith can remain technically monolithic for now. The commercial model should still be modular.

Pricing should follow value boundaries, not code boundaries.

---

## 6. Suggested Post-Pilot Pricing Direction

Do not quote this as final during the first walkthrough, but use it internally as a sanity range.

```text
Two-property annual subscription:
  Core only:                         $36k–$60k/year
  Core + Accountability + Audit:     $60k–$90k/year
  Platform bundle:                   $90k–$140k/year
  Historical migration / integration: separate SOW
```
**SOW** = Statement of Work.
> A scoped contract/addendum that defines a specific custom job: what will be done, timeline, deliverables, assumptions, and price. In your case: historical data migration/import should be a separate SOW because effort depends on export format, data quality, mapping, cleanup, and validation.



For this prospect, the likely realistic path is:

```text
Pilot → Core Operations + Accountability → Reporting → Intelligence validation
```

Not:

```text
Sell the entire platform immediately
```

---

## 7. Discount / Early Partner Logic

For the first serious pilot, discount deliberately but do not apologize.

Acceptable levers:

- waive part of setup in exchange for referenceability
- include intelligence preview during pilot
- include limited training
- lock pilot pricing for 90 days only
- offer post-pilot credit if they convert annually

Avoid:

- unlimited support
- unlimited historical migration
- custom reporting promises
- “we will build whatever you need”
- permanent underpricing because this is the first vendor

Suggested wording:

> “For early pilot partners, we can be flexible on pilot economics, but the scope has to be clear. The goal is to validate fit, not create an unlimited custom build.”

---

## 8. Pricing Boundaries

### Safe to include in pilot price

- two-property setup
- up to 30 licensed tables
- staff/admin setup
- core floor workflow
- player/session/rating tracking
- financial accountability where already operational
- reporting/intelligence preview
- limited training

### Price separately

- historical data migration
- custom integrations
- custom reports
- accounting exports
- regulatory filing automation
- hardware integration
- dedicated support SLA
- bespoke feature development

---

## 9. Final Recommended Position

For the first vendor walkthrough, do not present a finished price sheet.

Present a **pilot pricing posture**:

> “For a two-property Washington card-room operator, we would likely structure this as a fixed-scope 90-day pilot. The baseline would be roughly a setup fee plus monthly pilot subscription, with historical data migration scoped separately. After the pilot, we would convert to a modular annual subscription based on the workflows and modules that proved valuable.”

Recommended internal anchor:

```text
$9,500 setup + $4,500/month for 90 days
= $23,000 pilot baseline
```

Negotiation floor:

```text
$5,000 setup + $3,000/month
= $14,000 90-day pilot
```

Do not go below that unless there is a clear strategic trade: reference customer, testimonial, data access, or strong conversion probability.

The pilot should sell the operational core.

The intelligence layer should be included as a preview, not priced as mature platform value until it is validated against live workflows and historical property data.

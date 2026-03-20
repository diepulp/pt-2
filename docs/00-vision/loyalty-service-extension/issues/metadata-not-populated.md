---
title: "Entitlement Metadata Not Populated"
severity: P0
status: open
date: 2026-03-19
affects: issueEntitlement() → CATALOG_CONFIG_INVALID on every attempt
references:
  - EXEC-052 WS2 (issueEntitlement spec)
  - PRD-052 §7.3 (no tier derivation for pilot)
  - services/loyalty/promo/crud.ts:692-713
  - components/admin/loyalty/rewards/tier-entitlement-form.tsx
---

# Entitlement Metadata Not Populated

## Symptom

Issuing any entitlement reward from the Player 360 drawer fails with:

> Issuance Failed — Reward "Match Play" is missing required commercial values in metadata (face_value_cents, instrument_type)

Error code: `LOYALTY_CATALOG_CONFIG_INVALID` (400)

## Root Cause

`issueEntitlement()` reads commercial values from `reward_catalog.metadata` JSONB:

```
reward.metadata.face_value_cents   → required (number)
reward.metadata.instrument_type    → required (string: 'match_play' | 'free_play')
reward.metadata.match_wager_cents  → optional (number)
```

**Nothing writes to that field.** The metadata column defaults to `{}` (empty JSONB).

### The disconnect

| What writes | Where it writes | What issuance reads |
|---|---|---|
| `CreateRewardDialog` | `reward_catalog.{code, name, kind, family}` — metadata untouched | — |
| `TierEntitlementForm` | `reward_entitlement_tier` child table rows with `benefit: { face_value_cents, instrument_type }` | — |
| `issueEntitlement()` | — | `reward_catalog.metadata` (parent JSONB) |

The tier form writes to the **child table**. Issuance reads from the **parent's metadata JSONB**. Nothing bridges them.

### Why it happened

EXEC-052 WS2 specified: "Read frozen commercial values from `reward.metadata` (JSONB)." The intent was that these would be pre-populated during catalog setup. But the admin UI was built without a metadata editor for these specific fields, and the `TierEntitlementForm` saves to `reward_entitlement_tier` (the structurally correct place) rather than duplicating into metadata.

## Fix Options

### Option A: Bridge on tier save (quick unblock)

When `TierEntitlementForm` saves tiers, also write the first tier's values into `reward_catalog.metadata`:

```typescript
// In updateReward() call from TierEntitlementForm.handleSave():
await updateReward.mutateAsync({
  id: reward.id,
  entitlementTiers: entitlementTiers,
  metadata: {
    face_value_cents: entitlementTiers[0].benefit.face_value_cents,
    instrument_type: entitlementTiers[0].benefit.instrument_type,
    match_wager_cents: null,
  },
});
```

**Pro**: Minimal change, unblocks immediately.
**Con**: Metadata is a denormalized copy. Picking "first tier" is arbitrary when multiple tiers exist.

### Option B: Read from entitlementTiers with player tier lookup (correct fix)

Change `issueEntitlement()` to read from `reward.entitlementTiers` (already fetched by `getReward()`) using the player's current tier to select the matching row:

```typescript
// In issueEntitlement():
const playerLoyalty = await getBalance(params.playerId, casinoId);
const playerTier = playerLoyalty?.tier ?? 'bronze';
const tierConfig = reward.entitlementTiers.find(t => t.tier === playerTier);
if (!tierConfig) throw new DomainError('CATALOG_CONFIG_INVALID', ...);
const faceValueCents = tierConfig.benefit.face_value_cents;
const instrumentType = tierConfig.benefit.instrument_type;
```

**Pro**: Uses the structurally correct data source. Tier-aware. Closer to eventual auto-derivation.
**Con**: Requires knowing player tier at issuance time (one extra query, but `getBalance()` already exists).

### Option C: Add metadata fields to admin UI

Add `face_value_cents` and `instrument_type` inputs to the reward detail page for entitlement rewards, writing directly to `reward_catalog.metadata`.

**Pro**: Makes the data requirement explicit to the admin.
**Con**: Duplicates what `TierEntitlementForm` already captures. Admin must fill in two places.

## Recommendation

**Option B** is the correct fix. It eliminates the metadata-as-data-source antipattern, uses the data where it actually lives (`reward_entitlement_tier`), and enables tier-aware issuance. The additional `getBalance()` call is negligible — `issueComp()` already makes this call for its balance check.

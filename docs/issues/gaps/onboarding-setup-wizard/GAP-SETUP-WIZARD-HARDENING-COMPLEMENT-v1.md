---
title: "Setup Wizard Hardening — Complement to GAP-SETUP-WIZARD-CONSOLIDATED-v2"
doc_type: "complement"
version: "v1.0"
status: "draft"
created_at: "2026-02-16"
timezone: "America/Los_Angeles"
relates_to:
  - "GAP-SETUP-WIZARD-CONSOLIDATED-v2.md"
---

# Setup Wizard Hardening — Complement

This document complements **GAP-SETUP-WIZARD-CONSOLIDATED-v2.md** by translating the observed gaps into a *robust wizard* posture: step-level invariants, validation rules, idempotent server actions, resumability, and clear dependency cues.

---

## What “robust wizard” means

A robust wizard does **not** merely “collect inputs.” It must:

- Compute a **safe path** (later steps depend on earlier inputs).
- Make dependencies **obvious in the UI**.
- Prevent “successful” completion that produces **invalid or misleading state**.
- Support **resume** without ambiguity.
- Prefer **safe defaults** over “mystery state,” and require explicit acknowledgement for any risky bypass.

---

## Hardened fixes mapped to your OPEN items

### OPEN‑1 (P1): Game→Table mapping guidance is missing

**Fixes**
- Step 2 includes a **Configured Games Summary** banner:
  - Variants with **0 tables** (e.g., “Baccarat (2 variants), Pai Gow (1 variant)”)
  - Tables missing variant links
- Add quick action: **Generate tables from configured variants**
  - Generates one or more tables per variant using user-chosen counts (or a simple per-variant slider)
- Add explicit, non-prescriptive hinting:
  - “Most rooms start with N tables per variant” (avoid hard-coded counts)

**Hardening rule**
- Block Step 2 completion if:
  - All tables are unlinked **and**
  - Multiple variants exist for a game type (guaranteed downstream theo ambiguity)

---

### OPEN‑2 (P1): Hardcoded bulk-add counts

**Fixes**
- Remove “6 bulk buttons.”
- Keep:
  - `+ Add table`
  - `Generate from games` (fast path, but explicit)

This avoids “cleanup friction” (users shouldn’t delete what the product guessed).

---

### OPEN‑3 (P1): Bulk-add creates `game_settings_id = null`

**Fixes**
- Primary mitigation: OPEN‑2 removal of bulk-add counts.
- If any bulk generation remains:
  - Auto-link when exactly **one** variant exists for that game type.
  - Otherwise: allow null only if you **surface it loudly** (badge + warning + block Next unless resolved)

**Hardening rule**
- Any table-game where variant parameters materially affect theo must not proceed with `game_settings_id = null` unless the user explicitly acknowledges “defaults / link later” (only if you actually support link-later workflows).

---

### OPEN‑4 (P2) + OPEN‑8 (P2): Phantom roulette/poker buttons + roulette removal

**Fixes**
- Wizard game catalog must reflect **product scope**, not raw DB enums.
- Keep DB enums as-is if needed, but:
  - Remove roulette from wizard UI lists and quick actions.
- Poker:
  - If templates are deferred, poker is **custom game only**
  - Gate poker table creation: require at least one poker `game_settings`, or show poker as disabled with guidance.

---

### OPEN‑5 (P2): Variant selector not clearable

**Fixes**
- Add “None” option or `Clear` affordance.
- When cleared, show consequence:
  - “Theo may be inaccurate until a variant is selected.”

---

### OPEN‑6 (P3): Par Targets lacks variant context

**Fixes**
- Display: `BJ‑01 — Blackjack (Double Deck)` not just “Blackjack”
- Ensure variant context appears consistently anywhere you reference game settings.

---

### OPEN‑7 (P3): No step-jump navigation

**Fixes**
- Implement a clickable stepper:
  - Allow jumping to any step ≤ currentStep
  - Allow forward jumps only if prerequisites are satisfied
- Mark skippable steps as **Optional** (Step 3)

---

### OPEN‑9 (P2): Poker fee-model schema gap

**Fixes**
- Do not encode rake as “house edge.”
- Keep poker out of templates until a fee-model exists.
- If poker must exist in v1:
  - Add a separate poker economics model (rake, drop, time charges) and compute theo differently.

---

## Additional hardening not explicitly listed (prevents recurring “new gaps”)

### 1) Step-level Definition of Done (DoD) with server-side enforcement

Define minimal valid state **per step** and enforce it server-side:

- **Step 0 valid:** timezone + gaming_day_start + bank_mode present
- **Step 1 valid:** at least 1 game setting exists
- **Step 2 valid:** at least 1 table exists; and for required table-games:
  - `game_settings_id` is present (or explicit, supported bypass)
- **Step 3 valid:** pars either complete OR explicitly skipped (persist `skipped_by_user = true`)
- **Step 4 valid:** final server audit passes (blockers list must be empty)

If the UI lets users proceed but the server would reject it later, the UI is lying. Align them.

---

### 2) Idempotent actions (duplicate-proof inserts)

All server actions that create rows should accept an **idempotency key**, e.g.:

- `wizard_session_id + step + action_type + payload_hash`

Prevents duplicates from:
- double clicks
- retries
- refresh/back/forward weirdness

---

### 3) Explicit wizard session / progress record

Even if you compute step from server state, you need durable signals for:

- “User intentionally skipped Step 3”
- “Tables generated from variants at time X”
- “Last validation blockers for Step 2”

A small `setup_wizard_progress` row (casino_id + status JSON) makes the wizard deterministic.

---

### 4) Error UX that doesn’t gaslight users

Standardize:

- Inline field errors + step-level summary (“3 issues to fix”)
- Errors clear immediately when corrected
- Review step lists **Blockers vs Warnings** distinctly

---

### 5) Review step is an audit, not a recap

Step 4 should show:

- ✅ Completed
- ⚠️ Completed with warnings (e.g., “2 tables missing variant link”)
- ❌ Blockers (must fix)

Each item deep-links back to the exact fix location (via step-jump).

---

## Recommended implementation order

1) Replace bulk-add with **Add table** + **Generate from variants**
2) Remove roulette UI + gate poker UI
3) Add Step 2 **validation rules** (no silent null links)
4) Add Step 2 banner + missing mapping indicators
5) Add clearable variant selector
6) Par step displays variant context
7) Clickable stepper + Optional labeling

---

## Acceptance criteria (ship gate)

- No path exists where the wizard completes while leaving:
  - required configuration missing, or
  - ambiguous links that corrupt downstream computations
- Re-running “Generate from variants” is idempotent (no duplicates)
- Reload/resume always lands the user on the earliest step with blockers
- Review step enumerates blockers with links to fixes

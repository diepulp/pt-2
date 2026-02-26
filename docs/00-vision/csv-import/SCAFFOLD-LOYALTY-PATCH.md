Approve ✅ (what you got right)

“Staged only” loyalty fields + zero silent tier changes is the correct stance. Imported tier/points are claims, not truth. Your “reconciliation queue + human apply + audit + revert” is exactly how you avoid operational landmines. 

SCAFFOLD-LOYALTY-TIER-RECONCILI…

Upgrade-only MVP is a smart guardrail. Downgrades are where you get comps/entitlements drama and “why did the system rob my player?” calls. 

SCAFFOLD-LOYALTY-TIER-RECONCILI…

Option A (dedicated loyalty_reconciliation table) is the least stupid option long-term. It preserves bounded context integrity and doesn’t turn import_row into a junk drawer. 

SCAFFOLD-LOYALTY-TIER-RECONCILI…

Idempotent apply + reversible revert: excellent. “We can undo this” is what makes admins willing to click “Apply.” 

SCAFFOLD-LOYALTY-TIER-RECONCILI…

Criticize ⚠️ (the parts that can bite you)
1) Papa Parse: fine for UI preview, not your core import engine

Papa is great in the browser, but for server-side ingestion it’s easy to end up with memory-heavy, non-streaming behavior and then you’re debugging a 200MB CSV that nukes your route handler.

Better split:

Client (optional): Papa Parse for preview + header mapping UI + basic row sampling.

Server (authoritative): streaming parser (csv-parse / fast-csv) + deterministic normalization + batch upsert.

If you insist on Papa end-to-end, you’re choosing “works for small files” as an architectural principle. That’s on-brand for MVPs, but don’t pretend it’s not a tradeoff.

2) SECURITY DEFINER RPCs: good pattern, but don’t use them as a crutch

Your Option A recommends SECURITY DEFINER RPCs. That can be correct, but it creates a new governance surface:

You must hard-gate by role + casino_id inside the function (not just RLS vibes).

You must ensure the function cannot be abused to reconcile across casinos even if someone finds a way to pass IDs.

If your existing PT-2 posture already uses “set_rls_context + RLS” heavily, you might consider SECURITY INVOKER with tight RLS unless you truly need definer for atomic multi-table writes. (If you do, fine — just treat it like handling nitroglycerin.)

3) Tier mapping is the real boss fight, not the table schema

Your open questions call it out: vendor tiers might be free-text. That’s where imports go to die.

MVP rule: tier mapping must be explicit and deterministic:

Either: importer provides canonical tier enum values only, or

You require a mapping step per batch (“Vendor ‘Gold+’ → PT-2 ‘Gold’”).

No fuzzy matching, no “close enough.” That’s how you silently mis-entitle players.

4) “Freshness” needs one hard line, not vibes

You mention “stale threshold.” Good. Make it binary enough for ops:

If imported_last_activity_at missing → always requires confirmation (you already say this).

If present but older than threshold → mark stale and block bulk apply (post-MVP) / require per-row confirm.

5) Don’t let Option B happen “temporarily”

Extending import_row feels cheap, and then you wake up three months later with:

import lifecycle coupled to reconciliation lifecycle

cross-context writes

security review pain

“we’ll clean it up later” lies

Option B is how bounded contexts die: slowly, while everyone nods.

Verdict

Approve the overall direction.

Keep Option A.

Use Papa Parse only where it belongs (UI assist), not as your server ingestion backbone.

Treat tier mapping + role-gated reconciliation RPCs as the two places you must be strict, or you’ll create the exact “silent entitlement drift” you’re trying to prevent
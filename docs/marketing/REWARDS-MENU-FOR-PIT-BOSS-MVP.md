---
title: What We Built: Rewards Menu for Pit Bosses (MVP)
date: 2026-02-06
audience: Pit Boss / Shift Management
status: draft
---

# What We Built: Rewards Menu for Pit Bosses (MVP)

This is the short, non-technical explanation of what the “Reward Domain Model” work adds to the system. It’s based on the execution spec for ADR-033. 

## The problem we had

Before this work, the system could **track points** and **issue promo coupons**, but it couldn’t answer the basic floor question:

> “What rewards do we offer, and what am I allowed to give this player right now?”

So features kept stalling because we had plumbing (pipes) but no **menu** (choices) and no **rules** (who qualifies / how often). 

## The outcome in plain English

We built the casino’s **Rewards Menu**:

- a clean list of rewards the casino offers,
- the cost (if it costs points),
- what each player tier gets (if it’s tier-based),
- simple limits (“once per day”),
- and a way for staff to ask: **“show me rewards this player is eligible for.”** 

This is **not** the UI yet (buttons/screens). This is the back-end “source of truth” the UI will use. 

---

# What exists now (the “menu”)

## 1) Reward Catalog (the list of rewards)

Think of it like a restaurant menu. Each reward is an item with:
- a name (“$25 Meal Comp”, “Daily Tier Match Play”)
- a code (stable identifier)
- an “on/off” switch (active vs inactive)
- a category (what kind of reward it is) 

## 2) Two types of rewards

### A) Points Comps (costs points)
Examples:
- meal comp
- beverage comp
- misc comp

For these, we store **how many points it costs** (including the option for 0 points = complimentary). 

### B) Tier Entitlements (does NOT cost points)
Examples:
- tier-based match play
- tier-based free play

For these, we store **what each tier gets**.  
Example: Gold gets $25, Platinum gets $50. 

---

# The “rules” we added

## 3) Limits (how often it can be issued)

Simple guardrails like:
- once per gaming day
- once per visit
- once per week/month
- optional cooldown window 

## 4) Eligibility (who qualifies)

Simple filters like:
- minimum/maximum tier
- optional minimum points balance
- optional visit-type constraints 

No marketing engine. No “happy hour multiplier logic.” Just enough to prevent chaos and arguments.

---

# What staff can do (without the UI yet)

## 5) Staff can list rewards and view details
The system now supports:
- seeing the reward list (active/inactive, type, category)
- viewing the details (cost, tier mapping, limits, eligibility) 

## 6) Admin / Pit Boss can maintain the menu
Authorized roles can:
- create a new reward
- update a reward
- turn a reward on/off
- manage point costs / tier benefits / limits / eligibility 

## 7) Staff can ask: “what is this player eligible for?”
There is now a “player eligible rewards” query:
- it looks at the player’s tier info
- applies the catalog rules
- returns what the player can receive 

This is the missing building block for the upcoming “Issue Reward” workflow screen.

---

# What this does NOT do (yet)

## 8) It does not issue the reward
This work does **not** create the operator button that issues rewards.  
It only defines the menu and rules so issuing can be done consistently later. 

## 9) It does not replace the P0 outbox fix
Tier entitlement issuance uses existing promo coupon mechanisms, and those depend on the separate **loyalty_outbox** repair (P0). This rewards menu work is intentionally independent, but actual entitlement issuance will still need that fix. 

---

# Why this matters on the floor

Once the UI is wired, the pit boss experience becomes:

1) Open player profile  
2) Click **Issue Reward**  
3) See a short list of **eligible rewards** (not an infinite junk list)  
4) Pick one and issue it (points debit or coupon)  
5) See it show up in the player’s reward history  

This work built the “source of truth” that makes that flow possible.

---

# MVP summary

**We built:**
- the rewards menu,
- the pricing/tier mapping,
- the basic eligibility + limits,
- and the APIs to manage and query it.

**We did not build:**
- the operator-facing reward issuance UI,
- any campaign engine,
- any complex promo rules.

That’s deliberate: ship the foundation, then wire the surfaces.

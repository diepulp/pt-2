---
title: Setup Wizard — Default Table Template & Game Settings Metadata (Research-backed)
version: 0.1.0
status: draft
last_updated: 2026-02-10
---

# Purpose

This is a **default “initial table list” template** the Setup Wizard can pre-load when a casino stands up pit operations. It includes **baseline gaming settings metadata** (house edge, decisions/hour, seats, decks) for the table games and variants you listed.

> **Important**: Actual hold/edge depends on **specific rules, paytables, side-bets enabled, and local internal controls**. The template is meant to be a sane starting point you can edit per property.

---

# Field taxonomy (what the wizard should store per game/table)

## Game Settings (per *game variant*)
- **game_name** (e.g., “Blackjack”, “Spanish 21”)
- **variant_name** (e.g., “Double Deck”, “6-Deck”, “Commission-free (EZ-style)”)
- **decks** (1 / 2 / 6 / 8, etc.)
- **max_seats** (wagering positions)
- **decisions_per_hour** (DPH)
- **base_house_edge** (optimal / rules-specific when available)
- **rating_edge_for_comp** (if you use “comp purposes” edges; see Wizard table)
- **notes / rule_assumptions** (S17/H17, commission-free rule, etc.)

## Side bet catalog (optional per *game variant*)
- **side_bet_name**
- **side_bet_house_edge**
- **paytable_id** (if multiple)
- **enabled_by_default** (bool)

---

# Default template: initial table list + settings

Below is a **starter floor** you can import as “Template A”. You can add/remove tables per property.

## Template A — “Small pit starter” (10–12 tables)

- Blackjack — 2 tables (6-deck shoe)
- Blackjack — 1 table (double deck)
- Spanish 21 — 1 table
- Player’s Edge 21 Progressive — 1 table
- Mini Baccarat — 2 tables
- Pai Gow Poker — 1 table
- Emperor’s Challenge Exposed — 1 table
- Ultimate Texas Hold ’Em — 1 table
- High Card Flush — 1 table  
*(Optionally add Rising Phoenix in place of one Mini Baccarat if the property runs that branding.)*

---

# Research-backed baseline metadata (wizard defaults)

## Notes on house edge and DPH sources
- **Base “optimal strategy” house edge** is pulled from Wizard of Odds where available. citeturn6view2turn11search5turn11search1turn11search4turn8view1  
- **DPH defaults** use Wizard of Odds “Hands per Hour, House Edge for Comp Purposes” table (anonymously sourced from a Strip casino exec and used for rating).   
- **High Card Flush**: Wizard “Top 13 Best Bets” includes “Hands per hour: Apx. 50.” citeturn10search0  
- **Ultimate Texas Hold ’Em seats**: California DOJ rules specify **7 player places**. citeturn9search16  

---

## A) Blackjack (standard)

### Variant: 6-Deck Shoe (typical “main pit”)
- **Decks**: 6  
- **Seats**: 7 (typical blackjack layout; make configurable)
- **DPH default**: 70   
- **Base house edge (example ruleset)**: “Liberal Vegas rules” shown as **0.28%** citeturn6view2  
- **Rating edge (comp purposes)**: 0.75% (from the comp table) 

### Variant: Double Deck
- **Decks**: 2  
- **Seats**: 7 (typical; configurable)
- **DPH default**: 70 (use blackjack default unless you store a per-variant override)   
- **Base house edge**: **property-dependent** (rules vary; you can compute via a rules calculator later). Wizard provides a blackjack house-edge calculator for arbitrary rules. citeturn11search16  

---

## B) Spanish 21

- **Decks**: usually 6 or 8 (property setting)
- **Seats**: 7 (typical; configurable)
- **DPH default**: 75   
- **Base house edge (common rule reference)**: “normal rules… dealer hits soft 17… cannot double after doubling” → **0.76%** citeturn11search5turn11search13  
- **Rating edge (comp purposes)**: 2.2%   

---

## C) Player’s Edge 21 Progressive

Interpretation: **Player’s Edge 21** (Spanish 21-like) with an optional **progressive/bonus side-bet package**.

- **Seats**: 7 (typical; configurable)
- **DPH default**: use Spanish 21 (75)   
- **Base house edge** (basic strategy): **0.27%** citeturn11search4  

---

## D) Lucky Ladies (Blackjack side bet) — by deck

Lucky Ladies is a blackjack **side bet**; attach it to your Blackjack variants as an optional add-on.

Wizard of Odds provides analyses for multiple pay tables, including:
- Pay Table **D (6 decks)** → house edge **~13.34%** citeturn7search0  

Other sources discuss Pay Table B in double deck (high edge ~24.94% in 2D). citeturn7search4  

---

## E) Pai Gow Poker (standard)

- **Decks**: 53-card (52 + Joker)
- **Seats**: 6–7 (common layouts; configurable)
- **DPH default**: 30   
- **Base house edge**: **1.46%** citeturn6view2  
- **Rating edge (comp purposes)**: 1.96%   

---

## F) Emperor’s Challenge Exposed (Pai Gow Poker-based)

Regulators describe it as a **commission-free, house-banked Pai Gow Poker-based game** using a standard 52-card deck and a Joker. citeturn9search1turn5view0  

- **Decks**: 53-card (52 + Joker)
- **Seats**: 6–7 (configurable)
- **DPH default**: 30 (use Pai Gow baseline until you measure)   
- **Base house edge**: **TBD (vendor/rules specific)**  
  - Wizard default: use Pai Gow Poker 1.46% as a placeholder until you model exact rules. citeturn6view2  

### Optional side bets (commonly offered)
- **Emperor’s Challenge side bet** → house edge **4.171%** citeturn11search3  
- **Pai Gow Insurance** → house edge **7.35%** citeturn11search3  

---

## G) Mini Baccarat

- **Decks**: typically 6 or 8 (property setting)
- **Seats**: typically 7 (mini) — configurable  
- **DPH default**: 72   
- **Rating edge (comp purposes)**: 1.2%   

Base baccarat optimal edges:
- Banker bet: **1.06%**
- Player bet: **1.24%** citeturn6view2  

---

## H) Rising Phoenix Baccarat (commission / commission-free variants)

Nevada rules-of-play state Rising Phoenix:
- uses **6 or 8 decks**
- can be offered with **standard commission** or **commission-free**
- commission-free mechanism: **a winning Banker 3-card 7 pushes** on Banker wagers citeturn5view3turn7search10  

### Variant: Commission (standard baccarat)
- **Base house edge**: use standard baccarat Banker **1.06%** / Player **1.24%** citeturn6view2  

### Variant: Commission-free (EZ-style “Banker 3-card 7 push”)
EZ Baccarat provides **Banker bet house edge = 1.02%** (8 decks). citeturn8view0  

---

## I) Ultimate Texas Hold ’Em

- **Seats**: 7 player places + dealer. citeturn9search16  
- **Decks**: 1 standard 52-card deck
- **Base house edge**: **2.19%** (Ante basis) citeturn6view2turn11search10  

### DPH default
UTH speed varies heavily by dealer + players. A conservative default is **~30 hands/hour**. citeturn9search10  

---

## J) High Card Flush

- **Decks**: 1 standard 52-card deck
- **Seats**: typically 7 (configurable)
- **Hands/Hour default**: **~50** citeturn10search0  
- **House edge**:
  - “Optimal strategy” listed as **2.64%** citeturn8view1turn10search0  
  - “Advanced strategy” cited at **2.6855%** citeturn7search3turn8view1  

---

# Seed block (copy/paste wizard defaults)

```yaml
# game_settings_defaults.yaml (wizard seed)
- game: "Blackjack"
  variant: "6-deck shoe"
  decks: 6
  seats: 7
  decisions_per_hour: 70
  base_house_edge: 0.28
  rating_edge_for_comp: 0.75

- game: "Blackjack"
  variant: "Double deck"
  decks: 2
  seats: 7
  decisions_per_hour: 70
  base_house_edge: null
  rating_edge_for_comp: 0.75
  notes: "Compute from exact rules (H17/S17, DAS, RSA, etc.)."

- game: "Spanish 21"
  variant: "H17, no re-doubling (baseline)"
  decks: 6
  seats: 7
  decisions_per_hour: 75
  base_house_edge: 0.76
  rating_edge_for_comp: 2.2

- game: "Player's Edge 21"
  variant: "with progressive package"
  decks: 6
  seats: 7
  decisions_per_hour: 75
  base_house_edge: 0.27
  rating_edge_for_comp: 2.2
  notes: "Progressive side bets are paytable-dependent; store separately."

- game: "Mini Baccarat"
  variant: "standard"
  decks: 8
  seats: 7
  decisions_per_hour: 72
  base_house_edge: 1.06
  rating_edge_for_comp: 1.2
  notes: "Banker 1.06%, Player 1.24%."

- game: "Rising Phoenix Baccarat"
  variant: "commission"
  decks: 8
  seats: 7
  decisions_per_hour: 72
  base_house_edge: 1.06
  rating_edge_for_comp: 1.2

- game: "Rising Phoenix Baccarat"
  variant: "commission-free (Banker 3-card 7 push)"
  decks: 8
  seats: 7
  decisions_per_hour: 72
  base_house_edge: 1.02
  rating_edge_for_comp: 1.2

- game: "Pai Gow Poker"
  variant: "standard"
  decks: 1
  seats: 6
  decisions_per_hour: 30
  base_house_edge: 1.46
  rating_edge_for_comp: 1.96

- game: "Emperor's Challenge Exposed"
  variant: "commission-free exposed"
  decks: 1
  seats: 6
  decisions_per_hour: 30
  base_house_edge: 1.46
  rating_edge_for_comp: 1.96
  notes: "Placeholder edge; model exact rules later."

- game: "Ultimate Texas Hold 'Em"
  variant: "standard"
  decks: 1
  seats: 7
  decisions_per_hour: 30
  base_house_edge: 2.19

- game: "High Card Flush"
  variant: "optimal baseline"
  decks: 1
  seats: 7
  decisions_per_hour: 50
  base_house_edge: 2.64
```

---

# Known gaps (needs local configuration)
- Exact rule toggles for each variant (H17/S17, DAS, RSA, pay tables)
- Which side bets are enabled + paytables
- Local DPH baselining (your pit’s actual speed)
- Theo policy (which bet edge you rate on)

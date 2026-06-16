# Casino Table Inventory Accounting Terminology Reference

**Artifact type:** Casino terminology / semantics research reference  
**Status:** Draft reference  
**Scope:** Casino table-games inventory accounting language only  
**Exclusions:** Product architecture, PT-2 system behavior, software implementation, internal ADR/PRD terminology  

---

## 1. Purpose

This reference defines common casino table-games accounting and inventory terms in plain domain language.

It is intended to prevent semantic collapse between related but different casino concepts such as:

- table inventory;
- fills;
- credits;
- drop;
- soft count;
- win/loss;
- hold percentage;
- table need;
- par bank;
- running activity;
- final or reconciled accounting results.

The focus is casino terminology, not software system design.

---

## 2. Core accounting formula

A common table-games win/loss formula is:

```text
Win/Loss =
  Drop
  + Closing Inventory
  + Credits
  - Opening Inventory
  - Fills
```

Equivalent form:

```text
Inventory Total =
  - Opening Inventory
  - Fills
  + Credits
  + Closing Inventory

Win/Loss =
  Inventory Total
  + Drop
```

Washington State's house-banked card room records packet expresses the same sequence as:

```text
Total = - Opener - Fills + Credits + Closer
Win/Loss = Total + Drop
Win/Loss % = Win/Loss / Drop
```

Mississippi's gaming accounting rule expresses the equivalent table-games gross revenue formula:

```text
Gross Revenue =
  Closing Bankroll
  + Credit Slips
  + Drop
  - Opening Bankroll
  - Fills
```

---

## 3. Plain-language formula explanation

A table starts with chips in the tray.

During play:

- the casino may send more chips to the table through fills;
- the casino may remove excess chips from the table through credits;
- players exchange cash or other accepted instruments for chips;
- players win and lose chips;
- cash and accepted instruments are placed into the drop box;
- the table ends with a closing inventory.

The win/loss formula compares:

1. what was in the table bank at the beginning;
2. what was added to the table bank;
3. what was removed from the table bank;
4. what remains in the table bank at the end;
5. what was counted from the drop box.

The result is the table's calculated win or loss for the period.

---

## 4. Worked example

```text
Opening inventory:   $20,000
Fills:                $5,000
Credits:              $2,000
Closing inventory:   $18,000
Drop:                 $9,000
```

Formula:

```text
Win/Loss =
  Drop + Closing Inventory + Credits - Opening Inventory - Fills

Win/Loss =
  9,000 + 18,000 + 2,000 - 20,000 - 5,000

Win/Loss = $4,000
```

Hold percentage:

```text
Hold % = Win/Loss / Drop
Hold % = 4,000 / 9,000
Hold % = 44.44%
```

---

## 5. Table inventory terms

### 5.1 Table inventory

**Definition:**  
The chips, coin, tokens, or other approved monetary equivalents held in a table tray, rack, or table bank.

**Purpose:**  
Table inventory lets the dealer pay winning wagers, exchange chips, and continue game operation.

**Related terms:**

- table bank;
- table bankroll;
- tray inventory;
- rack inventory;
- opener;
- closer;
- fills;
- credits.

### 5.2 Opening inventory / Opener / Opening bankroll

**Definition:**  
The chip and coin amount in the table bank at the beginning of the accounting period, shift, or gaming day.

**Common source document:**  
Opening table inventory slip.

**Formula role:**  
Subtracted in the table win/loss calculation.

```text
Win/Loss =
  Drop + Closer + Credits - Opener - Fills
```

**Why it matters:**  
Without a reliable opening inventory, later table result calculations cannot be trusted because the starting point is unknown.

### 5.3 Closing inventory / Closer / Closing bankroll

**Definition:**  
The chip and coin amount in the table bank at the end of the accounting period, shift, or gaming day.

**Common source document:**  
Closing table inventory slip.

**Formula role:**  
Added in the table win/loss calculation.

```text
Win/Loss =
  Drop + Closer + Credits - Opener - Fills
```

**Why it matters:**  
Closing inventory identifies what remains in the table bank after play, fills, credits, and drop activity.

### 5.4 Table inventory slip

**Definition:**  
A source document used to record the chip and coin inventory at a table, commonly at opening and closing.

**Typical use:**  

- supports opener and closer values;
- travels with or supports the master games report / master games summary;
- may be verified by designated casino personnel depending on jurisdiction and internal controls.

---

## 6. Fill and credit terms

### 6.1 Fill

**Definition:**  
A movement of chips, coin, or tokens from the cage, vault, or bank to a gaming table.

**Operational purpose:**  
A fill replenishes the table bank when the table needs more chips to continue play.

**Formula role:**  
Subtracted in the table win/loss formula.

```text
Win/Loss =
  Drop + Closer + Credits - Opener - Fills
```

**Reason for subtraction:**  
A fill increases the table inventory but is not casino win. It is supplied inventory.

### 6.2 Fill slip

**Definition:**  
A source document recording a fill transaction.

**Typical contents:**

- table number;
- amount;
- denomination breakdown;
- time/date;
- signatures or approvals;
- serial/control number.

**Purpose:**  
Documents and controls chip movement from the cage to the table.

### 6.3 Credit

**Definition:**  
A movement of chips, coin, or tokens from a gaming table back to the cage, vault, or bank.

**Operational purpose:**  
A credit removes excess chips from the table bank.

**Formula role:**  
Added in the table win/loss formula.

```text
Win/Loss =
  Drop + Closer + Credits - Opener - Fills
```

**Reason for addition:**  
A credit decreases the table inventory but represents value returned from the table to the cage, so it is added back when calculating the table result.

### 6.4 Credit slip

**Definition:**  
A source document recording a credit transaction.

**Typical contents:**

- table number;
- amount;
- denomination breakdown;
- time/date;
- signatures or approvals;
- serial/control number.

**Purpose:**  
Documents and controls chip movement from the table to the cage.

---

## 7. Drop terminology

### 7.1 Drop

**Definition:**  
The money, instruments, chips, tickets, vouchers, coupons, or other qualifying items removed from a table-game drop box and counted or recorded according to casino procedures.

In many accounting contexts, **drop** means the amount counted from the drop box.

**Formula role:**  
Added in the table win/loss formula.

```text
Win/Loss =
  Drop + Closer + Credits - Opener - Fills
```

### 7.2 Drop box

**Definition:**  
A locked container attached to or associated with a gaming table into which currency, documents, markers, tickets, vouchers, or other items are deposited during play.

**Important distinction:**  
The existence or removal of a drop box does not itself establish a drop amount. The amount is established through count and recording procedures.

### 7.3 Drop box removal / physical drop event

**Definition:**  
The physical removal, exchange, or transport of a drop box from the gaming table area to a secure count process.

**Amount known?**  
Usually no amount is established by the removal event alone.

**Semantic rule:**  

```text
Box removed ≠ amount counted.
```

### 7.4 Soft drop

**Definition:**  
The collection or removal of table-game drop boxes or other non-chip gaming revenue containers for counting.

**Related process:**  
Soft count.

**Common meaning:**  
“Soft” generally refers to currency and paper instruments rather than hard count coin handling.

### 7.5 Soft count / count room

**Definition:**  
The controlled process of opening drop boxes, counting their contents, recording the amounts, and preparing count documentation.

**Typical controls:**

- count team participation;
- surveillance or independent monitoring;
- separation between pit, count, cage, and accounting functions;
- reconciliation to master games summary / count records;
- documentation of corrections and variances.

### 7.6 Counted drop amount

**Definition:**  
The amount established by the count process after drop box contents are counted and recorded.

**Authority posture:**  
Stronger than a mere physical drop event because an amount has been counted and documented.

**Distinction:**  

```text
Drop box removed = custody event.
Counted drop amount = monetary amount established through count.
```

### 7.7 Posted drop amount

**Definition:**  
A drop amount entered, posted, or recorded into accounting records or a master games summary after the count process.

**Important distinction:**  
Posted amount means an amount has been recorded. Whether it is final depends on the applicable reconciliation and audit controls.

### 7.8 Final / reconciled drop

**Definition:**  
A drop amount after count, verification, reconciliation, and accounting review are complete.

**Semantic rule:**  

```text
Posted drop ≠ final drop unless reconciliation/finality controls say so.
```

### 7.9 Running drop

**Definition:**  
A colloquial or operational phrase that may refer to cash activity accumulating during play before the box is counted.

**Caution:**  
A running drop amount is not usually known without instrumentation, count-room data, or an approved real-time source.

**Preferred language when the amount is not actually counted:**

- drop activity present;
- cash-in activity observed;
- uncounted drop pending;
- count pending.

**Semantic rule:**  

```text
Live activity may imply future drop.
Live activity is not counted drop.
```

---

## 8. Buy-ins, cash-in activity, and drop

### 8.1 Buy-in

**Definition:**  
A player's exchange of cash, chips, markers, credit instruments, or other accepted value for gaming chips.

**Relationship to drop:**  
Cash buy-ins may contribute to the contents of a drop box, depending on house procedure and game type.

**Important distinction:**  
Buy-in activity is not automatically equal to counted drop.

```text
Buy-ins are player activity.
Drop is a custody/count concept.
```

### 8.2 Cash-in activity

**Definition:**  
Observed or recorded activity in which value enters the table-game process, typically through player buy-ins or marker-related activity.

**Relationship to drop:**  
Cash-in activity may be useful operationally, but it should not be casually labeled as drop unless it is specifically tied to a counted or posted drop amount.

### 8.3 Marker

**Definition:**  
A credit instrument or counter check used in gaming credit play.

**Relationship to drop and revenue:**  
Treatment depends on jurisdiction, internal controls, and accounting rules. Marker payments, marker credits, and instruments may be documented separately from ordinary cash buy-ins.

---

## 9. Win/loss terminology

### 9.1 Win/Loss

**Definition:**  
The calculated result of table play for a given table and period, generally using drop, opening inventory, closing inventory, fills, and credits.

**Formula:**

```text
Win/Loss =
  Drop + Closing Inventory + Credits - Opening Inventory - Fills
```

**Positive result:**  
Casino win.

**Negative result:**  
Casino loss.

### 9.2 Gross revenue

**Definition:**  
A regulatory/accounting concept that may correspond to table win/loss or be calculated using similar inputs depending on jurisdiction.

**Example formula:**  

```text
Gross Revenue =
  Closing Bankroll
  + Credit Slips
  + Drop
  - Opening Bankroll
  - Fills
```

**Note:**  
Exact treatment may vary by jurisdiction, game type, promotional instruments, and reporting rules.

### 9.3 Statistical win

**Definition:**  
A statistical reporting value used to analyze table performance, game results, or fluctuations.

**Caution:**  
Statistical reporting may include or separately disclose promotional activity depending on jurisdictional rules.

### 9.4 Hold percentage / Win percentage

**Definition:**  
A ratio comparing win/loss to drop.

```text
Hold % = Win/Loss / Drop
```

**Example:**

```text
Win/Loss = $4,000
Drop = $9,000

Hold % = 44.44%
```

**Caution:**  
Promotional activity, coupons, match play, and other instruments may require separate treatment in statistical reports.

---

## 10. Need, par, and table-bank control

### 10.1 Par bank / table par / target bank

**Definition:**  
The target inventory level for a table bank.

**Purpose:**  
The par level defines how much value the table should normally hold to operate efficiently.

### 10.2 Need

**Definition:**  
The amount required to bring the current table inventory back to the target/par bank.

**Formula:**

```text
Need =
  Target Bank
  - Current Inventory
```

**Interpretation:**

```text
Need > 0  → table needs a fill
Need < 0  → table has excess; table may need a credit
Need = 0  → table is at par
```

**Example:**

```text
Target bank:       $20,000
Current inventory: $14,500

Need = $5,500
```

The table needs a $5,500 fill to return to par.

### 10.3 Need is not win/loss

Need is an inventory-control signal.

It does not measure whether the casino is winning or losing. It measures whether the table bank is under or over its target level.

```text
Need = inventory control.
Win/Loss = accounting result.
```

---

## 11. Master games report / master games summary

### 11.1 Master games report

**Definition:**  
A table-games accounting document that summarizes table activity for a gaming date, shift, or reporting period.

**Typical contents:**

- table identifier;
- game type;
- opener / opening inventory;
- fills;
- credits;
- closer / closing inventory;
- drop;
- win/loss;
- win/loss percentage;
- signatures or verification by required staff.

### 11.2 Master games summary

**Definition:**  
A summary document that aggregates pit or table activity, often including opening/closing bankroll, fill and credit slips, drop, and net win/loss per table and in total.

**Purpose:**  
Supports daily accounting, count-room reconciliation, audit review, and regulatory records.

---

## 12. Variance and reconciliation terms

### 12.1 Variance

**Definition:**  
A difference between expected and actual amounts.

**Examples:**

- cage over/short;
- count-room variance;
- drop-to-deposit variance;
- slip/document discrepancy;
- inventory over/short.

### 12.2 Over / short

**Definition:**  
A positive or negative difference between an expected amount and an actual counted amount.

**Common usage:**

- cage over/short;
- count-room over/short;
- table inventory discrepancy.

### 12.3 Reconciliation

**Definition:**  
The process of comparing source documents, counts, transfers, inventory records, deposits, and accounting records to verify that amounts agree or that differences are explained.

**Common reconciliation points:**

- drop amount to count-room proceeds;
- count-room proceeds to master games summary;
- fill/credit slips to master games summary;
- opening/closing inventory slips to master games summary;
- drop proceeds to deposit or cage accountability.

### 12.4 Final accounting result

**Definition:**  
A result after all required count, verification, reconciliation, and accounting controls are complete.

**Semantic rule:**  

```text
Calculated result ≠ final accounting result
unless all required finality controls are complete.
```

---

## 13. Common semantic traps

### 13.1 Calling buy-ins “drop”

Wrong:

```text
Buy-ins = drop
```

Better:

```text
Buy-ins may contribute to drop, but drop is established through custody/count records.
```

### 13.2 Calling box removal “drop amount”

Wrong:

```text
The box was removed, so the drop is known.
```

Better:

```text
The box removal is a custody event. The amount is known after count or posting.
```

### 13.3 Treating posted as final

Wrong:

```text
Posted drop = final drop
```

Better:

```text
Posted drop is a recorded amount. Final drop depends on verification and reconciliation controls.
```

### 13.4 Treating need as win/loss

Wrong:

```text
The table needs $5,000, so the table is down $5,000.
```

Better:

```text
The table is below par by $5,000. That is an inventory-control condition, not a win/loss result.
```

### 13.5 Treating inventory delta as win/loss

Wrong:

```text
Closing inventory - opening inventory = win/loss
```

Better:

```text
Inventory movement is only part of the calculation. Drop, fills, and credits are also required for the full table win/loss formula.
```

---

## 14. Recommended canonical terminology

| Use this term | For this meaning | Avoid using |
|---|---|---|
| `opening inventory` / `opener` | Starting table bank | starting drop |
| `closing inventory` / `closer` | Ending table bank | final drop |
| `fill` | Chips moved from cage to table | table credit |
| `credit` | Chips moved from table to cage | fill return |
| `drop box removal` | Physical custody event | drop amount |
| `counted drop` | Amount counted from box | running drop |
| `posted drop` | Amount recorded after count/accounting entry | final drop, unless final |
| `final/reconciled drop` | Amount after final reconciliation | posted drop, if not final |
| `buy-in activity` | Player cash/chip exchange activity | drop |
| `cash-in activity observed` | Operational activity signal | drop total |
| `need` | Amount needed to return to par | win/loss |
| `win/loss` | Drop + closer + credits - opener - fills | inventory delta |
| `hold percentage` | win/loss divided by drop | win/loss amount |

---

## 15. Formula quick reference

### Table win/loss

```text
Win/Loss =
  Drop
  + Closing Inventory
  + Credits
  - Opening Inventory
  - Fills
```

### Inventory total component

```text
Inventory Total =
  - Opening Inventory
  - Fills
  + Credits
  + Closing Inventory
```

### Win/loss from inventory component

```text
Win/Loss =
  Inventory Total
  + Drop
```

### Gross revenue, table-games form

```text
Gross Revenue =
  Closing Bankroll
  + Credit Slips
  + Drop
  - Opening Bankroll
  - Fills
```

### Hold percentage

```text
Hold % =
  Win/Loss / Drop
```

### Need

```text
Need =
  Target Bank
  - Current Inventory
```

---

## 16. Source notes

This reference synthesizes terminology from public casino regulatory and internal-control materials, including:

1. Washington State Gambling Commission, *House-Banked Card Room Records Packet*, especially the Master Games Report instructions defining opener, fills, credits, closer, drop, win/loss, and win/loss percentage.  
   URL: https://wsgc.wa.gov/sites/default/files/2023-11/2-255-hb-card-room-rcds.pdf

2. Nevada Gaming Control Board, *Internal Control Procedures — Table Games*, especially master games summary, drop box count, opening/closing bankroll, fill/credit slips, drop, net win/loss, and reconciliation controls.  
   URL: https://www.gaming.nv.gov/siteassets/content/divisions/tax-license/icp/icp-TableGames-V4-final.pdf

3. Mississippi Gaming Commission, *Accounting Records*, Rule 3.3, Computation of Gross Revenues, defining table-game gross revenue as closing bankroll plus credit slips plus drop less opening bankroll and fills.  
   URL: https://www.msgamingcommission.com/images/uploads/MGC_RegsPart_7_Accounting_Records.pdf

4. Nevada Gaming Control Board, *Table Games FAQ*, especially promotional/statistical drop and hold percentage treatment.  
   URL: https://www.gaming.nv.gov/divisions/audit-division/faqs/table-games/

---

## 17. Closing maxim

```text
Activity is not drop.
Removal is not amount.
Posted is not necessarily final.
Need is not win/loss.
Inventory movement is not the whole result.
```

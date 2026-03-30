# ADR-028 Amendment Trim — Keep It a Patch, Not a Second ADR

## Verdict

This amendment should remain a **narrow hardening patch** to ADR-028.

It should:

- fix the pit terminal grid / thumbnail badge leak
- ban raw enum fallback on that surface
- clarify that `gaming_table.status = 'closed'` is an **admin-side terminal availability state**
- avoid turning into a universal UI-surface contract or a second architecture decision

---

## Replace the amendment scope block

```md
scope: D6 UI Label Mapping → Pit terminal grid badge hardening
trigger: ISSUE-SESSION-CLOSE-DOWNSTREAM — grid badge shows raw "active" after session close
```

Use this intro text:

```md
This amendment is intentionally narrow.

It hardens D6 for the pit terminal grid / thumbnail badge that currently falls back to raw `gaming_table.status` when `current_session_status` is null.

It does not redefine the table lifecycle model, create a universal cross-surface display contract, or prescribe full admin-surface behavior. Admin terminology is clarified only where needed to avoid semantic drift.
```

---

## Replace D6.1 entirely

```md
### D6.1: Pit Terminal Grid Badge Contract (Normative)

This amendment applies to the pit terminal grid / thumbnail badge only.

For that surface, badge rendering MUST NOT fall back to raw enum text from `gaming_table.status` or `table_session.status`.

The grid badge may use a compact derived display for pit-terminal scanning, with the following rules:

- `gaming_table.status = 'inactive'` → `Idle`
- `gaming_table.status = 'closed'` → not a normal pit-runtime state; render as removed / unavailable only if surfaced
- `gaming_table.status = 'active'` + `current_session_status = 'ACTIVE'` → `In Play`
- `gaming_table.status = 'active'` + `current_session_status = 'RUNDOWN'` → `Rundown`
- `gaming_table.status = 'active'` + `current_session_status = 'OPEN'` → `Open`
- `gaming_table.status = 'active'` + `current_session_status = null` → `Available`

For this grid surface only, `Available` is shorthand for: no current running session is present on an operable table. It is not a historical claim about what happened before, and it is not a redefinition of table lifecycle semantics.
```

---

## Add one admin clarification note

```md
#### D6.1.a Admin clarification (out of implementation scope)

`gaming_table.status = 'closed'` retains its ADR-028 meaning: permanently decommissioned / removed from service.

That meaning belongs primarily to administrative table-management surfaces, not ordinary pit-terminal runtime display. This amendment does not define admin UI behavior; it only clarifies that table `closed` must not be confused with session `CLOSED`.
```

---

## Replace the raw-fallback section with a smaller rule

```md
### D6.2: Raw Enum Ban (Normative)

The grid badge MUST NOT display raw database enum values such as `"active"` or `"ACTIVE"`.

UI code MUST NOT use fallback patterns that surface raw enum text when session status is absent.

Non-compliant example:

```ts
const effectiveLabel = sessionStatusLabel ?? tableStatus;
```

The grid badge must resolve through centralized label mapping or a dedicated badge helper that returns approved pit-terminal badge text only.
```

---

## Replace the S4–S6 explanatory note

```md
**S4, S5, and S6 produce the same grid badge intentionally.**
For the pit terminal grid, "never opened", "closed earlier", and "between rollover sessions" all render as `Available` because the badge is answering a compact pit-ops question: is there a current running session here right now?

This shorthand is specific to the grid badge. It does not imply that these scenarios are historically identical, and it does not define the behavior of detail or admin surfaces.
```

---

## Replace S10 wording

```md
| S10 | `closed` | any | Table removed from service (admin-only terminal availability state) | `DECOMMISSIONED` | "Decommissioned" | Zinc, grayscale |
```

---

## Add one disposition sentence at the end

```md
This amendment clarifies pit-terminal grid behavior and terminology boundaries only. Any broader surface-specific display model for pit detail, admin management, dashboards, or downstream consumers belongs in a separate artifact if later needed.
```

---

## Plain-language intent

This keeps the amendment honest.

It says:

- **what broke**
- **where it broke**
- **how the pit grid must render instead**
- **one note that table `closed` is admin / decommissioned, not runtime session closure**

No more.

That preserves ADR-028's core model and prevents the amendment from growing philosophical sideburns.

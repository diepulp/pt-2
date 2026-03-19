# Feature Boundary Statement Template

> Copy this template to `docs/20-architecture/specs/{FEATURE-ID}/FEATURE_BOUNDARY.md`

Phase 0 is intentionally lean — ownership sentence and bounded context table only. Narrative fields (goal, actor, scenario, metric, non-goals) belong in Phase 1 (Feature Scaffold).

---

## Template

```markdown
# Feature Boundary: {Feature Name}

> **Ownership Sentence:** This feature belongs to **{OwnerService}** and may only touch **{Writes}**; cross-context needs go through **{Contracts}**.

---

## Bounded Context

- **Owner service(s):**
  - **{PrimaryService}** — {responsibility}
  - **{SecondaryService}** — {responsibility} (if applicable)

- **Writes:**
  - `{table_1}` ({purpose})
  - `{table_2}` ({purpose})

- **Reads:**
  - `{table_1}`, `{table_2}` (via DTOs)

- **Cross-context contracts:**
  - `{DTO_Name}` — {purpose}
  - `{Service}.{method}()` — {purpose}

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.
```

---

## Example: Player Identity Enrollment

```markdown
# Feature Boundary: Player Identity Enrollment (ADR-022)

> **Ownership Sentence:** This feature belongs to **PlayerService** (identity artifacts) and **CasinoService** (enrollment relationship). PlayerService writes to `player`, `player_identity`; CasinoService writes to `player_casino`. Cross-context needs go through **PlayerEnrollmentDTO** and **PlayerIdentityDTO**.

---

## Bounded Context

- **Owner services:**
  - **PlayerService** — identity artifacts (`player`, `player_identity`)
  - **CasinoService** — enrollment relationship (`player_casino`)

- **Writes:**
  - `player` (core patron record)
  - `player_identity` (ID document metadata)
  - `player_casino` (enrollment relationship)

- **Reads:**
  - `player`, `player_identity`, `player_casino` (via DTOs)

- **Cross-context contracts:**
  - `PlayerEnrollmentDTO` — enrollment status
  - `PlayerIdentityDTO` — identity read projection
  - `CasinoService.enrollPlayer()` — enrollment RPC
```

---

## Validation Checklist

Before passing the `srm-ownership` gate:

- [ ] Ownership sentence is clear and specific
- [ ] All tables written are listed
- [ ] Cross-context contracts are identified
- [ ] Owner service(s) have explicit responsibilities

 Table Context Service Lifecycle States

  The table lifecycle uses a 3-state model:

  States

  | State    | Description                                                                                                                 |
  |----------|-----------------------------------------------------------------------------------------------------------------------------|
  | inactive | Table exists but not available for gaming. No players can be seated, no rating slips created. Default state for new tables. |
  | active   | Table is open for gaming. Players can be seated, dealers assigned, rating slips created.                                    |
  | closed   | Terminal state - end of gaming day finalization. No further operations allowed. Cannot be reactivated.                      |

  State Machine Transitions

                  ┌─────────────────────────────────────┐
                  │                                     │
                  v                                     │
           ┌──────────┐    activate     ┌──────────┐   │
           │ inactive │ ──────────────> │  active  │   │
           └──────────┘                 └──────────┘   │
                  │                          │         │
                  │     deactivate           │         │
                  │ <────────────────────────┘         │
                  │                                    │
                  │ close               close          │
                  v                          │         │
           ┌──────────┐ <────────────────────┘         │
           │  closed  │                                │
           │(terminal)│                                │
           └──────────┘

  Valid transitions:
  - inactive → active (activate)
  - inactive → closed (close)
  - active → inactive (deactivate) - requires no open rating slips
  - active → closed (close)
  - closed → (nothing) - terminal, no transitions allowed

  Key Differences

  | Aspect            | inactive                      | active              | closed            |
  |-------------------|-------------------------------|---------------------|-------------------|
  | Rating slips      | Cannot create                 | Can create          | Cannot create     |
  | Dealer assignment | Not allowed                   | Allowed             | Not allowed       |
  | Can reactivate?   | Yes                           | N/A                 | No (terminal)     |
  | Use case          | Table not in use during shift | Table open for play | End of gaming day |

  Business Rules

  1. Deactivate requires no open slips: You cannot deactivate a table if there are open (unsettled) rating slips - they must be closed first.
  2. Auto-end dealer rotation: When deactivating or closing, any active dealer rotation is automatically ended.
  3. closed is terminal: Once a table is closed (end-of-day), it cannot be reopened. A new gaming_table row would be needed for the next gaming day (or the status reset by admin process).

  There is no "open" state - the system uses active for tables that are open for gaming. The terms are synonymous in this context.

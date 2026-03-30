### Player Exclusion System — Current Posture

**The exclusion system is fully operational for single-property use.** A pit boss or admin can flag a player, and that flag is enforced the moment anyone tries to open a new slip for that player at the same casino.

#### What it does today

When a player is excluded at a property, three things happen:

1. **Immediate enforcement** — if someone tries to start a rating slip for an excluded player, the system either blocks it outright (hard block) or shows a warning the floor staff must acknowledge (soft alert). A third level, monitor, simply notes it without intervention.

2. **Visible status** — the Player 360 screen shows a colored badge in the header (red for blocked, amber for alert, blue for monitored) and a compliance tile listing all active exclusions with their type, reason, and dates.

3. **Controlled lifecycle** — pit bosses and admins can create exclusions. Only admins can lift them. Lifted exclusions aren't deleted — they stay in the record with who lifted them and why, preserving the compliance trail. Nothing can be edited after creation except to lift it.

#### Who can do what

| Action | Pit Boss | Admin |
|--------|----------|-------|
| Create an exclusion | Yes | Yes |
| View exclusion status | Yes | Yes |
| Lift an exclusion | No | Yes |
| Delete an exclusion | No one | No one |

#### The sister-property gap

This is where the dual-boundary dependency lives. Today, exclusions are **property-scoped only**. If a player is banned at Casino A and walks into Casino B (same company), Casino B's staff **cannot see that exclusion**. The recognition system has the plumbing for this — two fields (`has_sister_exclusions` and `max_exclusion_severity`) are built into the cross-property lookup — but they currently return nothing. Until that's wired, each property is blind to what its sisters have flagged.

#### What's intentionally deferred

- **Exclusion history panel** — a detailed timeline view of past exclusions (lifted, expired). Designed but not built yet.
- **Automated expiry** — exclusions with an end date don't auto-clear; they just stop being active by the time check, but there's no background cleanup.
- **Bulk import** — no batch or CSV-based exclusion entry.
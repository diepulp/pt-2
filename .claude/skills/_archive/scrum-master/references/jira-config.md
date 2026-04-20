# PT-2 Jira Configuration

## Connection
- **Site**: vladimirivanovdev.atlassian.net
- **Cloud ID**: 3406f5b6-bb3b-4228-b1d1-42ae8d4dfca8
- **User**: Vladimir Ivanov (account_id: 712020:dde1458c-745e-42cf-87da-43bd793bee43)

Always pass `cloudId: "vladimirivanovdev.atlassian.net"` — the MCP resolves it to the UUID automatically.

## Projects

### SCRUM (pt-2-scrum) — Scrum Board
Primary board for feature development with sprint tracking.

**Issue Types:**
| Type     | ID    | Use for |
|----------|-------|---------|
| Epic     | 10001 | PRD-level feature groups |
| Story    | 10004 | User-facing functionality |
| Feature  | 10005 | Broad cross-cutting capabilities |
| Task     | 10003 | Discrete implementation work |
| Bug      | 10007 | Defects |
| Request  | 10006 | Design assistance asks |
| Subtask  | 10002 | Sub-items of Tasks/Stories |

**Workflow Transitions:**
| Transition   | ID | Target Status | Status ID |
|--------------|----|---------------|-----------|
| To Do        | 11 | To Do         | 10000     |
| In Progress  | 21 | In Progress   | 10001     |
| In Review    | 31 | In Review     | 10002     |
| Done         | 41 | Done          | 10003     |

### P2K (pt-2-kanban) — Kanban Board
Operational board for tasks, tech debt, and ops work.

**Issue Types:**
| Type     | ID    | Use for |
|----------|-------|---------|
| Epic     | 10042 | Feature groups |
| Task     | 10041 | All work items |
| Subtask  | 10043 | Sub-items |

**Workflow Transitions:**
| Transition   | ID | Target Status | Status ID |
|--------------|----|---------------|-----------|
| To Do        | 11 | To Do         | 10036     |
| In Progress  | 21 | In Progress   | 10037     |
| Done         | 31 | Done          | 10038     |

Note: P2K has no "In Review" status — it's a simpler 3-column Kanban flow.

## Issue Link Types
| Type      | ID    | Inward             | Outward    |
|-----------|-------|--------------------|------------|
| Blocks    | 10000 | is blocked by      | blocks     |
| Cloners   | 10001 | is cloned by       | clones     |
| Duplicate | 10002 | is duplicated by   | duplicates |
| Relates   | 10003 | relates to         | relates to |

## Established Labels
Labels currently in use across both boards:
- `backend` — Server-side / database work
- `security` — Security-related changes
- `wedge-c` — Shift Intelligence initiative
- `hardening` — Stability and reliability improvements
- `measurement-ui` — Measurement surface UI work

## Naming Conventions
Issue summaries follow these patterns:
- **Phase prefixes**: `[P0]`, `[P1]`, `[P2]` etc. for phased delivery within an epic
- **Workstream prefixes**: `WS1:`, `WS2:`, `WS3:` for parallel implementation streams
- **Slice prefixes**: `Slice 0 —`, `Slice 1 —` for incremental feature slices
- **PRD references**: `PRD-NNN: Title` for epic-level issues tracking a PRD
- **Gap references**: `(GAP-DESCRIPTIVE-TAG)` suffix for issues from gap analysis

## JQL Patterns

Useful queries for common operations:

```
# All open work
project in (P2K, SCRUM) AND status != Done ORDER BY priority DESC

# High priority backlog
project in (P2K, SCRUM) AND status = "To Do" AND priority = High

# Recently completed
project in (P2K, SCRUM) AND status = Done AND resolved >= -7d

# Updated today
project in (P2K, SCRUM) AND updated >= startOfDay()

# By label
project = P2K AND labels = "wedge-c" AND status != Done

# Epics with open children
project = P2K AND issuetype = Epic AND status != Done
```

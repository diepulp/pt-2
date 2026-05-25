The picture is clear. Here's the full assessment:

---

## `grind.observed` — Not Greenfield, But Orphaned

Your assumption is **partially correct** — there is no live UI surface producing grind observations — but the situation differs from fills and credits in two important ways.

### What exists

`GrindBuyinPanel` (`components/table/grind-buyin-panel.tsx`) and `useLogGrindBuyin` (`hooks/table-context/use-buyin-telemetry.ts`) were built. The component imports the hook, the hook calls `rpc_log_table_buyin_telemetry` with `p_telemetry_kind: 'GRIND_BUYIN'`, the wrapper routes that to `rpc_record_grind_observation`, which emits `grind.observed` unconditionally. The RPC chain is correct end-to-end.

**The component is mounted nowhere.** The only codebase reference to `GrindBuyinPanel` is the JSDoc comment on the hook itself. It was built but never connected to any page.

### How this differs from fills and credits

|              | `fill.recorded` / `credit.recorded`         | `grind.observed`                                    |
| ------------ | ------------------------------------------- | --------------------------------------------------- |
| UI component | None                                        | `GrindBuyinPanel` — exists, not mounted             |
| Hook         | None                                        | `useLogGrindBuyin` — exists                         |
| Transport    | Server-mediated (API route → service → RPC) | Direct browser RPC (`createBrowserComponentClient`) |
| Emission     | Unconditional                               | Unconditional                                       |
| Greenfield?  | Yes — backend-only by design                | No — UI infrastructure built, then orphaned         |

### The transport note

The grind hook calls `supabase.rpc('rpc_log_table_buyin_telemetry', ...)` directly from the browser — the same direct-browser-RPC pattern flagged for adjustments. Unlike fills and credits (which go through the server-mediated API route), grind bypasses the server boundary. The emission itself is unconditional so there is no anchor gap, but it carries the same structural trust problem: the browser is the caller, not a service boundary.

### Implication for the certification loop

Same practical result as fills and credits — no live UI trigger. But the fix path is different:

- **Fills/credits**: need a new UI surface built from scratch (hardware integration scope)  
- **Grind**: `GrindBuyinPanel` just needs to be mounted in a page — the component and hook are ready

For immediate certification, a direct `supabase.rpc` call works (it is a browser RPC, not an API route, so no JWT/server-side setup required beyond an authenticated session).
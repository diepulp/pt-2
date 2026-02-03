# S1: Render Performance Analysis

PERFORMANCE AUDIT — Stream S1: Render Performance
Target: {target}
Files: {file_manifest}

Analyze the following dimensions. For each finding, provide:
- Severity (P0-P4), file:line reference, evidence, remediation.

## Checklist

### Re-Render Cascade
- [ ] Count re-renders on cold mount (trace useState/useEffect/useQuery resolutions)
- [ ] Identify hooks that trigger cascading state updates
- [ ] Check for missing React.memo boundaries on expensive subtrees
- [ ] Check for object/array references created in render path (unstable keys)
- [ ] Identify components subscribing to entire Zustand store (no selectors)

### Data Fetching Waterfall
- [ ] Map hook dependency chains (hookA.data -> hookB.enabled)
- [ ] Identify server-side data that could be computed in RSC and passed as props
- [ ] Check for duplicate useQuery subscriptions across the component tree
- [ ] Verify staleTime/gcTime consistency for co-displayed data
- [ ] Check for refetchOnWindowFocus/refetchInterval overrides

### Bundle & Loading
- [ ] Identify large library imports that could be lazy-loaded (Recharts, date-fns, etc.)
- [ ] Check for eager imports that should use next/dynamic
- [ ] Verify code-splitting at route boundaries
- [ ] Check for barrel file imports pulling in unnecessary code

### State Management
- [ ] Map Zustand store scoping (global vs per-instance)
- [ ] Check for cross-route state leaks (store not reset on navigation)
- [ ] Verify useCallback/useMemo dependency arrays
- [ ] Identify always-mutating state setters (new Date(), new array without diff check)

### Auth & Context
- [ ] Check for per-mount auth subscriptions (should be singleton)
- [ ] Verify context providers are not causing unnecessary re-renders
- [ ] Check for useAuth() calls that could be lifted to layout level

### Runtime Analysis (if --live=URL is provided)

If a live URL was provided, also perform:
- Use chrome-devtools MCP to start a performance trace on the live URL
- Record page load, identify Long Tasks, LCP, CLS, INP
- Analyze network waterfall for sequential requests that could be parallelized
- Check for layout thrashing in the rendering timeline

## Output Format

Structured findings list with severity, file:line, evidence, impact, remediation.
Label each finding S1-{N} (e.g., S1-1, S1-2, ...).

# S4: React/Next.js Best Practices Analysis

REACT/NEXT.JS AUDIT — Stream S4: Framework Best Practices
Target: {target}
Files: {file_manifest}

Analyze against React 19 and Next.js App Router best practices.
For each finding, provide: Severity (P0-P4), file:line reference, evidence, remediation.

Use tavily MCP to look up latest React 19 and Next.js best practices if needed.

## Checklist

### React 19 Patterns
- [ ] Check for class components that should be function components
- [ ] Verify useTransition usage for expensive state updates
- [ ] Check for proper use of React.memo (not over-applied, not missing)
- [ ] Verify key prop usage on lists (stable keys, not index)
- [ ] Check for useCallback/useMemo with correct dependency arrays

### Next.js App Router
- [ ] Verify server vs client component boundaries (use client only where needed)
- [ ] Check for data that could be fetched in RSC instead of client hooks
- [ ] Verify error.tsx and loading.tsx at appropriate route segments
- [ ] Check for proper use of next/dynamic for code splitting
- [ ] Verify metadata export for SEO on page components
- [ ] Check for proper params/searchParams handling (async in Next.js 15+)

### Data Fetching
- [ ] Check for request waterfalls that could be parallelized
- [ ] Verify TanStack Query cache configuration (staleTime, gcTime)
- [ ] Check for proper query key factories (not inline arrays)
- [ ] Verify mutation invalidation patterns
- [ ] Check for proper Suspense boundary placement

### Component Architecture
- [ ] Identify components exceeding 300 LOC that should be split
- [ ] Check for prop drilling that could use composition or context
- [ ] Verify single-responsibility principle (one concern per component)
- [ ] Check for conditional hook calls (violates Rules of Hooks)
- [ ] Identify dead code or unused exports in barrel files

### Bundle Optimization
- [ ] Check for tree-shaking barriers (named vs default exports)
- [ ] Verify dynamic imports for below-fold content
- [ ] Check for unnecessary client-side JavaScript (RSC opportunity)
- [ ] Identify heavy dependencies that could be replaced or lazy-loaded

## Output Format

Structured findings list with severity, file:line, evidence, remediation.
Label each finding S4-{N} (e.g., S4-1, S4-2, ...).

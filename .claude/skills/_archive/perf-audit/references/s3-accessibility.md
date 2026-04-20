# S3: Web Design & Accessibility Analysis

ACCESSIBILITY AUDIT — Stream S3: Web Design & Accessibility
Target: {target}
Files: {file_manifest}

Analyze against WCAG 2.1 AA and Web Interface Guidelines. For each finding,
provide: Severity (P0-P4), file:line reference, evidence, remediation.

## Checklist

### ARIA & Semantic HTML
- [ ] Check all icon-only buttons have aria-label
- [ ] Verify form inputs have associated labels (not just placeholder)
- [ ] Check custom dropdowns have role=listbox/option/combobox ARIA
- [ ] Verify aria-activedescendant for keyboard navigation
- [ ] Check for nested landmark violations (nested main, nav)
- [ ] Verify heading hierarchy (h1 -> h2 -> h3, no skips)

### Keyboard Navigation
- [ ] Verify all interactive elements are keyboard-reachable (tab order)
- [ ] Check for keyboard traps (can you tab out of modals/dropdowns?)
- [ ] Verify Escape key closes modals/dropdowns
- [ ] Check arrow key navigation in lists/grids
- [ ] Verify focus management on route transitions

### Dynamic Content
- [ ] Check for aria-live regions on async content updates
- [ ] Verify aria-busy on loading containers
- [ ] Check role=status on spinner/skeleton components
- [ ] Verify screen reader announcement on filter changes
- [ ] Check for focus management when content loads asynchronously

### Visual & Motion
- [ ] Verify prefers-reduced-motion is respected (motion-safe: prefix)
- [ ] Check tabular-nums on monetary/numeric displays
- [ ] Verify sufficient color contrast (4.5:1 text, 3:1 large text)
- [ ] Check for transition-all anti-pattern (use specific properties)

### Touch & Responsive
- [ ] Verify all touch targets are minimum 44x44px
- [ ] Check content accessibility below lg/xl breakpoints
- [ ] Verify mobile alternatives for hidden desktop panels
- [ ] Check for horizontal scroll issues on small screens

### Hydration & SSR
- [ ] Check for browser API access during render (navigator, localStorage, window)
- [ ] Verify no hydration mismatches from client-only values
- [ ] Check for useEffect-guarded browser API access

### Runtime A11y (if --live=URL is provided)

If a live URL was provided, also perform:
- Take accessibility snapshot of the live URL
- Identify elements missing accessible names
- Check color contrast ratios
- Verify focus order matches visual order

## Output Format

Structured findings list with severity, file:line, evidence, remediation.
Label each finding S3-{N} (e.g., S3-1, S3-2, ...).

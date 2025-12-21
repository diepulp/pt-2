# Production Code Anti-Patterns

**Target Agents**: All agents
**Severity**: MEDIUM - Affects bundle size and debugging

---

## Console Usage

### ❌ NEVER use `console.*` in production code

```typescript
// ❌ WRONG
export async function createPlayer(data: PlayerCreateDTO) {
  console.log("Creating player:", data); // ❌
  const result = await playerService.create(data);
  console.log("Result:", result); // ❌
  return result;
}

// ✅ CORRECT
export async function createPlayer(data: PlayerCreateDTO) {
  // Use structured logging via telemetry helpers
  return withServerActionWrapper("createPlayer", async () => {
    return playerService.create(data);
  });
}
```

### Allowed Console Usage

| Context | Allowed |
|---------|---------|
| Development scripts | ✅ Yes |
| CLI tools | ✅ Yes |
| Test files | ✅ Yes |
| Production services | ❌ No |
| Route handlers | ❌ No |
| React components | ❌ No |

---

## Bulk Imports

### ❌ NEVER import entire libraries

```typescript
// ❌ WRONG - Imports entire icon library (~200KB)
import * as Icons from "@heroicons/react";

// ✅ CORRECT - Tree-shakeable import
import { CheckIcon } from "@heroicons/react/24/solid";
```

### ❌ NEVER import lodash as namespace

```typescript
// ❌ WRONG - Imports entire lodash (~70KB)
import _ from "lodash";
const result = _.groupBy(items, 'category');

// ✅ CORRECT - Import specific function
import groupBy from "lodash/groupBy";
const result = groupBy(items, 'category');

// ✅ BETTER - Use native methods when possible
const result = Object.groupBy(items, (item) => item.category);
```

---

## Dead Code

### ❌ NEVER leave commented-out code

```typescript
// ❌ WRONG
export function processVisit(visit: VisitDTO) {
  // const oldLogic = await legacyService.process(visit);
  // if (oldLogic.success) {
  //   return oldLogic;
  // }
  return newService.process(visit);
}

// ✅ CORRECT - Delete dead code, use git history if needed
export function processVisit(visit: VisitDTO) {
  return newService.process(visit);
}
```

### ❌ NEVER leave deprecated exports

```typescript
// ❌ WRONG
/** @deprecated Use createPlayerService instead */
export class PlayerService {}

// ✅ CORRECT - Delete entirely
// (Use git history to find old implementations)
```

---

## Export Patterns

### ❌ NEVER use default exports

```typescript
// ❌ WRONG
export default function createPlayerService() {}

// ✅ CORRECT
export function createPlayerService() {}
export { createPlayerService };
```

### ❌ NEVER re-export with different names

```typescript
// ❌ WRONG
export { createPlayerService as createPlayer } from './crud';

// ✅ CORRECT - Maintain consistent naming
export { createPlayerService } from './crud';
```

---

## Quick Checklist

- [ ] No `console.*` in production paths
- [ ] Named exports only (no default exports)
- [ ] Tree-shakeable imports (no namespace imports)
- [ ] No commented-out code
- [ ] No deprecated exports

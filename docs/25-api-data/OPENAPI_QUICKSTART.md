# OpenAPI Quick Start Guide

Quick reference for common OpenAPI tasks in PT-2.

## View API Documentation

```bash
npm run dev
# Open http://localhost:3000/api-docs
```

The Swagger UI provides interactive API documentation where you can:
- Browse all endpoints
- See request/response schemas
- Try out API calls
- View authentication requirements

## Generate TypeScript Types

**Most common use case** - Get type-safe API definitions:

```bash
npm run openapi:types
```

This creates `types/api-schema.d.ts` with TypeScript types for all API routes.

### Using Generated Types

```typescript
import type { paths } from '@/types/api-schema';

// Type for GET /players/{player_id} response
type PlayerResponse = paths['/players/{player_id}']['get']['responses']['200']['content']['application/json'];

// Type for POST /players request body
type PlayerCreate = paths['/players']['post']['requestBody']['content']['application/json'];

// Use in your code
async function getPlayer(playerId: string): Promise<PlayerResponse> {
  const res = await fetch(`/api/v1/players/${playerId}`);
  if (!res.ok) throw new Error('Failed to fetch player');
  return res.json();
}

async function createPlayer(data: PlayerCreate): Promise<PlayerResponse> {
  const res = await fetch('/api/v1/players', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create player');
  return res.json();
}
```

## Validate OpenAPI Spec

Before committing changes to the API:

```bash
npm run openapi:validate
```

**Note**: Requires Java to be installed. If you don't have Java, you can skip validation locally - CI will catch issues.

## Update API Documentation

When you modify API routes:

1. Update the OpenAPI spec:
   ```bash
   # Edit: 25-api-data/api-surface.openapi.yaml
   ```

2. Regenerate types:
   ```bash
   npm run openapi:types
   ```

3. Sync to public folder (for Swagger UI):
   ```bash
   npm run openapi:sync
   ```

4. Verify in Swagger UI:
   ```bash
   npm run dev
   # Check http://localhost:3000/api-docs
   ```

## Common Workflows

### Adding a New Endpoint

1. Add route definition to `api-surface.openapi.yaml`
2. Run `npm run openapi:types`
3. Implement route handler using generated types
4. Test in Swagger UI

### Changing Request/Response Schema

1. Update schema in `api-surface.openapi.yaml`
2. Run `npm run openapi:types`
3. Fix TypeScript errors in route handlers
4. Update tests

### Before Committing

```bash
# Quick validation (no Java needed)
npm run openapi:sync
npm run openapi:types
npm run type-check

# Full validation (requires Java)
npm run openapi:validate
```

## File Locations

| File | Purpose |
|------|---------|
| `25-api-data/api-surface.openapi.yaml` | Source of truth - OpenAPI spec |
| `types/api-schema.d.ts` | Generated TypeScript types |
| `public/api-spec.yaml` | Copy for Swagger UI |
| `app/api-docs/page.tsx` | Swagger UI page |

## Troubleshooting

### "Cannot find module '@/types/api-schema'"

Run `npm run openapi:types` to generate the types file.

### Swagger UI shows old spec

Run `npm run openapi:sync` to copy the latest spec to the public folder.

### "java: not found" error

Client SDK generation requires Java. Options:
1. Install Java (see OPENAPI_USAGE.md)
2. Use generated types with native fetch instead
3. Skip client generation - types are usually sufficient

## Next Steps

For detailed documentation, see:
- **Full Guide**: `25-api-data/OPENAPI_USAGE.md`
- **API Spec**: `25-api-data/api-surface.openapi.yaml`
- **Swagger UI**: http://localhost:3000/api-docs (when dev server running)

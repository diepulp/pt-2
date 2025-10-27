# OpenAPI/Swagger Usage Guide

This guide explains how to use the OpenAPI tooling configured in the PT-2 project.

## Overview

The project uses OpenAPI 3.1 specification to define the API contract and provide developer tooling:

- **Spec Location**: `25-api-data/api-surface.openapi.yaml`
- **Interactive Docs**: Available at `/api-docs` when running the dev server
- **Generated Clients**: TypeScript client SDKs auto-generated from the spec

## Available NPM Scripts

### View API Documentation

Start the development server and navigate to the Swagger UI:

```bash
npm run dev
# Then open: http://localhost:3000/api-docs
```

The Swagger UI provides:
- Interactive API exploration
- Request/response examples
- Schema definitions
- Try-it-out functionality (requires authentication)

### Generate TypeScript Types

Generate TypeScript type definitions from the OpenAPI spec:

```bash
npm run openapi:types
```

This creates `types/api-schema.d.ts` with type-safe interfaces for all API requests and responses.

**Usage Example**:

```typescript
import type { paths } from '@/types/api-schema';

// Type-safe API response
type PlayerResponse = paths['/players/{player_id}']['get']['responses']['200']['content']['application/json'];

// Type-safe request body
type PlayerCreate = paths['/players']['post']['requestBody']['content']['application/json'];
```

### Generate Client SDKs

#### ⚠️ Java Requirement

Client SDK generation requires Java to be installed. If you don't have Java:

```bash
# Ubuntu/Debian
sudo apt-get install default-jre

# macOS
brew install openjdk
```

#### Fetch-based Client (Recommended)

```bash
npm run openapi:client
```

Generates a TypeScript fetch-based client in `generated/api-client/`:

```typescript
import { PlayerApi, Configuration } from '@/generated/api-client';

const api = new PlayerApi(
  new Configuration({
    basePath: 'https://pt-2.local/api/v1',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
);

const player = await api.playersPlayerIdGet({ playerId: '...' });
```

#### Axios-based Client (Alternative)

```bash
npm run openapi:client:axios
```

Generates an axios-based client in `generated/api-client-axios/`.

#### Alternative: Use Generated Types with Fetch

If you don't want to install Java, you can use the generated types with native fetch:

```typescript
import type { paths } from '@/types/api-schema';

type GetPlayerResponse = paths['/players/{player_id}']['get']['responses']['200']['content']['application/json'];

async function getPlayer(playerId: string): Promise<GetPlayerResponse> {
  const res = await fetch(`/api/v1/players/${playerId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
```

### Validate OpenAPI Spec

Validate the OpenAPI specification for errors:

```bash
npm run openapi:validate
```

This checks for:
- Schema validation errors
- Missing required fields
- Invalid references
- OpenAPI 3.1 compliance

### Sync Spec to Public Folder

Copy the OpenAPI spec to the public folder for Swagger UI:

```bash
npm run openapi:sync
```

This is automatically included in the `openapi:all` command.

### Run All OpenAPI Operations

Execute all OpenAPI tasks in sequence:

```bash
npm run openapi:all
```

This runs:
1. Validation
2. Type generation
3. Client generation
4. Spec sync

## Workflow Recommendations

### When to Regenerate

Run `npm run openapi:all` after:

1. **API Route Changes**: Adding/modifying route handlers
2. **Schema Updates**: Changing request/response structures
3. **Before Commits**: Ensure clients are in sync with API
4. **After Pulling Changes**: Sync with team updates

### Integration with Development

Add to your workflow:

```bash
# After making API changes
npm run openapi:all

# Verify types work correctly
npm run type-check

# Run tests with new client
npm run test
```

### CI/CD Integration

Consider adding to `.husky/pre-commit`:

```bash
# Validate OpenAPI spec before commits
npm run openapi:validate
```

Or add to CI pipeline:

```yaml
- name: Validate OpenAPI
  run: npm run openapi:validate

- name: Generate and verify types
  run: |
    npm run openapi:types
    npm run type-check
```

## Configuration Files

### `openapitools.json`

Configures the OpenAPI Generator CLI:

- **Generator Version**: 7.10.0
- **Input Spec**: `25-api-data/api-surface.openapi.yaml`
- **Outputs**:
  - `generated/api-client` (fetch)
  - `generated/api-client-axios` (axios)

### Generated Files Location

Generated files are gitignored (`/generated` in `.gitignore`) because they are derived artifacts. Regenerate them locally as needed.

## Best Practices

### 1. Keep Spec in Sync

The OpenAPI spec should be the **single source of truth** for the API contract:

- Update the spec **before** implementing routes
- Use the spec to validate route handlers
- Generate types to catch mismatches early

### 2. Use Generated Types

Prefer generated types over manual interfaces:

```typescript
// ✅ Good: Use generated types
import type { paths } from '@/types/api-schema';
type PlayerResponse = paths['/players/{player_id}']['get']['responses']['200']['content']['application/json'];

// ❌ Avoid: Manual interface duplication
interface PlayerResponse {
  id: string;
  // ...manual duplication of spec
}
```

### 3. Validate Before Commit

Always validate the spec before committing:

```bash
npm run openapi:validate
```

Invalid specs break client generation and documentation.

### 4. Document Changes

When updating the API:

1. Update `25-api-data/api-surface.openapi.yaml`
2. Run `npm run openapi:all`
3. Test with Swagger UI at `/api-docs`
4. Commit both spec and implementation together

## Troubleshooting

### Swagger UI Shows Error

**Problem**: `/api-docs` shows "Error Loading API Specification"

**Solutions**:
1. Run `npm run openapi:sync` to copy spec to public folder
2. Validate spec: `npm run openapi:validate`
3. Check browser console for fetch errors

### Generated Client Has Errors

**Problem**: Generated client doesn't compile

**Solutions**:
1. Validate spec first: `npm run openapi:validate`
2. Check for unsupported OpenAPI features
3. Regenerate: `npm run openapi:client`
4. Check `openapitools.json` configuration

### Types Don't Match Implementation

**Problem**: TypeScript types from spec don't match route handlers

**Solutions**:
1. Ensure spec is up-to-date with implementation
2. Regenerate types: `npm run openapi:types`
3. Use generated types in route handlers for consistency
4. Consider using spec-first development workflow

## Advanced Usage

### Custom Client Configuration

Edit `openapitools.json` to customize client generation:

```json
{
  "generator-cli": {
    "generators": {
      "typescript-fetch": {
        "additionalProperties": {
          "modelPropertyNaming": "camelCase",
          "supportsES6": "true",
          "withInterfaces": "true"
        }
      }
    }
  }
}
```

### Using with React Query

Combine generated clients with `@tanstack/react-query`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { PlayerApi } from '@/generated/api-client';

function usePlayer(playerId: string) {
  const api = new PlayerApi(/* config */);

  return useQuery({
    queryKey: ['player', playerId],
    queryFn: () => api.playersPlayerIdGet({ playerId }),
  });
}
```

### Generating Other Clients

The OpenAPI spec can generate clients for many languages:

```bash
# List available generators
npx openapi-generator-cli list

# Generate Python client
npx openapi-generator-cli generate -g python -i 25-api-data/api-surface.openapi.yaml -o generated/python-client
```

## Additional Resources

- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)
- [OpenAPI Generator](https://openapi-generator.tech/)
- [Swagger UI Documentation](https://swagger.io/docs/open-source-tools/swagger-ui/)
- [openapi-typescript](https://github.com/drwpow/openapi-typescript)

## Support

For questions or issues:

1. Check this guide first
2. Review the OpenAPI spec at `25-api-data/api-surface.openapi.yaml`
3. Validate the spec: `npm run openapi:validate`
4. Check generated output for error messages

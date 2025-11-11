#!/usr/bin/env -S npx tsx
/**
 * PT-2 Service Builder: Generate Service Stub
 *
 * Creates a new service directory with template files
 * Usage: npx tsx scripts/generate-service-stub.ts <service-name>
 */

import * as fs from 'fs';
import * as path from 'path';

const SERVICE_NAME = process.argv[2];

if (!SERVICE_NAME) {
  console.error('❌ Error: Service name required');
  console.error('Usage: npx tsx generate-service-stub.ts <service-name>');
  console.error('Example: npx tsx generate-service-stub.ts loyalty');
  process.exit(1);
}

// Convert service name to proper casing
const serviceDirName = SERVICE_NAME.toLowerCase();
const servicePascalCase = serviceDirName
  .split('-')
  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
  .join('');

const serviceDir = path.join(process.cwd(), 'services', serviceDirName);

console.log('========================================');
console.log('PT-2 Service Generator');
console.log('========================================\n');

// Check if service already exists
if (fs.existsSync(serviceDir)) {
  console.error(`❌ Error: Service already exists at ${serviceDir}`);
  console.error('Remove existing directory or choose a different name');
  process.exit(1);
}

// Create directory structure
console.log(`Creating service directory: ${serviceDir}`);
fs.mkdirSync(serviceDir, { recursive: true });
fs.mkdirSync(path.join(serviceDir, '__tests__'), { recursive: true });

// Template: index.ts (service factory)
const indexTemplate = `import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import type {
  // Import your DTOs here
} from './dtos';

// ============================================================================
// ${servicePascalCase.toUpperCase()} SERVICE
// Reference: SRM v3.0.2 §[SECTION]
// Bounded Context: [DESCRIPTION]
// Owns Tables: [TABLE_LIST]
// ============================================================================

export interface ${servicePascalCase}Service {
  // Define service methods here
  // Example:
  // getById(id: string): Promise<YourDTO | null>;
  // create(input: YourInsert): Promise<YourDTO>;
  // update(id: string, updates: YourUpdate): Promise<YourDTO>;
}

/**
 * Create ${servicePascalCase} Service (Functional Factory)
 *
 * @param supabase - Supabase client with Database type
 * @returns ${servicePascalCase}Service interface
 */
export function create${servicePascalCase}Service(
  supabase: SupabaseClient<Database>
): ${servicePascalCase}Service {
  return {
    // Implement service methods here
  };
}
`;

// Template: dtos.ts
const dtosTemplate = `import type { Database } from '@/types/database.types';

// ============================================================================
// DTO EXPORTS (${servicePascalCase} Service)
// Reference: SRM v3.0.2 §[SECTION]
// Table Ownership: [TABLE_LIST]
// ============================================================================

// TODO: Define your DTOs based on table ownership from SRM §34-48
//
// For Canonical DTOs (simple CRUD):
// export type YourTableRow = Database['public']['Tables']['your_table']['Row'];
// export type YourTableInsert = Database['public']['Tables']['your_table']['Insert'];
// export type YourTableUpdate = Database['public']['Tables']['your_table']['Update'];
//
// For Contract-First DTOs (complex business logic):
// export interface YourBusinessDTO {
//   id: string;
//   // ... fields
// }
//
// For RPC Input/Output:
// export interface YourRPCInput {
//   // ... input params
// }
// export interface YourRPCOutput {
//   // ... output fields
// }
`;

// Template: types.ts
const typesTemplate = `// ============================================================================
// INTERNAL TYPES (${servicePascalCase} Service)
// These types are NOT exported publicly - internal use only
// ============================================================================

// TODO: Define internal types used within service implementation
// (not exposed via dtos.ts)
`;

// Template: __tests__/index.test.ts
const testTemplate = `import { createClient } from '@supabase/supabase-js';
import { create${servicePascalCase}Service } from '../index';
import type { Database } from '@/types/database.types';

const supabase = createClient<Database>(
  process.env.SUPABASE_URL || 'http://127.0.0.1:54321',
  process.env.SUPABASE_ANON_KEY || ''
);

describe('${servicePascalCase}Service', () => {
  const service = create${servicePascalCase}Service(supabase);

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // TODO: Add service method tests
  it.todo('should implement getById');
  it.todo('should implement create');
  it.todo('should implement update');

  it('should respect bounded context isolation', () => {
    // Verify no direct cross-context table imports
    // Only allowed: import DTOs from other services via dtos.ts
  });
});
`;

// Template: README.md
const readmeTemplate = `# ${servicePascalCase} Service

## Bounded Context

**Reference**: SRM v3.0.2 §[SECTION]

**Description**: [Describe the bounded context and business domain]

## Table Ownership

This service owns the following tables:

- \`[table_name_1]\` - [Description]
- \`[table_name_2]\` - [Description]

## Exported DTOs

From \`dtos.ts\`:

- \`[YourDTO]\` - [Description]
- \`[YourInsert]\` - [Description]
- \`[YourUpdate]\` - [Description]

## Service Interface

From \`index.ts\`:

\`\`\`typescript
export interface ${servicePascalCase}Service {
  // Method signatures
}
\`\`\`

## Cross-Context Dependencies

This service consumes DTOs from:

- None yet (update after defining cross-context imports)

## RPC Methods

[List any RPC-style business logic methods]

## References

- SRM Section: [SECTION]
- Security Policies: docs/30-security/SEC-001-rls-policy-matrix.md
- Service Template: docs/70-governance/SERVICE_TEMPLATE.md
`;

// Write files
console.log('Generating service files...\n');

fs.writeFileSync(path.join(serviceDir, 'index.ts'), indexTemplate);
console.log('  ✅ Created index.ts');

fs.writeFileSync(path.join(serviceDir, 'dtos.ts'), dtosTemplate);
console.log('  ✅ Created dtos.ts');

fs.writeFileSync(path.join(serviceDir, 'types.ts'), typesTemplate);
console.log('  ✅ Created types.ts');

fs.writeFileSync(path.join(serviceDir, '__tests__', 'index.test.ts'), testTemplate);
console.log('  ✅ Created __tests__/index.test.ts');

fs.writeFileSync(path.join(serviceDir, 'README.md'), readmeTemplate);
console.log('  ✅ Created README.md');

console.log('\n========================================');
console.log('Service stub created successfully!');
console.log('========================================\n');

console.log('Next steps:\n');
console.log('1. Review SRM v3.0.2 §34-48 to identify table ownership');
console.log(`   - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md\n`);

console.log('2. Define DTOs in services/' + serviceDirName + '/dtos.ts');
console.log('   - Export DTOs for all tables owned by this service');
console.log('   - Use Canonical pattern for simple CRUD');
console.log('   - Use Contract-First pattern for complex business logic\n');

console.log('3. Implement service factory in services/' + serviceDirName + '/index.ts');
console.log('   - Define service interface');
console.log('   - Implement methods using functional factory pattern');
console.log('   - Type supabase as SupabaseClient<Database>\n');

console.log('4. Update README.md with actual bounded context details\n');

console.log('5. Validate service compliance:');
console.log('   - npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts');
console.log('   - npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts\n');

console.log('6. Add service tests in __tests__/\n');

console.log('Reference:');
console.log('  - Service Template: docs/70-governance/SERVICE_TEMPLATE.md');
console.log('  - DTO Standard: docs/25-api-data/DTO_CANONICAL_STANDARD.md');
console.log('  - SRM: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md');

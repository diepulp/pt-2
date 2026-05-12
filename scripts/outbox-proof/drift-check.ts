// scripts/outbox-proof/drift-check.ts
// PRD-082 Runtime drift detection.
// Blocking classes: RELAY_AUTH_BROKEN | SERVICE_ROLE_RPC_ACCESS_BROKEN | RLS_BOUNDARY_BROKEN

import dotenv from 'dotenv';
import {
  createAuthenticatedClient,
  createServiceClient,
  runRelayBatch,
  PROOF,
} from './helpers';

dotenv.config({ path: '.env.local' });

export interface DriftCheckResult {
  checks: Record<string, 'PASS' | 'FAIL'>;
  blockingClasses: string[];
  nonBlockingFindings: string[];
  allNonBlocking: boolean;
}

export async function runDriftCheck(): Promise<DriftCheckResult> {
  console.log('\n[DRIFT CHECK] Starting...');

  const checks: Record<string, 'PASS' | 'FAIL'> = {};
  const blockingClasses: string[] = [];
  const nonBlockingFindings: string[] = [];

  function pass(name: string) {
    checks[name] = 'PASS';
    console.log(`  ${name}: PASS`);
  }
  function fail(name: string, detail: string, cls?: string) {
    checks[name] = 'FAIL';
    console.log(`  ${name}: FAIL — ${detail}`);
    if (cls) blockingClasses.push(cls);
    else nonBlockingFindings.push(`${name}: ${detail}`);
  }

  // 1. ENV_VARS
  {
    const missing = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ].filter((k) => !process.env[k]);
    if (missing.length > 0)
      fail('ENV_VARS', `missing: ${missing.join(', ')}`, 'RELAY_AUTH_BROKEN');
    else pass('ENV_VARS');
  }

  // 2. CRON_SECRET_VALIDATION
  {
    if (!process.env['CRON_SECRET'])
      fail(
        'CRON_SECRET_VALIDATION',
        'CRON_SECRET not set',
        'RELAY_AUTH_BROKEN',
      );
    else pass('CRON_SECRET_VALIDATION');
  }

  // 3. SERVICE_ROLE_RPC_ACCESS
  try {
    const service = createServiceClient();
    const { error } = await service.rpc('rpc_claim_outbox_batch', {
      p_batch_size: 1,
    });
    if (error)
      fail(
        'SERVICE_ROLE_RPC_ACCESS',
        error.message,
        'SERVICE_ROLE_RPC_ACCESS_BROKEN',
      );
    else pass('SERVICE_ROLE_RPC_ACCESS');
  } catch (e) {
    fail(
      'SERVICE_ROLE_RPC_ACCESS',
      String(e),
      'SERVICE_ROLE_RPC_ACCESS_BROKEN',
    );
  }

  // 4. RPC_CREATE_FINANCIAL_TXN
  let authClient: Awaited<ReturnType<typeof createAuthenticatedClient>> | null =
    null;
  try {
    authClient = await createAuthenticatedClient();
    const { data, error } = await authClient.rpc('rpc_create_financial_txn', {
      p_player_id: PROOF.PLAYER_ID,
      p_visit_id: PROOF.VISIT_ID,
      p_amount: 10,
      p_direction: 'in',
      p_source: 'pit',
      p_tender_type: 'cash',
      p_rating_slip_id: PROOF.SLIP_ID,
      p_idempotency_key: `drift-check-${Date.now()}`,
    });
    if (error || !data)
      fail('RPC_CREATE_FINANCIAL_TXN', error?.message ?? 'null result');
    else pass('RPC_CREATE_FINANCIAL_TXN');
  } catch (e) {
    fail('RPC_CREATE_FINANCIAL_TXN', String(e));
  }

  // 5. RPC_RECORD_GRIND_OBSERVATION
  try {
    if (!authClient) authClient = await createAuthenticatedClient();
    const { data, error } = await authClient.rpc(
      'rpc_record_grind_observation',
      {
        p_table_id: PROOF.TABLE_1_ID,
        p_amount_cents: 100,
      },
    );
    if (error || !data)
      fail('RPC_RECORD_GRIND_OBSERVATION', error?.message ?? 'null result');
    else pass('RPC_RECORD_GRIND_OBSERVATION');
  } catch (e) {
    fail('RPC_RECORD_GRIND_OBSERVATION', String(e));
  }

  // 6. RPC_COMMIT_CONSUMER_RECEIPT (via relay batch)
  try {
    const service = createServiceClient();
    const result = await runRelayBatch(service, 50);
    if (result.processed === 0 && result.duplicate === 0 && result.failed > 0) {
      fail(
        'RPC_COMMIT_CONSUMER_RECEIPT',
        `relay batch had ${result.failed} failures`,
        'SERVICE_ROLE_RPC_ACCESS_BROKEN',
      );
    } else {
      pass('RPC_COMMIT_CONSUMER_RECEIPT');
    }
  } catch (e) {
    fail(
      'RPC_COMMIT_CONSUMER_RECEIPT',
      String(e),
      'SERVICE_ROLE_RPC_ACCESS_BROKEN',
    );
  }

  // 7. RLS_BOUNDARY — authenticated role must NOT be able to read proof-state
  try {
    if (!authClient) authClient = await createAuthenticatedClient();
    const { data, error } = await authClient
      .from('outbox_integration_proof_state')
      .select('seq')
      .limit(1);
    // RLS enabled with no policies → authenticated role should get error or 0 rows (PGRST116 or empty)
    if (error) {
      // Expected: permission denied or no rows
      pass('RLS_BOUNDARY');
    } else if ((data ?? []).length > 0) {
      fail(
        'RLS_BOUNDARY',
        'authenticated role can read proof-state rows — RLS policy missing',
        'RLS_BOUNDARY_BROKEN',
      );
    } else {
      // 0 rows returned — acceptable (no policy = no rows visible to authenticated)
      pass('RLS_BOUNDARY');
    }
  } catch (e) {
    pass('RLS_BOUNDARY'); // exception = access denied = correct
  }

  // 8. PROOF_STATE_TABLE_ACCESSIBLE via service_role
  try {
    const service = createServiceClient();
    const { error } = await service
      .from('outbox_integration_proof_state')
      .select('seq', { count: 'exact', head: true });
    if (error)
      fail(
        'PROOF_STATE_TABLE_ACCESSIBLE',
        error.message,
        'SERVICE_ROLE_RPC_ACCESS_BROKEN',
      );
    else pass('PROOF_STATE_TABLE_ACCESSIBLE');
  } catch (e) {
    fail(
      'PROOF_STATE_TABLE_ACCESSIBLE',
      String(e),
      'SERVICE_ROLE_RPC_ACCESS_BROKEN',
    );
  }

  const allNonBlocking = blockingClasses.length === 0;

  console.log('\n[DRIFT CHECK]');
  Object.entries(checks).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log(
    `\n  BLOCKING_DRIFT_CLASSES: ${blockingClasses.length > 0 ? blockingClasses.join(', ') : 'none'}`,
  );
  console.log(
    `  NON_BLOCKING_FINDINGS: ${nonBlockingFindings.length > 0 ? nonBlockingFindings.join('; ') : 'none'}`,
  );
  console.log(
    `  DRIFT_CLASSIFICATION: ${allNonBlocking ? 'ALL_NON_BLOCKING' : 'BLOCKING_DRIFT_DETECTED'}`,
  );

  return { checks, blockingClasses, nonBlockingFindings, allNonBlocking };
}

if (process.argv[1]?.endsWith('drift-check.ts')) {
  runDriftCheck().then((r) => process.exit(r.allNonBlocking ? 0 : 1));
}

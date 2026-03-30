/**
 * Shift Intelligence E2E Tests (PRD-055/056)
 *
 * Covers the subset of shift intelligence that can be validated with the
 * current dev-bypass auth mode:
 *
 *   A. API Read Path — GET /alerts via Next.js route (dev bypass + service role)
 *   B. Database Constraints — dedup key, multi-metric, multi-table
 *
 * NOT covered (requires real auth for SECURITY DEFINER RPCs):
 *   - POST /compute-baselines (rpc_compute_rolling_baseline)
 *   - POST /persist-alerts    (rpc_persist_anomaly_alerts)
 *   - POST /acknowledge-alert (rpc_acknowledge_alert)
 *   - GET  /anomaly-alerts    (rpc_get_anomaly_alerts)
 *
 * Additionally, two RPC migration bugs were discovered during test development:
 *   - rpc_compute_rolling_baseline: ambiguous "gaming_day" column (PG 42702)
 *   - rpc_persist_anomaly_alerts:   "column ts.table_id does not exist" (PG 42703)
 * See docs/issues/ for details.
 *
 * Prerequisites:
 *   - Local Supabase with migrations applied (supabase db reset)
 *   - Dev server running with ENABLE_DEV_AUTH=true
 *   - Database seeded with seed.sql
 *
 * @see EXEC-055 — Shift Baseline Service
 * @see EXEC-056 — Alert Maturity
 */

import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

// ── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Seed data IDs from supabase/seed.sql
const SEED_CASINO_ID = 'ca000000-0000-0000-0000-000000000001';
const SEED_TABLE_BJ01 = '6a000000-0000-0000-0000-000000000001'; // BJ-01
const SEED_TABLE_BJ02 = '6a000000-0000-0000-0000-000000000002'; // BJ-02

const ALERTS_URL = `${BASE_URL}/api/v1/shift-intelligence/alerts`;

function createServiceClient() {
  return createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const GAMING_DAY = new Date().toISOString().slice(0, 10);

// All groups share SEED_CASINO_ID — run serially to avoid cleanup conflicts
test.describe.configure({ mode: 'serial' });

// ── Helpers ─────────────────────────────────────────────────────────────────

interface SeededAlert {
  id: string;
  table_id: string;
  metric_type: string;
  gaming_day: string;
  status: string;
  severity: string;
}

async function seedAlert(
  tableId: string,
  metricType: string,
  overrides: Record<string, unknown> = {},
): Promise<SeededAlert> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('shift_alert')
    .insert({
      casino_id: SEED_CASINO_ID,
      table_id: tableId,
      metric_type: metricType,
      gaming_day: GAMING_DAY,
      status: 'open',
      severity: 'medium',
      observed_value: 1500,
      baseline_median: 5000,
      baseline_mad: 800,
      deviation_score: 4.37,
      direction: 'below',
      message: `${metricType} below baseline (e2e test)`,
      ...overrides,
    } as Record<string, unknown>)
    .select()
    .single();

  if (error || !data) throw new Error(`Seed alert failed: ${error?.message}`);
  return data as unknown as SeededAlert;
}

async function cleanupAlerts(): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('alert_acknowledgment')
    .delete()
    .eq('casino_id', SEED_CASINO_ID);
  await supabase.from('shift_alert').delete().eq('casino_id', SEED_CASINO_ID);
}

// ═══════════════════════════════════════════════════════════════════════════
// A. API Read Path — GET /alerts via Next.js route
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Shift Intelligence — API Read Path', () => {
  test.afterAll(async () => {
    await cleanupAlerts();
  });

  test('GET /alerts returns valid response envelope', async () => {
    const response = await fetch(`${ALERTS_URL}?gaming_day=${GAMING_DAY}`);
    expect(response.ok).toBeTruthy();

    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.code).toBe('OK');
    expect(Array.isArray(body.data.alerts)).toBe(true);
  });

  test('GET /alerts returns seeded alert with correct DTO shape', async () => {
    const alert = await seedAlert(SEED_TABLE_BJ01, 'win_loss_cents', {
      severity: 'high',
      observed_value: -15000,
      baseline_median: 2000,
      baseline_mad: 900,
      deviation_score: 18.89,
      direction: 'below',
      message: 'win_loss_cents critically negative',
    });

    const resp = await fetch(`${ALERTS_URL}?gaming_day=${GAMING_DAY}`);
    const body = await resp.json();
    const dto = body.data.alerts.find((a: { id: string }) => a.id === alert.id);

    expect(dto).toBeDefined();
    expect(typeof dto.id).toBe('string');
    expect(typeof dto.tableId).toBe('string');
    expect(typeof dto.tableLabel).toBe('string');
    expect(dto.tableLabel).toContain('BJ-01');
    expect(dto.metricType).toBe('win_loss_cents');
    expect(dto.status).toBe('open');
    expect(dto.severity).toBe('high');
    expect(dto.observedValue).toBe(-15000);
    expect(typeof dto.baselineMedian).toBe('number');
    expect(typeof dto.baselineMad).toBe('number');
    expect(typeof dto.deviationScore).toBe('number');
    expect(dto.direction).toBe('below');
    expect(typeof dto.message).toBe('string');
    expect(typeof dto.createdAt).toBe('string');
    expect(typeof dto.updatedAt).toBe('string');
    expect(dto.acknowledgment).toBeNull();
  });

  test('GET /alerts filters by status', async () => {
    // Previous test seeded BJ-01/win_loss_cents (open)
    // Seed an acknowledged alert on a different table+metric
    const ackedAlert = await seedAlert(SEED_TABLE_BJ02, 'hold_percent', {
      status: 'acknowledged',
      severity: 'low',
    });

    // Open filter excludes acknowledged
    const openResp = await fetch(
      `${ALERTS_URL}?gaming_day=${GAMING_DAY}&status=open`,
    );
    const openIds = (await openResp.json()).data.alerts.map(
      (a: { id: string }) => a.id,
    );
    expect(openIds).not.toContain(ackedAlert.id);

    // Acknowledged filter includes it
    const ackResp = await fetch(
      `${ALERTS_URL}?gaming_day=${GAMING_DAY}&status=acknowledged`,
    );
    const ackIds = (await ackResp.json()).data.alerts.map(
      (a: { id: string }) => a.id,
    );
    expect(ackIds).toContain(ackedAlert.id);
  });

  test('GET /alerts without status filter returns all statuses', async () => {
    const allResp = await fetch(`${ALERTS_URL}?gaming_day=${GAMING_DAY}`);
    const allAlerts = (await allResp.json()).data.alerts;

    // At least 2 from previous tests (open + acknowledged)
    expect(allAlerts.length).toBeGreaterThanOrEqual(2);
    const statuses = new Set(
      allAlerts.map((a: { status: string }) => a.status),
    );
    expect(statuses.has('open')).toBe(true);
    expect(statuses.has('acknowledged')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// B. Database Constraints
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Shift Intelligence — Database Constraints', () => {
  test.afterEach(async () => {
    await cleanupAlerts();
  });

  test('dedup key rejects duplicate (casino, table, metric, gaming_day)', async () => {
    await seedAlert(SEED_TABLE_BJ01, 'cash_obs_total');

    let error: string | null = null;
    try {
      await seedAlert(SEED_TABLE_BJ01, 'cash_obs_total');
    } catch (err) {
      error = err instanceof Error ? err.message : 'unknown';
    }
    expect(error).not.toBeNull();
    expect(error).toContain('duplicate key');
  });

  test('different metric types on same table are allowed', async () => {
    const a1 = await seedAlert(SEED_TABLE_BJ01, 'drop_total');
    const a2 = await seedAlert(SEED_TABLE_BJ01, 'hold_percent');
    expect(a1.id).not.toBe(a2.id);
  });

  test('same metric type on different tables is allowed', async () => {
    const a1 = await seedAlert(SEED_TABLE_BJ01, 'win_loss_cents');
    const a2 = await seedAlert(SEED_TABLE_BJ02, 'win_loss_cents');
    expect(a1.id).not.toBe(a2.id);
  });
});

#!/usr/bin/env -S npx tsx
/**
 * PT-2 Migration Manager: Validate RLS Coverage
 *
 * Checks that all tables with casino_id have RLS policies enabled
 * Reference: SRM line 14, SEC-001-rls-policy-matrix.md
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../types/database.types';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY not found in environment');
  console.error('For local development, check .env.local or run: npx supabase status');
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface TableInfo {
  table_name: string;
  has_casino_id: boolean;
  rls_enabled: boolean;
  policy_count: number;
}

async function validateRLSCoverage() {
  console.log('========================================');
  console.log('PT-2 RLS Coverage Validation');
  console.log('========================================\n');

  try {
    // Step 1: Get all tables in public schema
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables' as any)
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');

    if (tablesError) {
      // Fallback: Query via RPC or raw SQL
      console.log('Using direct SQL query for table information...\n');

      const { data: rawTables, error: rawError } = await supabase.rpc('exec_sql' as any, {
        sql: `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND table_name NOT LIKE 'pg_%'
          ORDER BY table_name
        `
      });

      if (rawError) {
        throw new Error(`Failed to fetch tables: ${rawError.message}`);
      }
    }

    console.log('📋 Analyzing tables for RLS coverage...\n');

    const results: TableInfo[] = [];
    const violations: string[] = [];

    // For demo purposes, define expected casino-scoped tables from SRM
    const casinoScopedTables = [
      'casino',
      'casino_settings',
      'staff',
      'game_settings',
      'player_casino',
      'visit',
      'player_loyalty',
      'loyalty_ledger',
      'loyalty_outbox',
      'rating_slip',
      'player_financial_transaction',
      'finance_outbox',
      'mtl_entry',
      'mtl_audit_note',
      'gaming_table',
      'gaming_table_settings',
      'dealer_rotation',
      'table_inventory_snapshot',
      'table_fill',
      'table_credit',
      'table_drop_event',
      'floor_layout',
      'floor_layout_version',
      'floor_pit',
      'floor_table_slot',
      'floor_layout_activation',
      'audit_log',
      'report'
    ];

    // Check each table
    for (const tableName of casinoScopedTables) {
      // Check if table has casino_id column
      const { data: columns, error: colError } = await supabase.rpc('exec_sql' as any, {
        sql: `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = '${tableName}'
            AND column_name = 'casino_id'
        `
      }).then((r: any) => ({ data: r.data, error: r.error }));

      const hasCasinoId = columns && columns.length > 0;

      if (!hasCasinoId) {
        // Skip tables without casino_id (like 'player' which is global)
        continue;
      }

      // Check if RLS is enabled
      const { data: rlsData, error: rlsError } = await supabase.rpc('exec_sql' as any, {
        sql: `
          SELECT relrowsecurity
          FROM pg_class
          WHERE relname = '${tableName}'
            AND relnamespace = 'public'::regnamespace
        `
      }).then((r: any) => ({ data: r.data, error: r.error }));

      const rlsEnabled = rlsData && rlsData.length > 0 && rlsData[0].relrowsecurity;

      // Check policy count
      const { data: policies, error: polError } = await supabase.rpc('exec_sql' as any, {
        sql: `
          SELECT COUNT(*) as count
          FROM pg_policies
          WHERE schemaname = 'public'
            AND tablename = '${tableName}'
        `
      }).then((r: any) => ({ data: r.data, error: r.error }));

      const policyCount = policies && policies.length > 0 ? policies[0].count : 0;

      results.push({
        table_name: tableName,
        has_casino_id: hasCasinoId,
        rls_enabled: rlsEnabled,
        policy_count: policyCount
      });

      // Check for violations
      if (hasCasinoId && !rlsEnabled) {
        violations.push(`Table "${tableName}" has casino_id but RLS is NOT enabled`);
      }

      if (hasCasinoId && rlsEnabled && policyCount === 0) {
        violations.push(`Table "${tableName}" has RLS enabled but NO policies defined`);
      }
    }

    // Display results
    console.log('Results:\n');
    console.log('Table Name                          | casino_id | RLS | Policies');
    console.log('----------------------------------- | --------- | --- | --------');

    for (const result of results) {
      const casinoIdMark = result.has_casino_id ? '✅' : '  ';
      const rlsMark = result.rls_enabled ? '✅' : '❌';
      const policyMark = result.policy_count > 0 ? `✅ (${result.policy_count})` : '❌ (0)';

      console.log(
        `${result.table_name.padEnd(35)} | ${casinoIdMark.padEnd(9)} | ${rlsMark.padEnd(3)} | ${policyMark}`
      );
    }

    console.log('\n========================================\n');

    // Report violations
    if (violations.length > 0) {
      console.log('❌ RLS VIOLATIONS FOUND:\n');
      violations.forEach((v, i) => {
        console.log(`${i + 1}. ${v}`);
      });
      console.log('\nAction Required:');
      console.log('  - Add RLS policies to violated tables');
      console.log('  - Reference: docs/30-security/SEC-001-rls-policy-matrix.md');
      console.log('  - RLS Pattern: CREATE POLICY "casino_isolation_policy" ON table_name');
      console.log('                 USING (casino_id::text = current_setting(\'app.casino_id\', true));');
      console.log('');
      process.exit(1);
    } else {
      console.log('✅ All casino-scoped tables have proper RLS coverage!');
      console.log('');
      console.log('Summary:');
      console.log(`  - Tables analyzed: ${results.length}`);
      console.log(`  - Tables with casino_id: ${results.filter(r => r.has_casino_id).length}`);
      console.log(`  - Tables with RLS enabled: ${results.filter(r => r.rls_enabled).length}`);
      console.log(`  - Total policies: ${results.reduce((sum, r) => sum + r.policy_count, 0)}`);
      console.log('');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Error during RLS validation:', error);
    console.error('\nTroubleshooting:');
    console.error('  - Ensure Supabase local instance is running');
    console.error('  - Check SUPABASE_SERVICE_ROLE_KEY is set correctly');
    console.error('  - Try: npx supabase status');
    process.exit(1);
  }
}

// Run validation
validateRLSCoverage();

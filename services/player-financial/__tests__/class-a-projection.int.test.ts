/** @jest-environment node */

// Integration tests for Class A projection invariants — PRD-087 WS4_TESTS.
//
// Covers I3 (duplicate delivery), I4 (replay), non-ledger preservation, amount
// unit integrity, and P0-2 backlog-empty completeness logic.
//
// All integration blocks require RUN_INTEGRATION_TESTS=true and a running local
// Supabase instance with Wave 2 migrations (Gate A + Gate B) applied.
// Run: supabase start && RUN_INTEGRATION_TESTS=true npx jest class-a-projection

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

const shouldRunIntegration = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration(
  'class-a-projection — integration (RUN_INTEGRATION_TESTS=true required)',
  () => {
    let supabase: SupabaseClient<Database>;
    let testCasinoId: string;
    let testTableId: string;
    let testPftId: string; // aggregate_id for outbox rows (PFT.id → visit_id derived in RPC)
    let testVisitId: string;
    let testGamingDay: string;

    // Tracks event_ids inserted in each test for afterEach cleanup.
    const trackedEventIds: string[] = [];

    beforeAll(async () => {
      const { createServiceClient } = await import('@/lib/supabase/service');
      supabase = createServiceClient();

      const { data: casino } = await supabase
        .from('casino')
        .select('id')
        .limit(1)
        .single();
      testCasinoId = casino?.id ?? '';
      expect(testCasinoId).toBeTruthy();

      const { data: table } = await supabase
        .from('gaming_table')
        .select('id')
        .eq('casino_id', testCasinoId)
        .limit(1)
        .single();
      testTableId = table?.id ?? '';
      expect(testTableId).toBeTruthy();

      // Anchor PFT: provides aggregate_id → visit_id derivation inside the RPC.
      // visit_id is NOT in the payload; rpc_process_class_a_projection JOINs PFT.
      const { data: pft } = await supabase
        .from('player_financial_transaction')
        .select('id, visit_id, gaming_day')
        .eq('casino_id', testCasinoId)
        .not('visit_id', 'is', null)
        .not('gaming_day', 'is', null)
        .limit(1)
        .single();
      testPftId = pft?.id ?? '';
      testVisitId = (pft?.visit_id as string) ?? '';
      testGamingDay = (pft?.gaming_day as string) ?? '';
      expect(testPftId).toBeTruthy();
      expect(testVisitId).toBeTruthy();
      expect(testGamingDay).toBeTruthy();
    });

    afterEach(async () => {
      // Clean up outbox rows and idempotency records created by each test.
      for (const id of trackedEventIds) {
        await supabase.from('finance_outbox').delete().eq('event_id', id);
        await supabase.from('processed_messages').delete().eq('message_id', id);
      }
      trackedEventIds.length = 0;
      // Clean up projection rows for the test visit (avoids cross-test accumulation).
      if (testVisitId) {
        await supabase
          .from('visit_class_a_projection')
          .delete()
          .eq('visit_id', testVisitId);
      }
      // Clean up any gaming_day_lifecycle row opened for completeness tests.
      if (testCasinoId && testGamingDay) {
        await supabase
          .from('gaming_day_lifecycle')
          .delete()
          .eq('casino_id', testCasinoId)
          .eq('gaming_day', testGamingDay);
      }
    });

    // ── Helpers ───────────────────────────────────────────────────────────────

    function makeEventId(): string {
      const id = crypto.randomUUID();
      trackedEventIds.push(id);
      return id;
    }

    async function insertLedgerRow(eventId: string, amount = 1000) {
      return supabase.from('finance_outbox').insert({
        event_id: eventId,
        event_type: 'buyin.recorded',
        casino_id: testCasinoId,
        table_id: testTableId,
        player_id: null,
        aggregate_id: testPftId, // PFT.id; RPC derives visit_id via JOIN
        fact_class: 'ledger',
        origin_label: 'actual',
        gaming_day: testGamingDay,
        // payload.amount is the integer-cent field; field name is 'amount' (not amount_cents)
        payload: { amount, tender_type: 'cash' },
      });
    }

    // Inserts an adjustment.recorded row — same PFT, different event_type avoids
    // the uq_finance_outbox_aggregate_event(aggregate_id, event_type) constraint.
    async function insertAdjustmentRow(eventId: string, amount = 300) {
      return supabase.from('finance_outbox').insert({
        event_id: eventId,
        event_type: 'adjustment.recorded',
        casino_id: testCasinoId,
        table_id: testTableId,
        player_id: null,
        aggregate_id: testPftId,
        fact_class: 'ledger',
        origin_label: 'actual',
        gaming_day: testGamingDay,
        payload: {
          amount,
          pft_direction: 'in',
          delta_direction: 'increase',
          reason_code: 'data_entry_error',
        },
      });
    }

    // ── I3: Duplicate delivery ─────────────────────────────────────────────────

    it('I3: second call with same message_id returns duplicate; projection stays at 1 row', async () => {
      const eventId = makeEventId();
      const { error: insertErr } = await insertLedgerRow(eventId);
      expect(insertErr).toBeNull();

      const { data: first, error: e1 } = await supabase.rpc(
        'rpc_process_class_a_projection',
        { p_message_id: eventId },
      );
      expect(e1).toBeNull();
      expect(first).toBe('processed');

      const { data: second, error: e2 } = await supabase.rpc(
        'rpc_process_class_a_projection',
        { p_message_id: eventId },
      );
      expect(e2).toBeNull();
      expect(second).toBe('duplicate');

      // Projection: exactly 1 row (not 2)
      const { count: projCount } = await supabase
        .from('visit_class_a_projection')
        .select('*', { count: 'exact', head: true })
        .eq('visit_id', testVisitId)
        .eq('gaming_day', testGamingDay);
      expect(projCount).toBe(1);

      // Idempotency: exactly 1 processed_messages row
      const { count: msgCount } = await supabase
        .from('processed_messages')
        .select('*', { count: 'exact', head: true })
        .eq('message_id', eventId);
      expect(msgCount).toBe(1);

      // finance_outbox.processed_at set on first successful call
      const { data: outboxRow } = await supabase
        .from('finance_outbox')
        .select('processed_at')
        .eq('event_id', eventId)
        .single();
      expect(outboxRow?.processed_at).not.toBeNull();
    });

    // ── I4: Replay ────────────────────────────────────────────────────────────

    it('I4: replay from reset state produces identical projection totals', async () => {
      // Use one buyin + one adjustment: different (aggregate_id, event_type) pairs
      // satisfy uq_finance_outbox_aggregate_event while proving multi-event replay.
      const eventIdA = makeEventId();
      const eventIdB = makeEventId();

      const { error: errA } = await insertLedgerRow(eventIdA, 1500);
      expect(errA).toBeNull();
      const { error: errB } = await insertAdjustmentRow(eventIdB, 500);
      expect(errB).toBeNull();

      // First pass: process both events
      for (const id of [eventIdA, eventIdB]) {
        const { data } = await supabase.rpc('rpc_process_class_a_projection', {
          p_message_id: id,
        });
        expect(data).toBe('processed');
      }

      // Record pre-replay state
      const { data: preState } = await supabase
        .from('visit_class_a_projection')
        .select('total_in, adjustment_net, event_count')
        .eq('visit_id', testVisitId)
        .eq('gaming_day', testGamingDay)
        .single();
      const preTotalIn = preState?.total_in;
      const preAdjustmentNet = preState?.adjustment_net;
      const preEventCount = preState?.event_count;
      // buyin.recorded → total_in; adjustment.recorded → adjustment_net (separate columns)
      expect(preTotalIn).toBe(1500);
      expect(preAdjustmentNet).toBe(500);
      expect(preEventCount).toBe(2);

      // Reset: delete projection + processed_messages + clear processed_at
      await supabase
        .from('visit_class_a_projection')
        .delete()
        .eq('visit_id', testVisitId);
      for (const id of [eventIdA, eventIdB]) {
        await supabase.from('processed_messages').delete().eq('message_id', id);
        await supabase
          .from('finance_outbox')
          .update({ processed_at: null })
          .eq('event_id', id);
      }

      // Replay in same order
      for (const id of [eventIdA, eventIdB]) {
        await supabase.rpc('rpc_process_class_a_projection', {
          p_message_id: id,
        });
      }

      // Assert identical state post-replay
      const { data: postState } = await supabase
        .from('visit_class_a_projection')
        .select('total_in, adjustment_net, event_count')
        .eq('visit_id', testVisitId)
        .eq('gaming_day', testGamingDay)
        .single();
      expect(postState?.total_in).toBe(preTotalIn);
      expect(postState?.adjustment_net).toBe(preAdjustmentNet);
      expect(postState?.event_count).toBe(preEventCount);
    });

    // ── Non-ledger preservation ───────────────────────────────────────────────

    it('non-ledger row: runConsumer returns skipped; processed_at remains NULL', async () => {
      const { runConsumer } = await import('../outbox-consumer');
      const { createServiceClient } = await import('@/lib/supabase/service');
      const svcClient = createServiceClient();

      const operationalEventId = makeEventId();
      await supabase.from('finance_outbox').insert({
        event_id: operationalEventId,
        event_type: 'fill.recorded',
        casino_id: testCasinoId,
        table_id: testTableId,
        player_id: null,
        aggregate_id: crypto.randomUUID(), // irrelevant; RPC never reached
        fact_class: 'operational',
        origin_label: 'actual',
        gaming_day: testGamingDay,
        payload: { amount: 500 },
      });

      // Pass the event DTO to runConsumer — fact_class guard fires before any RPC call
      const event = {
        event_id: operationalEventId,
        event_type: 'fill.recorded',
        casino_id: testCasinoId,
        table_id: testTableId,
        player_id: null,
        aggregate_id: crypto.randomUUID(),
        gaming_day: testGamingDay,
        created_at: new Date().toISOString(),
        processed_at: null,
        fact_class: 'operational' as const,
        origin_label: 'actual' as const,
        payload: {},
      };

      const result = await runConsumer(svcClient, event);
      expect(result).toBe('skipped');

      // DB state: processed_at must remain NULL (no RPC called, no write occurred)
      const { data: outboxRow } = await supabase
        .from('finance_outbox')
        .select('processed_at')
        .eq('event_id', operationalEventId)
        .single();
      expect(outboxRow?.processed_at).toBeNull();

      // No processed_messages row inserted
      const { count: msgCount } = await supabase
        .from('processed_messages')
        .select('*', { count: 'exact', head: true })
        .eq('message_id', operationalEventId);
      expect(msgCount).toBe(0);
    });

    // ── Amount unit integrity ─────────────────────────────────────────────────

    it('amount unit: projection total_in equals payload.amount exactly (no 100× corruption)', async () => {
      const eventId = makeEventId();
      const { error: insertErr } = await insertLedgerRow(eventId, 1000);
      expect(insertErr).toBeNull();

      await supabase.rpc('rpc_process_class_a_projection', {
        p_message_id: eventId,
      });

      const { data: proj } = await supabase
        .from('visit_class_a_projection')
        .select('total_in')
        .eq('visit_id', testVisitId)
        .eq('gaming_day', testGamingDay)
        .single();
      // Must be 1000 — not 100000 (×100) or 10 (÷100)
      expect(proj?.total_in).toBe(1000);
    });

    // ── P0-2: Backlog-empty completeness guard ────────────────────────────────

    it('P0-2: closed window + pending backlog = partial; closed + empty backlog = complete', async () => {
      const { getVisitClassACompleteness } = await import('../crud');

      // Process one event so a projection row exists
      const eventId1 = makeEventId();
      const { error: insertErr } = await insertLedgerRow(eventId1, 500);
      expect(insertErr).toBeNull();
      await supabase.rpc('rpc_process_class_a_projection', {
        p_message_id: eventId1,
      });

      // Close the gaming day
      const { error: closeErr } = await supabase.rpc('rpc_close_gaming_day', {
        p_casino_id: testCasinoId,
        p_gaming_day: testGamingDay,
      });
      expect(closeErr).toBeNull();

      // Insert a second unprocessed ledger event (simulates drain lag after close).
      // Uses adjustment.recorded to avoid uq_finance_outbox_aggregate_event on (testPftId, buyin.recorded).
      const eventId2 = makeEventId();
      const { error: insertErr2 } = await insertAdjustmentRow(eventId2, 300);
      expect(insertErr2).toBeNull();

      // Assert: closed window + non-empty backlog must NOT emit 'complete'
      const statusWithPending = await getVisitClassACompleteness(
        supabase,
        testVisitId,
        testCasinoId,
      );
      expect(statusWithPending).toBe('partial');

      // Drain: process the second event
      await supabase.rpc('rpc_process_class_a_projection', {
        p_message_id: eventId2,
      });

      // Assert: closed window + empty backlog = 'complete'
      const statusAfterDrain = await getVisitClassACompleteness(
        supabase,
        testVisitId,
        testCasinoId,
      );
      expect(statusAfterDrain).toBe('complete');
    });
  },
);

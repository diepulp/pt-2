// scripts/outbox-proof/run-all.ts
// PRD-082 Integration Proof Orchestrator — runs I1–I5 + drift check in sequence.

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runI1 } from './i1-atomicity';
import { runI2 } from './i2-durability';
import { runI3 } from './i3-idempotency';
import { runI4 } from './i4-replayability';
import { runI5 } from './i5-cashout-non-emission';
import { runDriftCheck } from './drift-check';

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('PRD-082 WAVE-2 INTEGRATION PROOF — STARTING');
  console.log('═══════════════════════════════════════════════════════');

  const i1 = await runI1();
  const i2 = await runI2();
  const i3 = await runI3();
  const i4 = await runI4();
  const i5 = await runI5();
  const drift = await runDriftCheck();

  const driftPass = drift.allNonBlocking;
  const all = [i1.pass, i2.pass, i3.pass, i4.pass, i5.pass, driftPass];
  const overall = all.every(Boolean);

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('PRD-082 WAVE-2 INTEGRATION PROOF — RESULTS');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`I1 Atomicity:            ${i1.pass ? 'PASS' : 'FAIL'}`);
  console.log(`I2 Durability:           ${i2.pass ? 'PASS' : 'FAIL'}`);
  console.log(`I3 Idempotency:          ${i3.pass ? 'PASS' : 'FAIL'}`);
  console.log(`I4 Replayability:        ${i4.pass ? 'PASS' : 'FAIL'}`);
  console.log(`I5 Cashout Non-Emission: ${i5.pass ? 'PASS' : 'FAIL'}`);
  console.log(
    `Drift Check:             ${driftPass ? 'PASS (ALL_NON_BLOCKING)' : 'FAIL (BLOCKING DRIFT DETECTED)'}`,
  );
  console.log('───────────────────────────────────────────────────────');
  if (!i1.pass) console.log(`  I1 detail: ${i1.detail}`);
  if (!i2.pass) console.log(`  I2 detail: ${i2.detail}`);
  if (!i3.pass) console.log(`  I3 detail: ${i3.detail}`);
  if (!i4.pass) console.log(`  I4 detail: ${i4.detail}`);
  if (!i5.pass) console.log(`  I5 detail: ${i5.detail}`);
  if (!driftPass)
    console.log(
      `  Drift blocking classes: ${drift.blockingClasses.join(', ')}`,
    );
  console.log(
    `OVERALL: ${overall ? 'PASS — all invariants proven' : 'FAIL — see details above'}`,
  );
  console.log('═══════════════════════════════════════════════════════');

  process.exit(overall ? 0 : 1);
}

main().catch((err) => {
  console.error('[run-all] FATAL:', err instanceof Error ? err.message : err);
  process.exit(1);
});

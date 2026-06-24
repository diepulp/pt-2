/** @jest-environment node */

/**
 * Windows RAW ESC/POS byte assembly + simulated spooler (PRD-093 WS_W2)
 *
 * Proves the Windows native path assembles the SAME ESC/POS bytes the CUPS path
 * emits (ESC @ init -> text -> feed -> GS V cut) and that the simulated spooler
 * returns the canonical accepted/rejected vocabulary — all WITHOUT a Windows
 * runner or a real printer (CI-safe, Linux). The real `winspool-print-helper.exe`
 * is exercised manually at Gate W-A.
 *
 * @see PRD-093 / EXEC-093 WS_W2
 */

import { describe, it, expect } from '@jest/globals';

import { createSimulatedWindowsSpooler } from '@/services/loyalty/printing/agent/windows-spooler-simulated';
import {
  createWindowsCommandSpooler,
  toEscPosBuffer,
} from '@/services/loyalty/printing/agent/windows-spooler-native';

// ESC @ = 0x1b 0x40 (initialize); GS V = 0x1d 0x56 (cut); m = 0x01 partial / 0x00 full.
const ESC = 0x1b;
const AT = 0x40;
const GS = 0x1d;
const V = 0x56;

describe('toEscPosBuffer — RAW byte assembly (FR-2)', () => {
  it('prefixes the buffer with the ESC @ initialize sequence', () => {
    const buf = toEscPosBuffer('HELLO');
    expect(buf[0]).toBe(ESC);
    expect(buf[1]).toBe(AT);
  });

  it('terminates with a GS V partial cut by default', () => {
    const buf = toEscPosBuffer('HELLO');
    expect(buf[buf.length - 3]).toBe(GS);
    expect(buf[buf.length - 2]).toBe(V);
    expect(buf[buf.length - 1]).toBe(0x01); // partial
  });

  it('emits a GS V full cut (0x00) when requested', () => {
    const buf = toEscPosBuffer('HELLO', 'full');
    expect(buf[buf.length - 1]).toBe(0x00); // full
  });

  it('includes a feed before the cut', () => {
    const buf = toEscPosBuffer('HELLO');
    // ...text -> "\n\n\n" feed -> GS V m (3 bytes). Feed bytes precede the cut.
    expect(buf[buf.length - 4]).toBe(0x0a); // last feed newline
  });

  it('carries the rendered body bytes between init and feed/cut', () => {
    const buf = toEscPosBuffer('ABC');
    const text = buf.subarray(2, buf.length - 6).toString('utf8');
    expect(text).toBe('ABC');
  });

  it('strips the renderer pure-text cut hint (a real GS V cut replaces it)', () => {
    const buf = toEscPosBuffer('LINE1\n-- cut (partial) --');
    const body = buf
      .subarray(2, buf.length - 6)
      .toString('utf8');
    expect(body).toBe('LINE1');
    expect(body).not.toContain('cut');
  });
});

describe('createSimulatedWindowsSpooler — canonical vocabulary (D6)', () => {
  it('accepts with a deterministic jobId derived from queue+body', async () => {
    const spooler = createSimulatedWindowsSpooler();
    const a = await spooler.submit({
      queue: 'EPSON TM-T88V',
      contentType: 'application/escpos',
      body: 'X',
    });
    const b = await spooler.submit({
      queue: 'EPSON TM-T88V',
      contentType: 'application/escpos',
      body: 'X',
    });
    expect(a.outcome).toBe('accepted');
    expect(a).toEqual(b); // deterministic / reproducible
    if (a.outcome !== 'rejected') {
      expect(a.jobId).toMatch(/^winsim-EPSON TM-T88V-/);
    }
  });

  it('surfaces a truthful rejection when configured (no fabricated success)', async () => {
    const spooler = createSimulatedWindowsSpooler({
      rejectAll: true,
      rejectReason: 'printer offline',
    });
    const r = await spooler.submit({
      queue: 'EPSON TM-T88V',
      contentType: 'application/escpos',
      body: 'X',
    });
    expect(r.outcome).toBe('rejected');
    if (r.outcome === 'rejected') {
      expect(r.reason).toBe('printer offline');
    }
  });
});

describe('createWindowsCommandSpooler — trusted-path guard (DEC-WIN-01)', () => {
  it('rejects a relative helper path at construction (no PATH/relative spawn)', () => {
    expect(() =>
      createWindowsCommandSpooler({ helperPath: 'winspool-print-helper.exe' }),
    ).toThrow(/absolute/i);
  });

  it('accepts an absolute helper path', () => {
    expect(() =>
      createWindowsCommandSpooler({
        helperPath: 'C:\\ProgramData\\d3lt\\print-agent\\native\\winspool-print-helper.exe',
      }),
    ).not.toThrow();
  });
});

import {
  calculateDurationSeconds,
  closeSlip,
  pauseSlip,
  resumeSlip,
  startSlip,
  type RatingSlipTimeline,
} from "@/services/rating-slip/state-machine";

describe("Rating Slip State Machine", () => {
  describe("startSlip", () => {
    it("creates slip with open status", () => {
      const start = new Date("2025-05-05T10:00:00Z");
      const timeline = startSlip(start);

      expect(timeline.status).toBe("open");
      expect(timeline.startTime).toBe(start);
      expect(timeline.endTime).toBeUndefined();
      expect(timeline.pauses).toEqual([]);
    });

    it("initializes with empty pause array", () => {
      const timeline = startSlip(new Date());

      expect(timeline.pauses).toHaveLength(0);
    });
  });

  describe("pauseSlip", () => {
    it("transitions open → paused", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));

      expect(paused.status).toBe("paused");
      expect(paused.pauses).toHaveLength(1);
      expect(paused.pauses[0].start).toEqual(new Date("2025-05-05T10:10:00Z"));
      expect(paused.pauses[0].end).toBeUndefined();
    });

    it("rejects pausing already paused slip", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:05:00Z"));

      expect(() => pauseSlip(paused, new Date("2025-05-05T10:06:00Z"))).toThrow(
        "Only open slips can be paused",
      );
    });

    it("rejects pausing closed slip", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const closed = closeSlip(opened, new Date("2025-05-05T10:20:00Z"));

      expect(() => pauseSlip(closed, new Date("2025-05-05T10:25:00Z"))).toThrow(
        "Only open slips can be paused",
      );
    });

    it("enforces chronology: pause time must be after start", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));

      expect(() => pauseSlip(opened, new Date("2025-05-05T09:59:00Z"))).toThrow(
        /must be later than/,
      );
    });

    it("enforces chronology: pause time must be after previous event", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      const resumed = resumeSlip(paused, new Date("2025-05-05T10:20:00Z"));

      expect(() =>
        pauseSlip(resumed, new Date("2025-05-05T10:15:00Z")),
      ).toThrow(/must be later than/);
    });
  });

  describe("resumeSlip", () => {
    it("transitions paused → open", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      const resumed = resumeSlip(paused, new Date("2025-05-05T10:20:00Z"));

      expect(resumed.status).toBe("open");
      expect(resumed.pauses).toHaveLength(1);
      expect(resumed.pauses[0].start).toEqual(new Date("2025-05-05T10:10:00Z"));
      expect(resumed.pauses[0].end).toEqual(new Date("2025-05-05T10:20:00Z"));
    });

    it("rejects resuming non-paused slip", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));

      expect(() =>
        resumeSlip(opened, new Date("2025-05-05T10:05:00Z")),
      ).toThrow("Only paused slips can be resumed");
    });

    it("rejects resuming closed slip", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      const closed = closeSlip(paused, new Date("2025-05-05T10:25:00Z"));

      expect(() =>
        resumeSlip(closed, new Date("2025-05-05T10:30:00Z")),
      ).toThrow("Only paused slips can be resumed");
    });

    it("enforces chronology: resume time must be after pause start", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));

      expect(() =>
        resumeSlip(paused, new Date("2025-05-05T10:09:00Z")),
      ).toThrow(/must be later than/);
    });
  });

  describe("closeSlip", () => {
    it("transitions open → closed", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const closed = closeSlip(opened, new Date("2025-05-05T10:20:00Z"));

      expect(closed.status).toBe("closed");
      expect(closed.endTime).toEqual(new Date("2025-05-05T10:20:00Z"));
    });

    it("transitions paused → closed and closes pause interval", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      const closed = closeSlip(paused, new Date("2025-05-05T10:25:00Z"));

      expect(closed.status).toBe("closed");
      expect(closed.endTime).toEqual(new Date("2025-05-05T10:25:00Z"));
      expect(closed.pauses).toHaveLength(1);
      expect(closed.pauses[0].end).toEqual(new Date("2025-05-05T10:25:00Z"));
    });

    it("rejects closing already closed slip", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const closed = closeSlip(opened, new Date("2025-05-05T10:20:00Z"));

      expect(() => closeSlip(closed, new Date("2025-05-05T10:25:00Z"))).toThrow(
        "Slip is already closed",
      );
    });

    it("enforces chronology: close time must be after start", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));

      expect(() => closeSlip(opened, new Date("2025-05-05T09:59:00Z"))).toThrow(
        /must be later than/,
      );
    });
  });

  describe("calculateDurationSeconds", () => {
    it("calculates duration without pauses", () => {
      const start = new Date("2025-05-05T10:00:00Z");
      const end = new Date("2025-05-05T10:20:00Z");

      const opened = startSlip(start);
      const closed = closeSlip(opened, end);

      expect(calculateDurationSeconds(closed)).toBe(20 * 60);
    });

    it("excludes pause time from duration", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      const resumed = resumeSlip(paused, new Date("2025-05-05T10:20:00Z"));
      const closed = closeSlip(resumed, new Date("2025-05-05T10:40:00Z"));

      // 40 min total - 10 min paused = 30 min active
      expect(calculateDurationSeconds(closed)).toBe(30 * 60);
    });

    it("handles multiple pause/resume cycles", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused1 = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      const resumed1 = resumeSlip(paused1, new Date("2025-05-05T10:15:00Z")); // 5 min pause
      const paused2 = pauseSlip(resumed1, new Date("2025-05-05T10:25:00Z"));
      const resumed2 = resumeSlip(paused2, new Date("2025-05-05T10:35:00Z")); // 10 min pause
      const closed = closeSlip(resumed2, new Date("2025-05-05T10:45:00Z"));

      // 45 min total - 15 min paused = 30 min active
      expect(calculateDurationSeconds(closed)).toBe(30 * 60);
    });

    it("calculates current duration for open slip (as of now)", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));

      const asOf = new Date("2025-05-05T10:30:00Z");
      expect(calculateDurationSeconds(opened, asOf)).toBe(30 * 60);
    });

    it("calculates current duration for paused slip (freezes at pause)", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));

      // Even if we check 20 minutes later, duration is still 10 min
      const asOf = new Date("2025-05-05T10:30:00Z");
      expect(calculateDurationSeconds(paused, asOf)).toBe(10 * 60);
    });

    it("allows closing paused slip and freezes duration at pause time", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      const closed = closeSlip(paused, new Date("2025-05-05T10:25:00Z"));

      // Duration frozen at pause time (10 min active)
      expect(calculateDurationSeconds(closed)).toBe(10 * 60);
    });

    it("returns 0 for very short duration", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00.000Z"));
      const closed = closeSlip(opened, new Date("2025-05-05T10:00:00.001Z"));

      // 1ms = 0 seconds (floor)
      expect(calculateDurationSeconds(closed)).toBe(0);
    });

    it("handles sub-second precision correctly", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00.000Z"));
      const closed = closeSlip(opened, new Date("2025-05-05T10:00:00.500Z"));

      // 500ms = 0 seconds (floor)
      expect(calculateDurationSeconds(closed)).toBe(0);
    });

    it("rounds down fractional seconds", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00.000Z"));
      const closed = closeSlip(opened, new Date("2025-05-05T10:00:01.999Z"));

      // 1.999 seconds → 1 second (floor)
      expect(calculateDurationSeconds(closed)).toBe(1);
    });
  });

  describe("lifecycle scenarios", () => {
    it("completes full flow: open → paused → resumed → closed", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      expect(opened.status).toBe("open");

      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      expect(paused.status).toBe("paused");

      const resumed = resumeSlip(paused, new Date("2025-05-05T10:20:00Z"));
      expect(resumed.status).toBe("open");

      const closed = closeSlip(resumed, new Date("2025-05-05T10:40:00Z"));
      expect(closed.status).toBe("closed");

      // 40 min total - 10 min paused = 30 min active
      expect(calculateDurationSeconds(closed)).toBe(30 * 60);
    });

    it("completes simple flow: open → closed (no pauses)", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const closed = closeSlip(opened, new Date("2025-05-05T10:20:00Z"));

      expect(closed.status).toBe("closed");
      expect(calculateDurationSeconds(closed)).toBe(20 * 60);
    });

    it("completes flow: open → paused → closed (without resume)", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));
      const closed = closeSlip(paused, new Date("2025-05-05T10:25:00Z"));

      expect(closed.status).toBe("closed");
      // Duration frozen at pause time (10 min)
      expect(calculateDurationSeconds(closed)).toBe(10 * 60);
    });

    it("prevents closed → any transition (terminal state)", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const closed = closeSlip(opened, new Date("2025-05-05T10:20:00Z"));

      expect(() =>
        pauseSlip(closed, new Date("2025-05-05T10:25:00Z")),
      ).toThrow();
      expect(() =>
        closeSlip(closed, new Date("2025-05-05T10:30:00Z")),
      ).toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles rapid pause/resume cycles", () => {
      let timeline = startSlip(new Date("2025-05-05T10:00:00Z"));

      // Pause and resume 3 times in quick succession
      timeline = pauseSlip(timeline, new Date("2025-05-05T10:01:00Z"));
      timeline = resumeSlip(timeline, new Date("2025-05-05T10:02:00Z"));
      timeline = pauseSlip(timeline, new Date("2025-05-05T10:03:00Z"));
      timeline = resumeSlip(timeline, new Date("2025-05-05T10:04:00Z"));
      timeline = pauseSlip(timeline, new Date("2025-05-05T10:05:00Z"));
      timeline = resumeSlip(timeline, new Date("2025-05-05T10:06:00Z"));
      timeline = closeSlip(timeline, new Date("2025-05-05T10:10:00Z"));

      // 10 min total - 3 min paused = 7 min active
      expect(calculateDurationSeconds(timeline)).toBe(7 * 60);
    });

    it("preserves immutability: operations return new objects", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));

      expect(opened).not.toBe(paused);
      expect(opened.status).toBe("open");
      expect(paused.status).toBe("paused");
    });

    it("does not mutate pauses array", () => {
      const opened = startSlip(new Date("2025-05-05T10:00:00Z"));
      const originalPauses = opened.pauses;

      const paused = pauseSlip(opened, new Date("2025-05-05T10:10:00Z"));

      expect(opened.pauses).toBe(originalPauses);
      expect(opened.pauses).toHaveLength(0);
      expect(paused.pauses).toHaveLength(1);
    });
  });
});

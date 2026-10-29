import { describe, it, expect, beforeEach } from "vitest";
import { ScheduleEvaluator } from "@/scheduler/evaluator";

describe("Milestone 6: Scheduler Timezones, DST & Configuration (T-020, T-030)", () => {
  beforeEach(() => {
    ScheduleEvaluator.clearStore();
  });

  describe("T-020: Dynamic schedule time & timezone change", () => {
    it("evaluates correctly using Asia/Kolkata (UTC+5:30) at 09:00", async () => {
      // 03:35 UTC is 09:05 Asia/Kolkata (within [09:00, 09:15) catch-up window)
      const nowUtc = new Date("2026-10-29T03:35:00.000Z");

      const result = await ScheduleEvaluator.evaluateSchedule({
        now: nowUtc,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: async () => true,
        aggregatorOverrides: {
          calendar: async () => [],
          trello: async () => [],
          gmail: async () => ({ messages: [], isTruncated: false }),
          slack: async () => [],
        },
      });

      expect(result.triggered).toBe(true);
      expect(result.idempotencyKey).toBe("daily-summary:2026-10-29");
      expect(result.deliveryStatus).toBe("sent");
    });

    it("dynamically adapts when DAILY_SUMMARY_TIME and APP_TIMEZONE change to America/New_York at 14:00", async () => {
      // In America/New_York (EDT UTC-4 in October), 14:05 local is 18:05 UTC
      const nowUtc = new Date("2026-10-29T18:05:00.000Z");

      const result = await ScheduleEvaluator.evaluateSchedule({
        now: nowUtc,
        summaryTime: "14:00",
        timeZone: "America/New_York",
        telegramSender: async () => true,
        aggregatorOverrides: {
          calendar: async () => [],
          trello: async () => [],
          gmail: async () => ({ messages: [], isTruncated: false }),
          slack: async () => [],
        },
      });

      expect(result.triggered).toBe(true);
      expect(result.idempotencyKey).toBe("daily-summary:2026-10-29");
      expect(result.deliveryStatus).toBe("sent");
    });
  });

  describe("T-030: DST Transition and Leap Day Handling", () => {
    it("handles DST transition correctly without 1-hour time drift", () => {
      // US DST begins second Sunday of March.
      // In 2026: March 8. Before DST (Standard Time EST = UTC-5). After DST (Daylight Time EDT = UTC-4).
      const winterDate = new Date("2026-01-15T14:00:00.000Z"); // 09:00 EST
      const summerDate = new Date("2026-07-15T13:00:00.000Z"); // 09:00 EDT

      const winterLocalTime = ScheduleEvaluator.getLocalTime(winterDate, "America/New_York");
      const summerLocalTime = ScheduleEvaluator.getLocalTime(summerDate, "America/New_York");

      expect(winterLocalTime).toBe("09:00");
      expect(summerLocalTime).toBe("09:00");
    });

    it("correctly calculates local calendar dates across leap year days", () => {
      // 2028 is a leap year; test 2028-02-29
      const leapDay = new Date("2028-02-29T03:30:00.000Z");
      const localDate = ScheduleEvaluator.getLocalDate(leapDay, "Asia/Kolkata");
      expect(localDate).toBe("2028-02-29");
    });
  });

  describe("15-Minute Catch-Up Window Calculation", () => {
    it("triggers when within [scheduled, scheduled + 15m)", async () => {
      const now = new Date("2026-10-29T03:40:00.000Z"); // 09:10 Asia/Kolkata (+10m)
      const result = await ScheduleEvaluator.evaluateSchedule({
        now,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: async () => true,
        aggregatorOverrides: {
          calendar: async () => [],
          trello: async () => [],
          gmail: async () => ({ messages: [], isTruncated: false }),
          slack: async () => [],
        },
      });
      expect(result.triggered).toBe(true);
    });

    it("does not trigger when current time is before the scheduled window", async () => {
      const now = new Date("2026-10-29T03:15:00.000Z"); // 08:45 Asia/Kolkata (-15m before 09:00)
      const result = await ScheduleEvaluator.evaluateSchedule({
        now,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
      });
      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("outside scheduled window");
    });
  });
});

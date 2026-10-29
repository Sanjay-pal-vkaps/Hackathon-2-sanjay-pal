import { describe, it, expect, beforeEach } from "vitest";
import { ScheduleEvaluator } from "@/scheduler/evaluator";
import { MultiProviderAggregator } from "@/scheduler/aggregator";

describe("Milestone 6 Integration: Daily Summary Scheduling, Failures & Recovery (T-004, T-016, T-021, T-028)", () => {
  beforeEach(() => {
    ScheduleEvaluator.clearStore();
  });

  describe("T-004 & T-016: Partial Provider Failures and Read Timeouts", () => {
    it("labels timed-out or disconnected provider as [Unavailable] without fabricating data", async () => {
      const now = new Date("2026-10-29T03:35:00.000Z"); // 09:05 Asia/Kolkata

      let sentMessage = "";
      const result = await ScheduleEvaluator.evaluateSchedule({
        now,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: async (text) => {
          sentMessage = text;
          return true;
        },
        aggregatorOverrides: {
          calendar: async () => [
            {
              id: "ev-1",
              summary: "Sprint Retro",
              startTime: "2026-10-29T10:00:00Z",
              endTime: "2026-10-29T11:00:00Z",
              htmlLink: "https://calendar.google.com/1",
            },
          ],
          trello: async () => {
            // Simulate Trello API timeout (T-016)
            throw new Error("ETIMEDOUT: Trello read timeout");
          },
          gmail: async () => ({ messages: [], isTruncated: false }),
          slack: async () => [],
        },
      });

      expect(result.triggered).toBe(true);
      expect(result.deliveryStatus).toBe("sent");
      expect(result.summaryData?.providerStatuses.trello).toBe("unavailable");
      expect(result.summaryData?.providerStatuses.calendar).toBe("available");
      expect(sentMessage).toContain("Trello: [Unavailable]");
      expect(sentMessage).toContain("Sprint Retro");
    });
  });

  describe("T-021: Scheduled Run Idempotency, 15m Stale Lock & Delivery Retry", () => {
    it("prevents duplicate run on the same calendar day", async () => {
      const now = new Date("2026-10-29T03:35:00.000Z");

      // First run: executes and completes
      const first = await ScheduleEvaluator.evaluateSchedule({
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
      expect(first.triggered).toBe(true);

      // Second run within same window / day
      const second = await ScheduleEvaluator.evaluateSchedule({
        now: new Date("2026-10-29T03:40:00.000Z"),
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: async () => true,
      });
      expect(second.triggered).toBe(false);
      expect(second.reason).toContain("already completed for today");
    });

    it("evicts stale lock after 15 minutes of being stuck in executing", async () => {
      const startTime = new Date("2026-10-29T03:30:00.000Z");
      const key = "daily-summary:2026-10-29";

      // Manually simulate a crashed job stuck in executing for 16 minutes
      (ScheduleEvaluator as any).jobStore.set(key, {
        id: "job-stalled-1",
        jobType: "daily_summary",
        scheduledFor: startTime,
        startedAt: new Date(startTime.getTime() - 16 * 60 * 1000), // 16 minutes ago
        status: "executing",
        providerStatuses: {},
        telegramDeliveryStatus: "pending",
        idempotencyKey: key,
      });

      // Next evaluator cycle triggers recovery because stale lock is evicted
      const recovery = await ScheduleEvaluator.evaluateSchedule({
        now: startTime,
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

      expect(recovery.triggered).toBe(true);
      expect(recovery.deliveryStatus).toBe("sent");
    });

    it("checks delivery status during recovery to minimize duplicate Telegram messages", async () => {
      const now = new Date("2026-10-29T03:35:00.000Z");
      const key = "daily-summary:2026-10-29";

      let telegramDeliveryCount = 0;
      const telegramSender = async () => {
        telegramDeliveryCount++;
        return true;
      };

      // Set existing failed run where telegram was ALREADY sent before crash
      (ScheduleEvaluator as any).jobStore.set(key, {
        id: "job-failed-after-send",
        jobType: "daily_summary",
        scheduledFor: now,
        startedAt: new Date(now.getTime() - 5 * 60 * 1000),
        status: "failed",
        providerStatuses: {},
        telegramDeliveryStatus: "sent", // Already delivered!
        idempotencyKey: key,
        errorMessage: "Post-delivery DB crash",
      });

      const res = await ScheduleEvaluator.evaluateSchedule({
        now,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender,
      });

      // Does NOT re-send telegram message since it was already delivered!
      expect(telegramDeliveryCount).toBe(0);
      expect(res.deliveryStatus).toBe("skipped");
    });
  });

  describe("T-028: Telegram API Delivery Failure", () => {
    it("records delivery failure in database run status and flags operational error", async () => {
      const now = new Date("2026-10-29T03:35:00.000Z");

      const result = await ScheduleEvaluator.evaluateSchedule({
        now,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: async () => {
          // Simulate Telegram 500 error / network disconnect
          throw new Error("Telegram API 500: Internal Server Error");
        },
        aggregatorOverrides: {
          calendar: async () => [],
          trello: async () => [],
          gmail: async () => ({ messages: [], isTruncated: false }),
          slack: async () => [],
        },
      });

      expect(result.triggered).toBe(true);
      expect(result.deliveryStatus).toBe("failed");

      const job = ScheduleEvaluator.getJob("daily-summary:2026-10-29");
      expect(job?.status).toBe("failed");
      expect(job?.telegramDeliveryStatus).toBe("failed");
      expect(job?.errorMessage).toContain("Telegram API 500");
    });
  });
});

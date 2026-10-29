import { describe, it, expect, beforeEach } from "vitest";
import { ScheduleEvaluator } from "@/scheduler/evaluator";
import { TelegramMessageFormatter } from "@/scheduler/formatter";

describe("Milestone 3: Dynamic Schedule Evaluator & Daily Summary", () => {
  beforeEach(() => {
    ScheduleEvaluator.clearStore();
  });

  describe("T-020 & T-030: Timezone and Dynamic Schedule Triggering", () => {
    it("triggers summary when local wall-clock matches scheduled time within 15m catch-up window", async () => {
      // 09:05 AM in Asia/Kolkata (UTC is 03:35 AM)
      const now = new Date("2026-10-29T03:35:00.000Z");
      let sentCount = 0;
      const mockSender = async () => {
        sentCount++;
        return true;
      };

      const result = await ScheduleEvaluator.evaluateSchedule({
        now,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: mockSender,
      });

      expect(result.triggered).toBe(true);
      expect(result.idempotencyKey).toBe("daily-summary:2026-10-29");
      expect(result.deliveryStatus).toBe("sent");
      expect(sentCount).toBeGreaterThan(0);
    });

    it("does not trigger when current local time is before the scheduled window", async () => {
      // 08:30 AM in Asia/Kolkata
      const now = new Date("2026-10-29T03:00:00.000Z");

      const result = await ScheduleEvaluator.evaluateSchedule({
        now,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
      });

      expect(result.triggered).toBe(false);
      expect(result.reason).toContain("outside scheduled window");
    });
  });

  describe("T-021: Atomic Daily Lock & Duplicate Prevention", () => {
    it("strictly prevents duplicate daily summary delivery on repeated evaluations on the same day", async () => {
      const now1 = new Date("2026-10-29T03:35:00.000Z"); // 09:05 AM IST
      let messagesDispatched = 0;
      const mockSender = async () => {
        messagesDispatched++;
        return true;
      };

      // First run: executes and delivers
      const res1 = await ScheduleEvaluator.evaluateSchedule({
        now: now1,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: mockSender,
      });
      expect(res1.triggered).toBe(true);
      expect(messagesDispatched).toBe(1);

      // Second run 5 minutes later on the same calendar day: blocked by completion lock
      const now2 = new Date("2026-10-29T03:40:00.000Z"); // 09:10 AM IST
      const res2 = await ScheduleEvaluator.evaluateSchedule({
        now: now2,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: mockSender,
      });
      expect(res2.triggered).toBe(false);
      expect(res2.reason).toContain("already completed for today");
      expect(messagesDispatched).toBe(1); // No duplicate dispatch
    });
  });

  describe("Scheduler Crash Recovery & 15-Minute Stale Lock Eviction", () => {
    it("evicts stale executing lock older than 15 minutes and permits safe recovery retry", async () => {
      const startTime = new Date("2026-10-29T03:35:00.000Z"); // 09:05 AM IST

      // Simulate a crashed worker leaving an executing lock
      const runRecord = {
        id: "run-stale-1",
        jobType: "daily_summary",
        scheduledFor: new Date("2026-10-29T09:00:00Z"),
        startedAt: startTime,
        status: "executing" as const,
        providerStatuses: {},
        telegramDeliveryStatus: "pending" as const,
        idempotencyKey: "daily-summary:2026-10-29",
      };
      (ScheduleEvaluator as any).jobStore.set("daily-summary:2026-10-29", runRecord);

      // Evaluation runs 20 minutes later (stale lock threshold of 15m exceeded)
      const recoveryTime = new Date("2026-10-29T03:55:00.000Z"); // 09:25 AM IST
      let recoveryDispatched = false;

      const result = await ScheduleEvaluator.evaluateSchedule({
        now: recoveryTime,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        telegramSender: async () => {
          recoveryDispatched = true;
          return true;
        },
      });

      expect(result.triggered).toBe(true);
      expect(recoveryDispatched).toBe(true);
      expect(result.deliveryStatus).toBe("sent");
    });
  });

  describe("T-004: Provider Partial Failure Degradation", () => {
    it("marks failing providers as [Unavailable] and safely renders remaining available data", async () => {
      const now = new Date("2026-10-29T03:35:00.000Z");

      // Inject a failing calendar fetcher while Gmail/Trello succeed
      const failingCalendarFetcher = async () => {
        throw new Error("Calendar service 503");
      };

      const result = await ScheduleEvaluator.evaluateSchedule({
        now,
        summaryTime: "09:00",
        timeZone: "Asia/Kolkata",
        aggregatorOverrides: {
          calendarFetcher: failingCalendarFetcher,
        },
      });

      expect(result.triggered).toBe(true);
      expect(result.summaryData?.providerStatuses.calendar).toBe("unavailable");

      const text = result.formattedChunks?.[0] || "";
      expect(text).toContain("Google Calendar: [Unavailable]");
      expect(text).not.toContain("Error 503"); // Clean non-leaking presentation
    });
  });

  describe("T-022: Telegram Message Chunking (>4096 characters)", () => {
    it("splits long summaries exceeding 4096 characters safely into sequential messages", () => {
      // Create text with length 6000
      const paragraph = "• Meeting with stakeholders discussing Q4 roadmap priorities and deadlines.\n";
      const longText = paragraph.repeat(80); // ~6000 chars

      const chunks = TelegramMessageFormatter.chunkMessage(longText);

      expect(chunks.length).toBeGreaterThan(1);
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(4096);
      }
    });
  });
});

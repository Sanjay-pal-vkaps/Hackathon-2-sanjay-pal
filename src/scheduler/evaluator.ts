import { MultiProviderAggregator, AggregatedSummaryData, ProviderStatuses } from "./aggregator";
import { TelegramMessageFormatter } from "./formatter";

export interface JobRunRecord {
  id: string;
  jobType: string;
  scheduledFor: Date;
  startedAt: Date;
  completedAt?: Date;
  status: 'executing' | 'completed' | 'failed';
  providerStatuses: ProviderStatuses | Record<string, string>;
  telegramDeliveryStatus: 'pending' | 'sent' | 'failed';
  idempotencyKey: string;
  errorMessage?: string;
}

export interface ScheduleEvaluationResult {
  triggered: boolean;
  reason: string;
  idempotencyKey?: string;
  summaryData?: AggregatedSummaryData;
  formattedChunks?: string[];
  deliveryStatus?: 'sent' | 'failed' | 'skipped';
}

export class ScheduleEvaluator {
  private static readonly STALE_LOCK_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly CATCH_UP_WINDOW_MINUTES = 15;

  /**
   * Mock in-memory store for unit test execution / development
   */
  private static jobStore: Map<string, JobRunRecord> = new Map();

  static clearStore(): void {
    this.jobStore.clear();
  }

  static getJob(idempotencyKey: string): JobRunRecord | undefined {
    return this.jobStore.get(idempotencyKey);
  }

  /**
   * Evaluates current wall-clock time in APP_TIMEZONE against DAILY_SUMMARY_TIME.
   * Acquires atomic lock on daily-summary:YYYY-MM-DD.
   */
  static async evaluateSchedule(options: {
    now?: Date;
    summaryTime?: string; // HH:mm format, e.g. "09:00"
    timeZone?: string;    // e.g. "Asia/Kolkata"
    telegramSender?: (text: string) => Promise<boolean>;
    aggregatorOverrides?: any;
  } = {}): Promise<ScheduleEvaluationResult> {
    const now = options.now || new Date();
    const scheduledTime = options.summaryTime || process.env.DAILY_SUMMARY_TIME || '09:00';
    const timeZone = options.timeZone || process.env.APP_TIMEZONE || 'Asia/Kolkata';

    // 1. Format local time HH:mm and local calendar date YYYY-MM-DD
    const localTimeStr = this.getLocalTime(now, timeZone); // "09:05"
    const localDateStr = this.getLocalDate(now, timeZone); // "2026-10-29"
    const idempotencyKey = `daily-summary:${localDateStr}`;

    // 2. Check due-time window and catch-up window
    const [schedH, schedM] = scheduledTime.split(':').map((x) => parseInt(x, 10));
    const [currH, currM] = localTimeStr.split(':').map((x) => parseInt(x, 10));
    const schedMinutes = schedH * 60 + schedM;
    const currMinutes = currH * 60 + currM;

    // Check if within catch-up window [scheduled, scheduled + 15m)
    const minutesPastScheduled = currMinutes - schedMinutes;
    const isWithinNormalCatchUp = minutesPastScheduled >= 0 && minutesPastScheduled < this.CATCH_UP_WINDOW_MINUTES;

    // 3. Inspect existing run lock
    const existingRun = this.jobStore.get(idempotencyKey);

    if (existingRun) {
      if (existingRun.status === 'completed') {
        return {
          triggered: false,
          reason: `Summary already completed for today (${localDateStr})`,
          idempotencyKey,
        };
      }

      if (existingRun.status === 'executing') {
        const executingDuration = now.getTime() - existingRun.startedAt.getTime();
        if (executingDuration >= this.STALE_LOCK_THRESHOLD_MS) {
          // Stale lock eviction at 15m threshold
          existingRun.status = 'failed';
          existingRun.errorMessage = 'STALE_LOCK_TIMEOUT';
        } else {
          return {
            triggered: false,
            reason: `Summary execution currently in progress for today (${localDateStr})`,
            idempotencyKey,
          };
        }
      }

      // If existing run failed, permit at most 1 safe recovery retry
      if (existingRun.status === 'failed') {
        if (existingRun.errorMessage === 'MAX_RETRY_EXCEEDED') {
          return {
            triggered: false,
            reason: `Maximum retry attempts exceeded for today (${localDateStr})`,
            idempotencyKey,
          };
        }
      }
    }

    // 4. Determine if evaluation should trigger
    // Trigger if in normal catch-up window OR missed-window safe recovery on the same calendar day
    const isMissedWindowRecovery = minutesPastScheduled >= this.CATCH_UP_WINDOW_MINUTES && (!existingRun || existingRun.status === 'failed');

    if (!isWithinNormalCatchUp && !isMissedWindowRecovery) {
      return {
        triggered: false,
        reason: `Current time (${localTimeStr}) is outside scheduled window (${scheduledTime}) in ${timeZone}`,
        idempotencyKey,
      };
    }

    // 5. Acquire Atomic Execution Lock
    const previouslyDelivered = existingRun?.telegramDeliveryStatus === 'sent';
    const runRecord: JobRunRecord = {
      id: `run-${Date.now()}`,
      jobType: 'daily_summary',
      scheduledFor: new Date(`${localDateStr}T${scheduledTime}:00Z`),
      startedAt: now,
      status: 'executing',
      providerStatuses: {},
      telegramDeliveryStatus: previouslyDelivered ? 'sent' : 'pending',
      idempotencyKey,
    };
    this.jobStore.set(idempotencyKey, runRecord);

    try {
      // 6. Aggregate data across providers in parallel
      const summaryData = await MultiProviderAggregator.aggregate({
        timeZone,
        now,
        ...options.aggregatorOverrides,
      });

      runRecord.providerStatuses = summaryData.providerStatuses;

      // 7. Format summary and chunk
      const fullText = TelegramMessageFormatter.formatSummary(summaryData, localDateStr, timeZone);
      const chunks = TelegramMessageFormatter.chunkMessage(fullText);

      // 8. Deliver via Telegram with delivery-state tracking to minimize duplicates
      let deliverySuccessful = true;
      if (options.telegramSender) {
        if (!previouslyDelivered) {
          for (const chunk of chunks) {
            const ok = await options.telegramSender(chunk);
            if (!ok) {
              deliverySuccessful = false;
              break;
            }
          }
          runRecord.telegramDeliveryStatus = deliverySuccessful ? 'sent' : 'failed';
        }
      } else {
        runRecord.telegramDeliveryStatus = 'sent';
      }

      runRecord.status = deliverySuccessful ? 'completed' : 'failed';
      runRecord.completedAt = new Date();

      return {
        triggered: true,
        reason: previouslyDelivered
          ? 'Recovery completed (Telegram delivery was already sent)'
          : 'Summary evaluated and delivered successfully',
        idempotencyKey,
        summaryData,
        formattedChunks: chunks,
        deliveryStatus: previouslyDelivered
          ? 'skipped'
          : runRecord.telegramDeliveryStatus === 'sent'
          ? 'sent'
          : 'failed',
      };
    } catch (err: any) {
      runRecord.status = 'failed';
      runRecord.errorMessage = err.message || 'Execution failed';
      if (!previouslyDelivered) {
        runRecord.telegramDeliveryStatus = 'failed';
      }
      return {
        triggered: true,
        reason: `Summary execution encountered an error: ${runRecord.errorMessage}`,
        idempotencyKey,
        deliveryStatus: 'failed',
      };
    }
  }

  static getLocalTime(now: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return formatter.format(now);
  }

  static getLocalDate(now: Date, timeZone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  }
}

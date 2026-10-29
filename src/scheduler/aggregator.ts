import { GmailAdapter, GmailMessageSummary } from "@/adapters/gmail-adapter";
import { CalendarAdapter, CalendarMeetingSummary } from "@/adapters/calendar-adapter";
import { SlackAdapter, SlackMessageSummary } from "@/adapters/slack-adapter";
import { TrelloAdapter, TrelloCardSummary } from "@/adapters/trello-adapter";

export interface ProviderStatuses {
  calendar: 'available' | 'unavailable';
  trello: 'available' | 'unavailable';
  gmail: 'available' | 'unavailable';
  slack: 'available' | 'unavailable';
}

export interface AggregatedSummaryData {
  calendarMeetings: CalendarMeetingSummary[];
  trelloCards: TrelloCardSummary[];
  gmailMessages: GmailMessageSummary[];
  slackMessages: SlackMessageSummary[];
  gmailTruncated: boolean;
  gmailTruncationNotice?: string;
  providerStatuses: ProviderStatuses;
}

export interface AggregatorOptions {
  timeZone?: string;
  slackChannelId?: string;
  trelloBoardId?: string;
  now?: Date;
  // Injectable overrides for unit tests
  gmailFetcher?: any;
  calendarFetcher?: any;
  slackFetcher?: any;
  trelloFetcher?: any;
  // Direct provider function overrides for testing
  calendar?: () => Promise<CalendarMeetingSummary[]>;
  trello?: () => Promise<TrelloCardSummary[] | { cards: TrelloCardSummary[] }>;
  gmail?: () => Promise<{ messages: GmailMessageSummary[]; isTruncated?: boolean; truncationNotice?: string }>;
  slack?: () => Promise<SlackMessageSummary[]>;
}

export class MultiProviderAggregator {
  /**
   * Queries Gmail, Calendar, Slack, and Trello in parallel.
   * Handles partial failures: failed providers are marked as unavailable while available data renders.
   */
  static async aggregate(options: AggregatorOptions = {}): Promise<AggregatedSummaryData> {
    const timeZone = options.timeZone || process.env.APP_TIMEZONE || 'Asia/Kolkata';
    const now = options.now || new Date();
    const slackChannelId = options.slackChannelId || (process.env.SLACK_AUTHORIZED_CHANNELS || '').split(',')[0]?.trim();
    const trelloBoardId = options.trelloBoardId || process.env.TRELLO_DEFAULT_BOARD_ID;

    const providerStatuses: ProviderStatuses = {
      calendar: 'unavailable',
      trello: 'unavailable',
      gmail: 'unavailable',
      slack: 'unavailable',
    };

    let calendarMeetings: CalendarMeetingSummary[] = [];
    let trelloCards: TrelloCardSummary[] = [];
    let gmailMessages: GmailMessageSummary[] = [];
    let slackMessages: SlackMessageSummary[] = [];
    let gmailTruncated = false;
    let gmailTruncationNotice: string | undefined = undefined;

    // Parallel query execution with Promise.allSettled
    const [calResult, trelloResult, gmailResult, slackResult] = await Promise.allSettled([
      options.calendar
        ? options.calendar()
        : CalendarAdapter.getTodayMeetings({
            timeZone,
            now,
            fetcher: options.calendarFetcher,
          }),
      options.trello
        ? options.trello()
        : trelloBoardId
        ? TrelloAdapter.readBoard({
            boardId: trelloBoardId,
            fetcher: options.trelloFetcher,
          })
        : Promise.reject(new Error("No board ID configured")),
      options.gmail
        ? options.gmail()
        : GmailAdapter.searchAndRead({
            now,
            rollingHours: 24,
            maxResultsCap: 100,
            fetcher: options.gmailFetcher,
          }),
      options.slack
        ? options.slack()
        : slackChannelId
        ? SlackAdapter.readChannelMessages({
            channelId: slackChannelId,
            now,
            lookbackHours: 24,
            fetcher: options.slackFetcher,
          })
        : Promise.reject(new Error("No authorized channel configured")),
    ]);

    // 1. Process Calendar outcome
    if (calResult.status === 'fulfilled') {
      calendarMeetings = calResult.value;
      providerStatuses.calendar = 'available';
    }

    // 2. Process Trello outcome (filter for due today or overdue)
    if (trelloResult.status === 'fulfilled') {
      const val = trelloResult.value;
      if (Array.isArray(val)) {
        trelloCards = val;
      } else if (val && Array.isArray((val as any).cards)) {
        const allCards = (val as any).cards;
        trelloCards = allCards.filter((card: any) => {
          if (card.dueComplete) return false;
          if (!card.due) return false;
          const dueDate = new Date(card.due);
          return dueDate <= now || dueDate.toDateString() === now.toDateString();
        });
      }
      providerStatuses.trello = 'available';
    }

    // 3. Process Gmail outcome
    if (gmailResult.status === 'fulfilled') {
      const val = gmailResult.value;
      if (val && Array.isArray(val.messages)) {
        gmailMessages = val.messages;
        gmailTruncated = Boolean(val.isTruncated);
        gmailTruncationNotice = val.truncationNotice;
      }
      providerStatuses.gmail = 'available';
    }

    // 4. Process Slack outcome
    if (slackResult.status === 'fulfilled') {
      slackMessages = slackResult.value;
      providerStatuses.slack = 'available';
    }

    return {
      calendarMeetings,
      trelloCards,
      gmailMessages,
      slackMessages,
      gmailTruncated,
      gmailTruncationNotice,
      providerStatuses,
    };
  }
}

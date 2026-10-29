import { AttachmentInput, AttachmentParser, AttachmentParseResult } from "./attachment-parser";
import { GoogleAuthHelper } from "./google-auth";

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  internalDate: number; // Milliseconds epoch
  dateFormatted: string;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string;
  attachments: AttachmentParseResult[];
  webLink: string;
}

export interface GmailSearchReadResult {
  messages: GmailMessageSummary[];
  isTruncated: boolean;
  totalMessagesRetrieved: number;
  truncationNotice?: string;
}

export interface GmailQueryOptions {
  query?: string;
  rollingHours?: number; // default 24
  maxResultsCap?: number; // default 100
  now?: Date;
  // Injectable fetcher for testability and offline mocking
  fetcher?: (url: string, headers: Record<string, string>) => Promise<any>;
}

export class GmailAdapter {
  private static readonly DEFAULT_CAP = 100;
  private static readonly DEFAULT_LOOKBACK_HOURS = 24;

  /**
   * Builds an exact epoch timestamp query avoiding coarse date midnight boundaries
   */
  static buildRollingQuery(baseQuery = "", lookbackHours = 24, now = new Date()): { fullQuery: string; lookbackEpochSec: number; lookbackMs: number } {
    const lookbackMs = now.getTime() - lookbackHours * 3600 * 1000;
    const lookbackEpochSec = Math.floor(lookbackMs / 1000);
    const timeFilter = `after:${lookbackEpochSec}`;
    const fullQuery = baseQuery.trim() ? `${baseQuery.trim()} ${timeFilter}` : timeFilter;
    return { fullQuery, lookbackEpochSec, lookbackMs };
  }

  /**
   * Search and read Gmail messages with pagination cap (100) and strict internalDate filtering
   */
  static async searchAndRead(options: GmailQueryOptions = {}): Promise<GmailSearchReadResult> {
    const now = options.now || new Date();
    const lookbackHours = options.rollingHours || this.DEFAULT_LOOKBACK_HOURS;
    const maxCap = options.maxResultsCap || this.DEFAULT_CAP;
    const { fullQuery, lookbackMs } = this.buildRollingQuery(options.query || "", lookbackHours, now);

    const accessToken = await GoogleAuthHelper.getAccessToken();
    const fetcher = options.fetcher || this.defaultFetcher;

    if (!accessToken && !options.fetcher) {
      // In development/test mode without credentials, return empty clean result
      return {
        messages: [],
        isTruncated: false,
        totalMessagesRetrieved: 0,
      };
    }

    let nextPageToken: string | undefined = undefined;
    const rawMessages: any[] = [];
    let hasMoreAfterCap = false;

    // Paginate until maxCap or no more pages
    do {
      const pageSize = Math.min(50, maxCap - rawMessages.length);
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
        fullQuery
      )}&maxResults=${pageSize}${nextPageToken ? `&pageToken=${nextPageToken}` : ""}`;

      const listResponse = await fetcher(url, {
        Authorization: `Bearer ${accessToken}`,
      });

      if (!listResponse || !listResponse.messages) {
        break;
      }

      rawMessages.push(...listResponse.messages);
      nextPageToken = listResponse.nextPageToken;

      if (rawMessages.length >= maxCap) {
        if (nextPageToken) {
          hasMoreAfterCap = true;
        }
        break;
      }
    } while (nextPageToken);

    // Detail fetch & strict client-side timestamp filter
    const validMessages: GmailMessageSummary[] = [];

    for (const msgRef of rawMessages) {
      if (typeof msgRef.internalDate === "number") {
        // If message details already provided (e.g. from mock)
        if (msgRef.internalDate >= lookbackMs) {
          validMessages.push(this.normalizeMessage(msgRef));
        }
      } else {
        const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgRef.id}?format=full`;
        const detail = await fetcher(detailUrl, {
          Authorization: `Bearer ${accessToken}`,
        });

        if (detail) {
          const internalDate = parseInt(detail.internalDate, 10);
          // Strict client-side check against rolling window
          if (!isNaN(internalDate) && internalDate >= lookbackMs) {
            validMessages.push(this.normalizeMessage(detail));
          }
        }
      }
    }

    const isTruncated = hasMoreAfterCap || rawMessages.length >= maxCap;

    return {
      messages: validMessages,
      isTruncated,
      totalMessagesRetrieved: validMessages.length,
      truncationNotice: isTruncated
        ? `⚠️ Inbox volume exceeded ${maxCap} recent emails; results represent the ${maxCap} most recent items within the lookback window.`
        : undefined,
    };
  }

  /**
   * Normalizes raw Gmail payload to standardized message summary
   */
  static normalizeMessage(raw: any): GmailMessageSummary {
    const headers = raw.payload?.headers || raw.headers || [];
    const getHeader = (name: string): string => {
      const h = headers.find((x: any) => x.name.toLowerCase() === name.toLowerCase());
      return h ? h.value : "";
    };

    const internalDate = typeof raw.internalDate === "number" ? raw.internalDate : parseInt(raw.internalDate, 10) || Date.now();
    const attachments: AttachmentParseResult[] = [];

    if (raw.attachments && Array.isArray(raw.attachments)) {
      for (const att of raw.attachments) {
        attachments.push(AttachmentParser.parseAttachment(att));
      }
    }

    return {
      id: raw.id,
      threadId: raw.threadId || raw.id,
      internalDate,
      dateFormatted: new Date(internalDate).toISOString(),
      from: getHeader("From") || raw.from || "Unknown",
      subject: getHeader("Subject") || raw.subject || "(No Subject)",
      snippet: raw.snippet || "",
      bodyText: raw.bodyText || raw.snippet || "",
      attachments,
      webLink: `https://mail.google.com/mail/u/0/#inbox/${raw.id}`,
    };
  }

  private static async defaultFetcher(url: string, headers: Record<string, string>): Promise<any> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Gmail API request failed with HTTP ${res.status}`);
    }
    return res.json();
  }
}

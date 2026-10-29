import { GmailAdapter, GmailMessageSummary } from "@/adapters/gmail-adapter";
import { SlackSearchClues } from "./slack-parser";

export type GmailMatchStatus = 'zero' | 'exact' | 'multiple';

export interface GmailMatchResult {
  status: GmailMatchStatus;
  query: string;
  matchedMessages: GmailMessageSummary[];
  selectedMessage?: GmailMessageSummary;
  clarificationPrompt?: string;
  candidateOptions?: Array<{ id: string; label: string; callbackToken: string }>;
}

export class GmailMatcher {
  /**
   * Matches candidate Gmail emails using Slack search clues
   * Handles 0 matches (notify), 1 match (auto-proceed), >1 matches (interactive picker)
   */
  static async matchFromSlackClues(
    clues: SlackSearchClues,
    options: {
      now?: Date;
      sessionId?: string; // used for compact token generation
      gmailFetcher?: any;
    } = {}
  ): Promise<GmailMatchResult> {
    const queryParts: string[] = [];

    // Prioritize mentioned emails
    if (clues.mentionedEmails.length > 0) {
      queryParts.push(clues.mentionedEmails.map((e) => `from:${e}`).join(' OR '));
    }

    // Add referenced files
    if (clues.referencedFiles.length > 0) {
      queryParts.push(clues.referencedFiles.map((f) => `filename:${f}`).join(' OR '));
    }

    // Add significant keywords
    if (clues.keywords.length > 0) {
      queryParts.push(clues.keywords.slice(0, 3).join(' '));
    }

    const searchQuery = queryParts.join(' ').trim() || 'is:unread';

    const searchResult = await GmailAdapter.searchAndRead({
      query: searchQuery,
      now: options.now,
      fetcher: options.gmailFetcher,
    });

    const messages = searchResult.messages;
    const sessionId = options.sessionId || 's1';

    // 1. Zero matches (T-007)
    if (messages.length === 0) {
      return {
        status: 'zero',
        query: searchQuery,
        matchedMessages: [],
        clarificationPrompt: `🔍 *No matching emails found* for search terms: \`${searchQuery}\`.\nPlease clarify the sender or subject.`,
      };
    }

    // 2. Exact match (1 email) (T-005)
    if (messages.length === 1) {
      return {
        status: 'exact',
        query: searchQuery,
        matchedMessages: messages,
        selectedMessage: messages[0],
      };
    }

    // 3. Multiple matches (>1 emails) (T-006)
    // Telegram callback_data must be strictly <= 64 bytes.
    // Format: e:<sessionId>:<index> (e.g. e:s1:0 -> ~6-8 bytes)
    const candidateOptions = messages.slice(0, 5).map((msg, idx) => ({
      id: msg.id,
      label: `Email ${idx + 1}: "${msg.subject.substring(0, 30)}" from ${msg.from.substring(0, 20)}`,
      callbackToken: `e:${sessionId}:${idx}`,
    }));

    return {
      status: 'multiple',
      query: searchQuery,
      matchedMessages: messages,
      candidateOptions,
      clarificationPrompt: `📬 *Multiple matching emails found* (${messages.length}). Please select the correct email to proceed:`,
    };
  }
}

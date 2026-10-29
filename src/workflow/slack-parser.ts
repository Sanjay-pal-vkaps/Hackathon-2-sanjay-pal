export interface SlackSearchClues {
  channelId: string;
  sender: string;
  text: string;
  keywords: string[];
  mentionedEmails: string[];
  referencedFiles: string[];
  timestamp: string;
}

export class SlackEventParser {
  /**
   * Extracts search clues, keywords, and candidate references from Slack messages
   */
  static parseEvent(event: {
    channel: string;
    user?: string;
    text?: string;
    ts: string;
    files?: Array<{ name: string }>;
  }): SlackSearchClues {
    const text = event.text || "";
    const channelId = event.channel;
    const sender = event.user || "unknown";

    // 1. Extract email addresses mentioned in message
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const mentionedEmails = text.match(emailRegex) || [];

    // 2. Extract referenced files/attachments in text or files payload
    const referencedFiles: string[] = [];
    if (event.files && Array.isArray(event.files)) {
      referencedFiles.push(...event.files.map((f) => f.name));
    }
    const fileExtensionRegex = /\b[\w-]+\.(pdf|csv|txt|md|docx|xlsx)\b/gi;
    const inlineFileMatches = text.match(fileExtensionRegex) || [];
    referencedFiles.push(...inlineFileMatches);

    // 3. Extract keywords (filtering out stop words and slack markup)
    const cleanText = text
      .replace(/<[^>]+>/g, " ") // remove slack links/mentions <@U123>
      .replace(/[^\w\s-]/g, " ")
      .trim();

    const stopWords = new Set([
      "the", "is", "at", "which", "on", "and", "a", "an", "in", "to", "for", "of",
      "please", "check", "email", "sent", "see", "attached", "we", "can", "you"
    ]);

    const words = cleanText.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !stopWords.has(w));
    const keywords = Array.from(new Set(words));

    return {
      channelId,
      sender,
      text,
      keywords,
      mentionedEmails: Array.from(new Set(mentionedEmails)),
      referencedFiles: Array.from(new Set(referencedFiles)),
      timestamp: event.ts,
    };
  }
}

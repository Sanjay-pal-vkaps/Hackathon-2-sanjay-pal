import { AggregatedSummaryData } from "./aggregator";

export class TelegramMessageFormatter {
  private static readonly MAX_TELEGRAM_MESSAGE_LENGTH = 4096;

  /**
   * Formats aggregated summary into structured markdown with source links and partial failure notices
   */
  static formatSummary(data: AggregatedSummaryData, dateFormatted: string, timeZone: string): string {
    const lines: string[] = [];

    lines.push(`📅 *Daily Morning Summary — ${dateFormatted} (${timeZone})*`);
    lines.push(`───────────────────────────────`);

    // 1. Calendar Section
    lines.push(`\n🗓️ *Today's Meetings:*`);
    if (data.providerStatuses.calendar === 'unavailable') {
      lines.push(`_Google Calendar: [Unavailable]_`);
    } else if (data.calendarMeetings.length === 0) {
      lines.push(`_No confirmed meetings scheduled for today._`);
    } else {
      data.calendarMeetings.forEach((m) => {
        const link = m.htmlLink ? ` ([View](${m.htmlLink}))` : '';
        lines.push(`• *${m.summary}* (${m.startTime.split('T')[1]?.substring(0, 5) || 'All Day'})${link}`);
      });
    }

    // 2. Trello Section
    lines.push(`\n📋 *Trello Tasks (Due Today / Overdue):*`);
    if (data.providerStatuses.trello === 'unavailable') {
      lines.push(`_Trello: [Unavailable]_`);
    } else if (data.trelloCards.length === 0) {
      lines.push(`_No pending cards due today._`);
    } else {
      data.trelloCards.forEach((c) => {
        const link = c.url ? ` ([Card](${c.url}))` : '';
        lines.push(`• *${c.name}*${link}`);
      });
    }

    // 3. Gmail Section
    lines.push(`\n📧 *Important Recent Emails (Last 24h):*`);
    if (data.providerStatuses.gmail === 'unavailable') {
      lines.push(`_Gmail: [Unavailable]_`);
    } else if (data.gmailMessages.length === 0) {
      lines.push(`_No unread/important emails found in lookback window._`);
    } else {
      if (data.gmailTruncationNotice) {
        lines.push(`_${data.gmailTruncationNotice}_`);
      }
      data.gmailMessages.slice(0, 5).forEach((g) => {
        lines.push(`• *${g.subject}* from ${g.from} ([Email](${g.webLink}))`);
      });
      if (data.gmailMessages.length > 5) {
        lines.push(`_...and ${data.gmailMessages.length - 5} more emails._`);
      }
    }

    // 4. Slack Section
    lines.push(`\n💬 *Slack Mentions & Highlights:*`);
    if (data.providerStatuses.slack === 'unavailable') {
      lines.push(`_Slack: [Unavailable]_`);
    } else if (data.slackMessages.length === 0) {
      lines.push(`_No recent urgent messages found._`);
    } else {
      data.slackMessages.slice(0, 5).forEach((s) => {
        const link = s.permalink ? ` ([Slack](${s.permalink}))` : '';
        lines.push(`• *<@${s.user}>*: "${s.text.substring(0, 80)}"${link}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Splits message safely into sequential chunks of <= 4096 characters without breaking lines or Markdown syntax
   */
  static chunkMessage(text: string, maxLength: number = this.MAX_TELEGRAM_MESSAGE_LENGTH): string[] {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if ((currentChunk + '\n' + line).length > maxLength) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        // If a single line itself is abnormally long (> maxLength), hard-slice it
        if (line.length > maxLength) {
          for (let i = 0; i < line.length; i += maxLength) {
            chunks.push(line.substring(i, i + maxLength));
          }
        } else {
          currentChunk = line;
        }
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}

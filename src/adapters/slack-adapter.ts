export interface SlackMessageSummary {
  channelId: string;
  ts: string;
  user: string;
  text: string;
  timestampMs: number;
  permalink?: string;
}

export interface SlackReadOptions {
  channelId: string;
  lookbackHours?: number; // default 24
  now?: Date;
  fetcher?: (url: string, headers: Record<string, string>) => Promise<any>;
}

export class SlackAdapter {
  private static readonly DEFAULT_LOOKBACK_HOURS = 24;

  /**
   * Retrieves channel messages from authorized channels within rolling lookback window
   */
  static async readChannelMessages(options: SlackReadOptions): Promise<SlackMessageSummary[]> {
    const { channelId, lookbackHours = this.DEFAULT_LOOKBACK_HOURS, now = new Date() } = options;

    // Verify authorized channel list
    const authorizedChannels = (process.env.SLACK_AUTHORIZED_CHANNELS || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);

    if (authorizedChannels.length > 0 && !authorizedChannels.includes(channelId)) {
      throw new Error(`Channel '${channelId}' is not in SLACK_AUTHORIZED_CHANNELS allowlist`);
    }

    const oldestEpochSec = Math.floor((now.getTime() - lookbackHours * 3600 * 1000) / 1000);
    const token = process.env.SLACK_BOT_TOKEN;
    const fetcher = options.fetcher || this.defaultFetcher;

    if (!token && !options.fetcher) {
      return [];
    }

    const url = `https://slack.com/api/conversations.history?channel=${encodeURIComponent(
      channelId
    )}&oldest=${oldestEpochSec}&limit=100`;

    const data = await fetcher(url, {
      Authorization: `Bearer ${token}`,
    });

    if (!data || !data.ok || !Array.isArray(data.messages)) {
      return [];
    }

    return data.messages.map((msg: any) => ({
      channelId,
      ts: msg.ts,
      user: msg.user || 'Unknown',
      text: msg.text || '',
      timestampMs: parseFloat(msg.ts) * 1000,
      permalink: `https://slack.com/archives/${channelId}/p${msg.ts.replace('.', '')}`,
    }));
  }

  private static async defaultFetcher(url: string, headers: Record<string, string>): Promise<any> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Slack API request failed with HTTP ${res.status}`);
    }
    return res.json();
  }
}

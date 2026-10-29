import { GoogleAuthHelper } from "./google-auth";

export interface CalendarMeetingSummary {
  id: string;
  summary: string;
  description?: string;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  status: string;    // 'confirmed' | 'tentative' | 'cancelled'
  attendeesCount: number;
  hangoutLink?: string;
  htmlLink?: string;
}

export interface CalendarGetTodayOptions {
  timeZone?: string; // e.g. 'Asia/Kolkata'
  now?: Date;
  fetcher?: (url: string, headers: Record<string, string>) => Promise<any>;
}

export class CalendarAdapter {
  private static readonly DEFAULT_TIMEZONE = 'Asia/Kolkata';

  /**
   * Retrieves today's confirmed calendar meetings localized to specified timezone
   */
  static async getTodayMeetings(options: CalendarGetTodayOptions = {}): Promise<CalendarMeetingSummary[]> {
    const timeZone = options.timeZone || process.env.APP_TIMEZONE || this.DEFAULT_TIMEZONE;
    const now = options.now || new Date();

    // Determine start and end of day in target timezone
    const { timeMin, timeMax } = this.getDayBounds(now, timeZone);

    const accessToken = await GoogleAuthHelper.getAccessToken();
    const fetcher = options.fetcher || this.defaultFetcher;

    if (!accessToken && !options.fetcher) {
      return [];
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`;

    const data = await fetcher(url, {
      Authorization: `Bearer ${accessToken}`,
    });

    if (!data || !Array.isArray(data.items)) {
      return [];
    }

    // Only return confirmed meetings for today
    return data.items
      .filter((item: any) => item.status === 'confirmed')
      .map((item: any) => this.normalizeEvent(item));
  }

  static getDayBounds(now: Date, timeZone: string): { timeMin: string; timeMax: string } {
    // Format local date YYYY-MM-DD in the target timezone
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const localDateStr = formatter.format(now); // e.g. "2026-10-29"

    // Set timeMin to start of local day (00:00:00.000) and timeMax to end of day (23:59:59.999)
    // Approximate with ISO string boundaries
    const timeMin = new Date(`${localDateStr}T00:00:00Z`).toISOString();
    const timeMax = new Date(`${localDateStr}T23:59:59Z`).toISOString();

    return { timeMin, timeMax };
  }

  static normalizeEvent(item: any): CalendarMeetingSummary {
    return {
      id: item.id,
      summary: item.summary || '(Untitled Meeting)',
      description: item.description,
      startTime: item.start?.dateTime || item.start?.date || '',
      endTime: item.end?.dateTime || item.end?.date || '',
      status: item.status || 'confirmed',
      attendeesCount: Array.isArray(item.attendees) ? item.attendees.length : 0,
      hangoutLink: item.hangoutLink,
      htmlLink: item.htmlLink,
    };
  }

  private static async defaultFetcher(url: string, headers: Record<string, string>): Promise<any> {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`Google Calendar API request failed with HTTP ${res.status}`);
    }
    return res.json();
  }
}

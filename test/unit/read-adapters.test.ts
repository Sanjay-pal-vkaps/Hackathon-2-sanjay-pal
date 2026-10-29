import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CalendarAdapter } from "@/adapters/calendar-adapter";
import { SlackAdapter } from "@/adapters/slack-adapter";
import { TrelloAdapter } from "@/adapters/trello-adapter";

describe("Milestone 2: Read Adapters & Enforcement", () => {
  describe("CalendarAdapter", () => {
    it("retrieves confirmed meetings and calculates timezone day bounds", async () => {
      const fixedNow = new Date("2026-10-29T10:00:00.000Z");
      const { timeMin, timeMax } = CalendarAdapter.getDayBounds(fixedNow, "Asia/Kolkata");

      expect(timeMin).toContain("2026-10-29");
      expect(timeMax).toContain("2026-10-29");

      const mockMeetings = [
        {
          id: "evt-1",
          summary: "Team Standup",
          status: "confirmed",
          start: { dateTime: "2026-10-29T09:30:00+05:30" },
          end: { dateTime: "2026-10-29T10:00:00+05:30" },
          attendees: [{ email: "a@test.com" }, { email: "b@test.com" }],
        },
        {
          id: "evt-2",
          summary: "Cancelled Planning",
          status: "cancelled",
        },
      ];

      const mockFetcher = async () => ({ items: mockMeetings });
      const events = await CalendarAdapter.getTodayMeetings({
        timeZone: "Asia/Kolkata",
        now: fixedNow,
        fetcher: mockFetcher,
      });

      expect(events.length).toBe(1);
      expect(events[0].summary).toBe("Team Standup");
      expect(events[0].attendeesCount).toBe(2);
    });

    it("verifies CalendarAdapter has no write methods", () => {
      const methods = Object.getOwnPropertyNames(CalendarAdapter);
      expect(methods).not.toContain("createEvent");
      expect(methods).not.toContain("updateEvent");
      expect(methods).not.toContain("deleteEvent");
    });
  });

  describe("SlackAdapter", () => {
    const originalEnv = process.env.SLACK_AUTHORIZED_CHANNELS;

    beforeEach(() => {
      process.env.SLACK_AUTHORIZED_CHANNELS = "C12345,C67890";
    });

    afterEach(() => {
      process.env.SLACK_AUTHORIZED_CHANNELS = originalEnv;
    });

    it("reads messages from authorized channel within rolling lookback", async () => {
      const fixedNow = new Date("2026-10-29T10:00:00.000Z");
      const mockMessages = [
        {
          ts: "1793264400.000100",
          user: "U12345",
          text: "Can someone check the client email?",
        },
      ];

      const mockFetcher = async () => ({ ok: true, messages: mockMessages });
      const messages = await SlackAdapter.readChannelMessages({
        channelId: "C12345",
        now: fixedNow,
        fetcher: mockFetcher,
      });

      expect(messages.length).toBe(1);
      expect(messages[0].text).toContain("check the client email");
      expect(messages[0].channelId).toBe("C12345");
    });

    it("T-029: rejects reading from unauthorized channel", async () => {
      await expect(
        SlackAdapter.readChannelMessages({
          channelId: "C99999_UNAUTHORIZED",
          fetcher: async () => ({ ok: true, messages: [] }),
        })
      ).rejects.toThrow("not in SLACK_AUTHORIZED_CHANNELS allowlist");
    });

    it("verifies SlackAdapter has no write methods", () => {
      const methods = Object.getOwnPropertyNames(SlackAdapter);
      expect(methods).not.toContain("postMessage");
      expect(methods).not.toContain("updateMessage");
      expect(methods).not.toContain("deleteMessage");
    });
  });

  describe("TrelloAdapter", () => {
    it("reads lists, active members, and cards from configured board", async () => {
      const mockFetcher = async (url: string) => {
        if (url.includes("/lists")) {
          return [{ id: "l-1", name: "To Do", closed: false }];
        }
        if (url.includes("/members")) {
          return [{ id: "m-1", fullName: "Alice Engineer", username: "alice" }];
        }
        if (url.includes("/cards")) {
          return [
            {
              id: "c-1",
              name: "Prepare release",
              desc: "Ensure all tests pass",
              idList: "l-1",
              idMembers: ["m-1"],
              due: "2026-10-29T18:00:00.000Z",
              dueComplete: false,
              url: "https://trello.com/c/release",
            },
          ];
        }
        return [];
      };

      const boardData = await TrelloAdapter.readBoard({
        boardId: "board-123",
        fetcher: mockFetcher,
      });

      expect(boardData.boardId).toBe("board-123");
      expect(boardData.lists.length).toBe(1);
      expect(boardData.members.length).toBe(1);
      expect(boardData.members[0].fullName).toBe("Alice Engineer");
      expect(boardData.cards.length).toBe(1);
      expect(boardData.cards[0].name).toBe("Prepare release");
    });

    it("T-024 to T-026 enforcement: verifies TrelloAdapter contains zero write methods", () => {
      const methods = Object.getOwnPropertyNames(TrelloAdapter);
      expect(methods).not.toContain("createCard");
      expect(methods).not.toContain("updateCard");
      expect(methods).not.toContain("deleteCard");
      expect(methods).not.toContain("assignMember");
    });
  });
});

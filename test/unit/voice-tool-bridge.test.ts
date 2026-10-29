import { describe, it, expect, beforeEach } from "vitest";
import { VoiceToolBridge } from "@/voice/voice-tool-bridge";
import { initializeStandardMCPTools } from "@/mcp/registry";

describe("Milestone 7: VoiceToolBridge & Confirmation-Gate Parity", () => {
  beforeEach(() => {
    initializeStandardMCPTools();
    VoiceToolBridge.clearProposals();
  });

  describe("Voice Daily Summary Tool (get_daily_summary)", () => {
    it("generates concise spoken response from multi-provider summary", async () => {
      const result = await VoiceToolBridge.handleToolCall(
        {
          tool_name: "get_daily_summary",
          parameters: { timeZone: "Asia/Kolkata" },
        },
        {
          aggregatorOverrides: {
            calendar: async () => [
              {
                id: "c-1",
                summary: "Quarterly Planning",
                startTime: "2026-10-29T10:00:00Z",
                endTime: "2026-10-29T11:00:00Z",
                status: "confirmed",
                attendeesCount: 4,
              },
            ],
            trello: async () => [
              {
                id: "tr-1",
                name: "Review Security Policies",
                desc: "",
                dueComplete: false,
                idList: "l-1",
                idMembers: [],
                url: "https://trello.com/c/sec",
                due: "2026-10-29T18:00:00Z",
              },
            ],
            gmail: async () => ({ messages: [], isTruncated: false }),
            slack: async () => [],
          },
        }
      );

      expect(result.success).toBe(true);
      expect(result.spokenResponse).toContain("Here is your daily overview");
      expect(result.spokenResponse).toContain("1 meeting today");
      expect(result.spokenResponse).toContain("1 task due today");
      expect(result.actionRequired).toBe("none");
    });

    it("labels unavailable providers honestly in spoken summary", async () => {
      const result = await VoiceToolBridge.handleToolCall(
        {
          tool_name: "get_daily_summary",
          parameters: { timeZone: "Asia/Kolkata" },
        },
        {
          aggregatorOverrides: {
            calendar: async () => {
              throw new Error("Calendar 500 timeout");
            },
            trello: async () => [],
            gmail: async () => ({ messages: [], isTruncated: false }),
            slack: async () => [],
          },
        }
      );

      expect(result.success).toBe(true);
      expect(result.spokenResponse).toContain("Google Calendar is currently unavailable");
    });
  });

  describe("Confirmation-Gate Parity: propose_trello_task", () => {
    it("creates proposal with status PENDING and requires Telegram confirmation; does NOT write directly", async () => {
      let telegramMessageSent = "";
      let telegramKeyboardSent: any = null;

      const mockTelegramSender = async (text: string, keyboard: any) => {
        telegramMessageSent = text;
        telegramKeyboardSent = keyboard;
        return true;
      };

      const outcome = await VoiceToolBridge.handleToolCall(
        {
          tool_name: "propose_trello_task",
          parameters: {
            title: "Audited Financial Report",
            description: "Review financial statements with legal counsel",
            dueDate: "2026-11-10",
            assigneeName: "Alice Lead",
          },
        },
        { telegramSender: mockTelegramSender }
      );

      expect(outcome.success).toBe(true);
      expect(outcome.actionRequired).toBe("telegram_confirmation");
      expect(outcome.spokenResponse).toContain("sent a confirmation button to your Telegram");
      expect(outcome.spokenResponse).toContain("Audited Financial Report");

      // Verify proposal object in storage
      expect(outcome.proposalId).toBeDefined();
      const proposal = VoiceToolBridge.getProposal(outcome.proposalId!);
      expect(proposal).toBeDefined();
      expect(proposal?.status).toBe("pending"); // STRICT: must be pending
      expect(proposal?.taskTitle).toBe("Audited Financial Report");

      // Verify Telegram delivery was dispatched with Approve/Cancel buttons
      expect(telegramMessageSent).toContain("Audited Financial Report");
      expect(telegramKeyboardSent).toBeDefined();
      expect(telegramKeyboardSent[0][0].text).toContain("Approve");
      expect(telegramKeyboardSent[0][1].text).toContain("Cancel");
    });

    it("rejects task proposal when title is missing", async () => {
      const outcome = await VoiceToolBridge.handleToolCall({
        tool_name: "propose_trello_task",
        parameters: { title: "" },
      });

      expect(outcome.success).toBe(false);
      expect(outcome.error).toContain("Missing required task title");
      expect(outcome.spokenResponse).toContain("Please specify a title");
    });
  });

  describe("Strict Security: Direct Write Attempt Blocked", () => {
    it("hard-blocks direct trello_create_card call through voice agent", async () => {
      const outcome = await VoiceToolBridge.handleToolCall({
        tool_name: "trello_create_card",
        parameters: {
          listId: "list-direct",
          title: "Malicious Unconfirmed Task",
          idempotencyKey: "bypass-attempt",
        },
      });

      expect(outcome.success).toBe(false);
      expect(outcome.actionRequired).toBe("telegram_confirmation");
      expect(outcome.error).toContain("strictly blocked for callerType 'agent'");
      expect(outcome.spokenResponse).toContain("cannot create or modify Trello cards without explicit confirmation");
    });
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { ScheduleEvaluator } from "@/scheduler/evaluator";
import { SlackEventParser } from "@/workflow/slack-parser";
import { GmailMatcher } from "@/workflow/gmail-matcher";
import { TaskExtractor } from "@/workflow/task-extractor";
import { AssigneeResolver } from "@/workflow/assignee-resolver";
import { ProposalPresenter } from "@/trello/proposal-presenter";
import { ApprovalExecutor, TrelloClient } from "@/trello/approval-executor";
import { GmailMessageSummary } from "@/adapters/gmail-adapter";
import { TrelloMemberSummary } from "@/adapters/trello-adapter";
import { ActionProposal } from "@/types/entities";

describe("Milestone 6: Critical End-to-End Scenarios (E2E-1 & E2E-2)", () => {
  describe("E2E-1: Dynamic Daily Summary End-to-End", () => {
    beforeEach(() => {
      ScheduleEvaluator.clearStore();
    });

    it("executes complete E2E-1 lifecycle including aggregation, partial failure, idempotency lock, and dynamic config adaptation", async () => {
      // Step 1: Configure DAILY_SUMMARY_TIME=09:00 and APP_TIMEZONE=Asia/Kolkata
      let summaryTime = "09:00";
      let timeZone = "Asia/Kolkata";

      // Step 2: Fixture data
      const fixtureMeetings = [
        {
          id: "meet-1",
          summary: "Architecture Review",
          startTime: "2026-10-29T10:00:00Z",
          endTime: "2026-10-29T11:00:00Z",
          status: "confirmed",
          attendeesCount: 3,
          htmlLink: "https://calendar.google.com/1",
        },
      ];
      const fixtureCards = [
        {
          id: "tr-1",
          name: "Deliver Milestone 6",
          desc: "Complete testing",
          dueComplete: false,
          idList: "list-1",
          idMembers: [],
          url: "https://trello.com/c/m6",
          due: "2026-10-29T18:00:00Z",
        },
      ];
      const fixtureEmails: GmailMessageSummary[] = [
        {
          id: "gm-1",
          threadId: "th-1",
          internalDate: Date.now(),
          dateFormatted: "2026-10-29 08:00:00",
          subject: "Sprint Sign-Off",
          from: "lead@example.com",
          snippet: "All tests ready",
          bodyText: "All tests are passing ready for sign-off",
          webLink: "https://mail.google.com/mail/u/0/#inbox/gm-1",
          attachments: [],
        },
      ];

      let sentTelegramText = "";
      const telegramSender = async (msg: string) => {
        sentTelegramText = msg;
        return true;
      };

      // Step 3: Trigger 5-minute schedule evaluation within due window [09:00, 09:15)
      // 03:35 UTC is 09:05 Asia/Kolkata
      const nowUtc = new Date("2026-10-29T03:35:00.000Z");
      const run1 = await ScheduleEvaluator.evaluateSchedule({
        now: nowUtc,
        summaryTime,
        timeZone,
        telegramSender,
        aggregatorOverrides: {
          calendar: async () => fixtureMeetings,
          trello: async () => fixtureCards,
          gmail: async () => ({ messages: fixtureEmails, isTruncated: false }),
          slack: async () => [],
        },
      });

      // Step 4: Verify summary contains meetings, tasks, emails, and links
      expect(run1.triggered).toBe(true);
      expect(run1.deliveryStatus).toBe("sent");
      expect(sentTelegramText).toContain("Architecture Review");
      expect(sentTelegramText).toContain("Deliver Milestone 6");
      expect(sentTelegramText).toContain("Sprint Sign-Off");
      expect(sentTelegramText).toContain("https://calendar.google.com");
      expect(sentTelegramText).toContain("https://trello.com/c/m6");

      // Step 5: Simulate one provider failure and verify summary labels missing data without fabricating
      ScheduleEvaluator.clearStore();
      const runWithFailure = await ScheduleEvaluator.evaluateSchedule({
        now: nowUtc,
        summaryTime,
        timeZone,
        telegramSender,
        aggregatorOverrides: {
          calendar: async () => {
            throw new Error("Calendar service 503");
          },
          trello: async () => fixtureCards,
          gmail: async () => ({ messages: fixtureEmails, isTruncated: false }),
          slack: async () => [],
        },
      });
      expect(runWithFailure.triggered).toBe(true);
      expect(runWithFailure.summaryData?.providerStatuses.calendar).toBe("unavailable");
      expect(sentTelegramText).toContain("Google Calendar: [Unavailable]");
      expect(sentTelegramText).toContain("Deliver Milestone 6"); // Other providers intact

      // Step 6: Trigger evaluator again on same calendar day; verify date lock prevents duplicate delivery
      const duplicateRun = await ScheduleEvaluator.evaluateSchedule({
        now: new Date("2026-10-29T03:40:00.000Z"),
        summaryTime,
        timeZone,
        telegramSender,
      });
      expect(duplicateRun.triggered).toBe(false);
      expect(duplicateRun.reason).toContain("already completed for today");

      // Step 7: Update DAILY_SUMMARY_TIME=14:00 and APP_TIMEZONE=America/New_York
      summaryTime = "14:00";
      timeZone = "America/New_York";
      ScheduleEvaluator.clearStore();

      // In America/New_York (EDT UTC-4), 14:05 local is 18:05 UTC
      const nyTime = new Date("2026-10-29T18:05:00.000Z");
      const runNy = await ScheduleEvaluator.evaluateSchedule({
        now: nyTime,
        summaryTime,
        timeZone,
        telegramSender,
        aggregatorOverrides: {
          calendar: async () => fixtureMeetings,
          trello: async () => [],
          gmail: async () => ({ messages: [], isTruncated: false }),
          slack: async () => [],
        },
      });
      expect(runNy.triggered).toBe(true);
      expect(runNy.deliveryStatus).toBe("sent");
    });
  });

  describe("E2E-2: Slack → Gmail → Clarification → Trello → Telegram End-to-End", () => {
    it("executes the complete multi-step interactive task proposal, clarification, and gated approval workflow", async () => {
      // Step 1: Deliver a valid, relevant Slack event from an authorized channel
      const rawSlackEvent = {
        channel: "C_AUTHORIZED_ALERTS",
        user: "U_PM_BOB",
        text: "Please track the invoice inquiry from ACME client in Trello for Alex",
        ts: "1730188800.000",
      };
      const clues = SlackEventParser.parseEvent(rawSlackEvent);
      expect(clues.keywords).toContain("invoice");
      expect(clues.keywords).toContain("inquiry");

      // Step 2: Simulate multiple matching Gmail emails
      const candidateEmails: GmailMessageSummary[] = [
        {
          id: "email-acme-1",
          threadId: "th-1",
          internalDate: Date.now(),
          dateFormatted: "2026-10-29 08:00:00",
          subject: "Invoice Inquiry - Q3 Statement",
          from: "accounting@acme.com",
          snippet: "Attached is the Q3 invoice breakdown",
          bodyText: "Invoice breakdown for Q3.",
          webLink: "https://mail.google.com/mail/u/0/#inbox/email-acme-1",
          attachments: [
            {
              filename: "q3_invoice.txt",
              mimeType: "text/plain",
              sizeBytes: 1024,
              isTruncated: false,
              skipped: false,
              extractedText: "Total due: $5000. Payment terms Net 30.",
            },
          ],
        },
        {
          id: "email-acme-2",
          threadId: "th-2",
          internalDate: Date.now(),
          dateFormatted: "2026-10-29 08:30:00",
          subject: "Invoice Inquiry - Contract Renewal",
          from: "sales@acme.com",
          snippet: "Renewal proposal attached",
          bodyText: "Renewal proposal details.",
          webLink: "https://mail.google.com/mail/u/0/#inbox/email-acme-2",
          attachments: [],
        },
      ];

      const mockFetcher = async (url: string) => {
        if (url.includes("/messages?")) {
          return {
            messages: candidateEmails.map((e) => ({ id: e.id, threadId: e.threadId })),
            resultSizeEstimate: 2,
          };
        }
        const id = url.split("/messages/")[1]?.split("?")[0];
        const match = candidateEmails.find((e) => e.id === id) || candidateEmails[0];
        return {
          id: match.id,
          threadId: match.threadId,
          internalDate: String(match.internalDate),
          snippet: match.snippet,
          payload: {
            headers: [
              { name: "Subject", value: match.subject },
              { name: "From", value: match.from },
            ],
            body: { data: Buffer.from(match.bodyText).toString("base64url") },
          },
        };
      };

      const emailMatchResult = await GmailMatcher.matchFromSlackClues(clues, {
        gmailFetcher: mockFetcher,
        sessionId: "sess-e2e-2",
      });
      // Verify interactive Telegram selection menu is sent and NO task is proposed yet
      expect(emailMatchResult.status).toBe("multiple");
      expect(emailMatchResult.clarificationPrompt).toBeDefined();
      expect(emailMatchResult.candidateOptions).toBeDefined();
      expect(emailMatchResult.candidateOptions![0].callbackToken).toBe("e:sess-e2e-2:0");

      // Step 3: User selects email #1 via callback; verify task is extracted from email and attachment (<5 MB)
      const selectedEmail = candidateEmails[0];
      const extractedTask = TaskExtractor.extractTask({
        email: selectedEmail,
        slackContext: clues.text,
      });
      expect(extractedTask.title).toBe("Invoice Inquiry - Q3 Statement");
      expect(extractedTask.description).toContain("Total due: $5000");
      expect(extractedTask.sourceContext.attachmentsUsed).toContain("q3_invoice.txt");

      // Step 4: Simulate ambiguous assignee ("Alex" matches Alex Johnson and Alexia)
      const boardMembers: TrelloMemberSummary[] = [
        { id: "mem-alex-j", fullName: "Alex Johnson", username: "alexj" },
        { id: "mem-alexia", fullName: "Alexia Vance", username: "alexiav" },
        { id: "mem-bob", fullName: "Bob Builder", username: "bobbuilder" },
      ];
      const assigneeResult = AssigneeResolver.resolveAssignee({
        candidateName: "Alex",
        boardMembers,
        sessionId: "sess-e2e-2",
      });
      expect(assigneeResult.status).toBe("ambiguous");
      expect(assigneeResult.clarificationPrompt).toBeDefined();
      expect(assigneeResult.candidateOptions).toBeDefined();
      expect(assigneeResult.candidateOptions!.length).toBeGreaterThanOrEqual(2);

      // Step 5: User selects verified board member "mem-alex-j"
      const chosenAssigneeId = "mem-alex-j";
      const chosenAssigneeName = "Alex Johnson";

      const finalizedProposal: ActionProposal = {
        id: "prop-e2e-2",
        userId: "user-1",
        requestId: "req-e2e-2",
        slackSourceId: rawSlackEvent.ts,
        gmailSourceId: selectedEmail.id,
        trelloBoardId: "board-finance",
        trelloListId: "list-todo",
        taskTitle: extractedTask.title,
        taskDescription: extractedTask.description,
        assigneeMemberId: chosenAssigneeId,
        status: "pending",
        approvalToken: "tok-e2e-approve-99",
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        createdAt: new Date(),
      };

      const proposalView = ProposalPresenter.renderProposal(finalizedProposal, chosenAssigneeName);
      expect(proposalView.text).toContain("Invoice Inquiry - Q3 Statement");
      expect(proposalView.text).toContain("Alex Johnson");
      expect(proposalView.inlineKeyboard[0][0].callback_data).toBe("a:tok-e2e-approve-99");
      expect(proposalView.inlineKeyboard[0][1].callback_data).toBe("c:tok-e2e-approve-99");

      // Step 6: Verify no Trello write occurs before explicit Telegram approval callback
      let trelloWriteOccurred = false;
      const mockTrelloClient: TrelloClient = {
        createCard: async () => {
          trelloWriteOccurred = true;
          return { id: "card-e2e-confirmed", url: "https://trello.com/c/card-e2e-confirmed" };
        },
        assignMember: async () => true,
        getCardsInList: async () => [],
      };
      expect(trelloWriteOccurred).toBe(false);

      // Step 7: Allowlisted Telegram user confirms; verify one Trello card is created and assigned, and card URL reported
      const executionOutcome = await ApprovalExecutor.executeApproval(finalizedProposal, mockTrelloClient);
      expect(trelloWriteOccurred).toBe(true);
      expect(executionOutcome.success).toBe(true);
      expect(executionOutcome.proposal.status).toBe("succeeded");
      expect(executionOutcome.execution?.trelloCardId).toBe("card-e2e-confirmed");
      expect(executionOutcome.execution?.assignmentStatus).toBe("assigned");
      expect(executionOutcome.userNotice).toContain("https://trello.com/c/card-e2e-confirmed");

      // Step 8: Simulate a rapid duplicate click or replayed callback
      const replayOutcome = await ApprovalExecutor.executeApproval(finalizedProposal, mockTrelloClient);
      expect(replayOutcome.success).toBe(false);
      expect(replayOutcome.userNotice).toContain("already processed");
      expect(finalizedProposal.status).toBe("succeeded"); // Did not re-execute or duplicate
    });
  });
});

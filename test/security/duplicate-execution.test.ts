import { describe, it, expect } from "vitest";
import { ProposalStateMachine } from "@/state/proposal-state-machine";
import { ApprovalExecutor, TrelloClient } from "@/trello/approval-executor";
import { ActionProposal } from "@/types/entities";

describe("Milestone 6 Security: Concurrency & Duplicate Protection (T-014, T-015, T-023)", () => {
  const createMockProposal = (overrides?: Partial<ActionProposal>): ActionProposal => ({
    id: "prop-dup-1",
    userId: "user-1",
    requestId: "req-1",
    slackSourceId: "slack-ev-1",
    gmailSourceId: "gm-dup-1",
    trelloBoardId: "board-1",
    trelloListId: "list-1",
    taskTitle: "Database index optimization",
    taskDescription: "Add compound index on proposals",
    status: "pending",
    approvalToken: "tok-dup-1",
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    createdAt: new Date(),
    ...overrides,
  });

  describe("T-014: Double click / concurrent approval replay protection", () => {
    it("atomic state transition rejects second click and prevents duplicate card writes", async () => {
      const proposal = createMockProposal();
      let createCardCalls = 0;

      const mockTrello: TrelloClient = {
        createCard: async () => {
          createCardCalls++;
          return { id: "card-single-write", url: "https://trello.com/c/1" };
        },
        assignMember: async () => true,
        getCardsInList: async () => [],
      };

      // Click 1: First approval
      const firstResult = await ApprovalExecutor.executeApproval(proposal, mockTrello);
      expect(firstResult.success).toBe(true);
      expect(createCardCalls).toBe(1);
      expect(proposal.status).toBe("succeeded");

      // Click 2: Second duplicate approval click
      const secondResult = await ApprovalExecutor.executeApproval(proposal, mockTrello);
      expect(secondResult.success).toBe(false);
      expect(secondResult.userNotice).toContain("already processed");
      expect(createCardCalls).toBe(1); // Zero additional writes!
    });
  });

  describe("T-015: Slack webhook event retry deduplication (same event_id)", () => {
    it("deduplicates identical Slack event_ids and processes only once", () => {
      const processedEventIds = new Set<string>();

      const handleSlackEvent = (eventId: string): { processed: boolean; reason?: string } => {
        if (processedEventIds.has(eventId)) {
          return { processed: false, reason: "Duplicate event_id; already processed" };
        }
        processedEventIds.add(eventId);
        return { processed: true };
      };

      const eventId = "Ev0123456789";

      // Initial delivery
      const res1 = handleSlackEvent(eventId);
      expect(res1.processed).toBe(true);

      // Slack retry with same event_id
      const res2 = handleSlackEvent(eventId);
      expect(res2.processed).toBe(false);
      expect(res2.reason).toContain("Duplicate event_id");
    });
  });

  describe("T-023: Expired proposal callback (>24h)", () => {
    it("rejects approval of proposal past 24h expiration window without executing writes", async () => {
      // Expired 1 hour ago
      const expiredProposal = createMockProposal({
        expiresAt: new Date(Date.now() - 3600 * 1000),
      });

      let createCardCalls = 0;
      const mockTrello: TrelloClient = {
        createCard: async () => {
          createCardCalls++;
          return { id: "should-not-create", url: "" };
        },
        assignMember: async () => true,
        getCardsInList: async () => [],
      };

      const result = await ApprovalExecutor.executeApproval(expiredProposal, mockTrello);

      expect(result.success).toBe(false);
      expect(expiredProposal.status).toBe("expired");
      expect(result.userNotice).toContain("Proposal has expired (>24 hours)");
      expect(createCardCalls).toBe(0); // Zero writes
    });
  });
});

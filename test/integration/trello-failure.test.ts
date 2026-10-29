import { describe, it, expect } from "vitest";
import { ApprovalExecutor, TrelloClient } from "@/trello/approval-executor";
import { ActionProposal } from "@/types/entities";

describe("Milestone 6 Integration: Trello Failures, Conservative Reconciliation & Crash Recovery (T-017, T-018, T-019)", () => {
  const createMockProposal = (): ActionProposal => ({
    id: "prop-trello-fail-1",
    userId: "user-1",
    requestId: "req-1",
    slackSourceId: "slack-1",
    gmailSourceId: "gm-test-1",
    trelloBoardId: "board-1",
    trelloListId: "list-1",
    taskTitle: "Database backup validation",
    taskDescription: "Validate daily snapshot backup integrity",
    assigneeMemberId: "mem-backup",
    status: "pending",
    approvalToken: "tok-fail-rec-1",
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    createdAt: new Date(),
  });

  describe("T-017: Trello Write Timeout & Conservative Reconciliation", () => {
    it("reconciles existing card created before timeout using idempotency slug and links it", async () => {
      const proposal = createMockProposal();
      const client: TrelloClient = {
        createCard: async () => {
          throw new Error("ETIMEDOUT: Connection reset by peer");
        },
        assignMember: async () => true,
        getCardsInList: async () => [
          {
            id: "card-timeout-recovered",
            desc: `Details\n\n[idempotency_key: ${proposal.approvalToken}]`,
            url: "https://trello.com/c/card-timeout-recovered",
          },
        ],
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, client);

      expect(outcome.success).toBe(true);
      expect(outcome.proposal.status).toBe("succeeded");
      expect(outcome.execution?.trelloCardId).toBe("card-timeout-recovered");
    });

    it("does NOT retry on single list absence when non-creation is uncertain; sets status to UNCERTAIN", async () => {
      const proposal = createMockProposal();
      let createCalls = 0;

      const client: TrelloClient = {
        createCard: async () => {
          createCalls++;
          throw new Error("504 Gateway Timeout");
        },
        assignMember: async () => true,
        getCardsInList: async () => [], // Empty list response
        verifyNonCreationConclusively: async () => false, // Non-creation cannot be proven with 100% certainty
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, client);

      expect(createCalls).toBe(1); // Crucial: did NOT retry automatically
      expect(outcome.success).toBe(false);
      expect(outcome.proposal.status).toBe("uncertain");
      expect(outcome.execution?.resultStatus).toBe("uncertain");
      expect(outcome.userNotice).toContain("Card Creation Status Uncertain");
    });
  });

  describe("T-018: Partial Failure Reporting", () => {
    it("reports honest partial failure when card creation succeeds but assignee fails", async () => {
      const proposal = createMockProposal();

      const client: TrelloClient = {
        createCard: async () => ({ id: "card-success-1", url: "https://trello.com/c/success" }),
        assignMember: async () => {
          throw new Error("Member not found on target board");
        },
        getCardsInList: async () => [],
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, client);

      expect(outcome.success).toBe(true);
      expect(outcome.proposal.status).toBe("succeeded");
      expect(outcome.execution?.resultStatus).toBe("partial");
      expect(outcome.execution?.assignmentStatus).toBe("failed");
      expect(outcome.userNotice).toContain("partial failure");
      expect(outcome.userNotice).toContain("https://trello.com/c/success");
    });
  });

  describe("T-019: Hard Failure (Permission Denied)", () => {
    it("reports clear failure notification without false success claim when Trello returns 403 Forbidden", async () => {
      const proposal = createMockProposal();

      const client: TrelloClient = {
        createCard: async () => {
          const err: any = new Error("403 Forbidden: Invalid token permissions for board");
          err.status = 403;
          throw err;
        },
        assignMember: async () => true,
        getCardsInList: async () => [],
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, client);

      expect(outcome.success).toBe(false);
      expect(outcome.proposal.status).toBe("failed");
      expect(outcome.execution?.resultStatus).toBe("failed");
      expect(outcome.userNotice).toContain("Failed to create Trello card");
      expect(outcome.userNotice).not.toContain("success");
    });
  });

  describe("Action-Proposal Crash Recovery (5-Minute Threshold)", () => {
    it("recovers card and sets status to SUCCEEDED if card with token slug exists after >5m stall", async () => {
      const proposal = createMockProposal();
      proposal.status = "executing";
      proposal.executedAt = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago (>5m)

      const client: TrelloClient = {
        createCard: async () => ({ id: "not-called", url: "" }),
        assignMember: async () => true,
        getCardsInList: async () => [
          {
            id: "card-crash-rec",
            desc: `Details\n\n[idempotency_key: ${proposal.approvalToken}]`,
            url: "https://trello.com/c/card-crash-rec",
          },
        ],
      };

      const outcome = await ApprovalExecutor.recoverStaleExecutingProposal(proposal, client);

      expect(outcome.success).toBe(true);
      expect(outcome.proposal.status).toBe("succeeded");
      expect(outcome.execution?.trelloCardId).toBe("card-crash-rec");
    });

    it("marks proposal UNCERTAIN and escalates to user if card cannot be verified after >5m stall", async () => {
      const proposal = createMockProposal();
      proposal.status = "executing";
      proposal.executedAt = new Date(Date.now() - 6 * 60 * 1000); // 6 minutes ago

      const client: TrelloClient = {
        createCard: async () => ({ id: "not-called", url: "" }),
        assignMember: async () => true,
        getCardsInList: async () => [], // No card found
      };

      const outcome = await ApprovalExecutor.recoverStaleExecutingProposal(proposal, client);

      expect(outcome.success).toBe(false);
      expect(outcome.proposal.status).toBe("uncertain");
      expect(outcome.userNotice).toContain("Proposal Crash Recovery Warning");
    });
  });
});

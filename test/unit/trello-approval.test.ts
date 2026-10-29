import { describe, it, expect } from "vitest";
import { ProposalPresenter } from "@/trello/proposal-presenter";
import { ApprovalExecutor, TrelloClient } from "@/trello/approval-executor";
import { ActionProposal } from "@/types/entities";

describe("Milestone 5: Trello Write Gating & Conservative Timeout Recovery", () => {
  const createMockProposal = (): ActionProposal => ({
    id: "prop-m5",
    userId: "user-1",
    requestId: "req-1",
    slackSourceId: "msg-slack-99",
    gmailSourceId: "msg-gmail-99",
    trelloBoardId: "board-alpha",
    trelloListId: "list-todo",
    taskTitle: "Refactor Security Middlewares",
    taskDescription: "Implement replay attack prevention and timing-safe checks",
    dueDate: new Date("2026-11-01T00:00:00.000Z"),
    assigneeMemberId: "mem-alice",
    status: "pending",
    approvalToken: "tok-m5-secure",
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    createdAt: new Date(),
  });

  describe("ProposalPresenter", () => {
    it("renders proposal details and compact inline buttons (a:<token> and c:<token> < 64 bytes)", () => {
      const proposal = createMockProposal();
      const view = ProposalPresenter.renderProposal(proposal, "Alice Engineer");

      expect(view.text).toContain("Refactor Security Middlewares");
      expect(view.text).toContain("Alice Engineer");
      expect(view.text).toContain("Confirmation Gate");

      const approveBtn = view.inlineKeyboard[0][0];
      const cancelBtn = view.inlineKeyboard[0][1];

      expect(approveBtn.text).toContain("Approve");
      expect(approveBtn.callback_data).toBe("a:tok-m5-secure");
      expect(Buffer.byteLength(approveBtn.callback_data, "utf-8")).toBeLessThanOrEqual(64);

      expect(cancelBtn.text).toContain("Cancel");
      expect(cancelBtn.callback_data).toBe("c:tok-m5-secure");
      expect(Buffer.byteLength(cancelBtn.callback_data, "utf-8")).toBeLessThanOrEqual(64);
    });
  });

  describe("ApprovalExecutor: Gating & Duplicate Clicks (T-013, T-014, T-012)", () => {
    it("T-013: successfully creates card and assigns member upon explicit user approval", async () => {
      const proposal = createMockProposal();
      let createCalled = false;
      let assignCalled = false;

      const mockClient: TrelloClient = {
        createCard: async (params) => {
          createCalled = true;
          expect(params.desc).toContain("[idempotency_key: tok-m5-secure]");
          return { id: "card-new-1", url: "https://trello.com/c/card-new-1" };
        },
        assignMember: async (cardId, memberId) => {
          assignCalled = true;
          expect(cardId).toBe("card-new-1");
          expect(memberId).toBe("mem-alice");
          return true;
        },
        getCardsInList: async () => [],
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, mockClient);

      expect(createCalled).toBe(true);
      expect(assignCalled).toBe(true);
      expect(outcome.success).toBe(true);
      expect(outcome.proposal.status).toBe("succeeded");
      expect(outcome.execution?.resultStatus).toBe("succeeded");
      expect(outcome.execution?.assignmentStatus).toBe("assigned");
      expect(outcome.userNotice).toContain("created and assigned successfully");
    });

    it("T-014: blocks duplicate approval clicks atomically with zero duplicate writes", async () => {
      const proposal = createMockProposal();
      let createCallCount = 0;

      const mockClient: TrelloClient = {
        createCard: async () => {
          createCallCount++;
          return { id: "card-1", url: "https://trello.com/c/1" };
        },
        assignMember: async () => true,
        getCardsInList: async () => [],
      };

      // First click: succeeds
      const first = await ApprovalExecutor.executeApproval(proposal, mockClient);
      expect(first.success).toBe(true);
      expect(createCallCount).toBe(1);

      // Second click: rejected immediately
      const second = await ApprovalExecutor.executeApproval(proposal, mockClient);
      expect(second.success).toBe(false);
      expect(second.userNotice).toContain("already processed");
      expect(createCallCount).toBe(1); // No second write
    });

    it("T-012: cancels proposal without creating any Trello card", () => {
      const proposal = createMockProposal();
      const outcome = ApprovalExecutor.handleCancellation(proposal);

      expect(outcome.success).toBe(true);
      expect(outcome.proposal.status).toBe("cancelled");
      expect(outcome.userNotice).toContain("cancelled. No Trello card was created");
    });
  });

  describe("T-017 & Conservative Timeout Recovery", () => {
    it("reconciles existing card created during network timeout and avoids creating duplicate", async () => {
      const proposal = createMockProposal();
      let createAttempts = 0;

      const mockClient: TrelloClient = {
        createCard: async () => {
          createAttempts++;
          throw new Error("ETIMEDOUT: Socket hang up during card creation");
        },
        assignMember: async () => true,
        getCardsInList: async (listId) => {
          // Reconcile list returns the card that was actually created before timeout
          return [
            {
              id: "card-reconciled-99",
              desc: `Task details\n\n[idempotency_key: ${proposal.approvalToken}]`,
              url: "https://trello.com/c/card-reconciled-99",
            },
          ];
        },
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, mockClient);

      expect(createAttempts).toBe(1);
      expect(outcome.success).toBe(true);
      expect(outcome.execution?.trelloCardId).toBe("card-reconciled-99");
      expect(outcome.proposal.status).toBe("succeeded");
    });

    it("CRITICAL RULE: does NOT blindly retry card creation when marker is absent in a single list query; marks UNCERTAIN", async () => {
      const proposal = createMockProposal();
      let createAttempts = 0;

      const mockClient: TrelloClient = {
        createCard: async () => {
          createAttempts++;
          throw new Error("504 Gateway Timeout");
        },
        assignMember: async () => true,
        getCardsInList: async () => {
          // Empty list returned (could be eventual consistency or timeout lag)
          return [];
        },
        verifyNonCreationConclusively: async () => {
          // Non-creation could NOT be verified with 100% certainty
          return false;
        },
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, mockClient);

      expect(createAttempts).toBe(1); // Did NOT blindly retry!
      expect(outcome.success).toBe(false);
      expect(outcome.proposal.status).toBe("uncertain");
      expect(outcome.execution?.resultStatus).toBe("uncertain");
      expect(outcome.userNotice).toContain("Card Creation Status Uncertain");
      expect(outcome.userNotice).toContain("Automated retries were halted to prevent duplicates");
    });
    it("retries safely once when non-creation IS conclusively verified", async () => {
      const proposal = createMockProposal();
      let createAttempts = 0;

      const mockClient: TrelloClient = {
        createCard: async () => {
          createAttempts++;
          if (createAttempts === 1) {
            throw new Error("504 Gateway Timeout");
          }
          return { id: "card-retried-1", url: "https://trello.com/c/card-retried-1" };
        },
        assignMember: async () => true,
        getCardsInList: async () => [],
        verifyNonCreationConclusively: async () => true,
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, mockClient);

      expect(createAttempts).toBe(2); // Safely retried once!
      expect(outcome.success).toBe(true);
      expect(outcome.execution?.trelloCardId).toBe("card-retried-1");
      expect(outcome.proposal.status).toBe("succeeded");
    });
  });

  describe("T-018: Partial Failure Reporting (Card Created, Assignment Failed)", () => {
    it("reports honest partial failure when card creation succeeds but member assignment fails", async () => {
      const proposal = createMockProposal();

      const mockClient: TrelloClient = {
        createCard: async () => ({ id: "card-partial-1", url: "https://trello.com/c/card-partial-1" }),
        assignMember: async () => {
          throw new Error("Trello member not on board");
        },
        getCardsInList: async () => [],
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, mockClient);

      expect(outcome.success).toBe(true);
      expect(outcome.proposal.status).toBe("succeeded");
      expect(outcome.execution?.resultStatus).toBe("partial");
      expect(outcome.execution?.assignmentStatus).toBe("failed");
      expect(outcome.userNotice).toContain("partial failure");
      expect(outcome.userNotice).toContain("Member assignment failed");
      expect(outcome.userNotice).toContain("https://trello.com/c/card-partial-1");
    });
  });

  describe("T-019: Hard Failure (Permission Denied / Invalid List)", () => {
    it("records hard failure on 401/403 permission denied with clear user notification and no false success", async () => {
      const proposal = createMockProposal();

      const mockClient: TrelloClient = {
        createCard: async () => {
          const err: any = new Error("unauthorized permission denied for list");
          err.status = 403;
          throw err;
        },
        assignMember: async () => true,
        getCardsInList: async () => [],
      };

      const outcome = await ApprovalExecutor.executeApproval(proposal, mockClient);

      expect(outcome.success).toBe(false);
      expect(outcome.proposal.status).toBe("failed");
      expect(outcome.execution?.resultStatus).toBe("failed");
      expect(outcome.userNotice).toContain("Failed to create Trello card");
      expect(outcome.userNotice).not.toContain("success");
    });
  });
});


import { describe, it, expect } from "vitest";
import { ProposalStateMachine } from "@/state/proposal-state-machine";
import { ActionProposal } from "@/types/entities";

describe("Milestone 1 Proposal State Machine & Concurrency Protection", () => {
  const createMockProposal = (status: ActionProposal["status"] = "pending", expiresHours = 24): ActionProposal => ({
    id: "prop-101",
    userId: "usr-1",
    requestId: "req-1",
    slackSourceId: "msg-slack-1",
    gmailSourceId: "msg-gmail-1",
    trelloBoardId: "board-1",
    trelloListId: "list-1",
    taskTitle: "Review Security Architecture",
    taskDescription: "Review proposed architecture notes",
    status,
    approvalToken: "tok-abc-123",
    expiresAt: new Date(Date.now() + expiresHours * 3600 * 1000),
    createdAt: new Date(),
  });

  it("transitions atomically from pending to executing on first user approval", () => {
    const proposal = createMockProposal("pending");
    const result = ProposalStateMachine.transition(proposal, "executing");

    expect(result.success).toBe(true);
    expect(result.proposal?.status).toBe("executing");
    expect(result.proposal?.executedAt).toBeInstanceOf(Date);
  });

  it("T-014: blocks duplicate clicks and concurrent replayed callbacks", () => {
    const proposal = createMockProposal("pending");
    // First click transitions to executing
    const firstClick = ProposalStateMachine.transition(proposal, "executing");
    expect(firstClick.success).toBe(true);
    expect(proposal.status).toBe("executing");

    // Second click attempted concurrently or replayed
    const secondClick = ProposalStateMachine.transition(proposal, "executing");
    expect(secondClick.success).toBe(false);
    expect(secondClick.code).toBe("ALREADY_PROCESSED");
    expect(secondClick.error).toContain("already processed or under review");
  });

  it("blocks transition on already succeeded/failed/cancelled proposals", () => {
    const succeededProposal = createMockProposal("succeeded");
    const resSucceeded = ProposalStateMachine.transition(succeededProposal, "executing");
    expect(resSucceeded.success).toBe(false);
    expect(resSucceeded.code).toBe("ALREADY_PROCESSED");

    const failedProposal = createMockProposal("failed");
    const resFailed = ProposalStateMachine.transition(failedProposal, "executing");
    expect(resFailed.success).toBe(false);
    expect(resFailed.code).toBe("ALREADY_PROCESSED");
  });

  it("T-023: rejects expired proposal callbacks (>24h) and marks expired", () => {
    // Proposal expired 1 hour ago
    const expiredProposal = createMockProposal("pending", -1);
    const result = ProposalStateMachine.transition(expiredProposal, "executing");

    expect(result.success).toBe(false);
    expect(result.code).toBe("PROPOSAL_EXPIRED");
    expect(result.proposal?.status).toBe("expired");
  });

  it("permits user cancellation transition from pending to cancelled", () => {
    const proposal = createMockProposal("pending");
    const result = ProposalStateMachine.transition(proposal, "cancelled");

    expect(result.success).toBe(true);
    expect(result.proposal?.status).toBe("cancelled");
  });

  it("permits transition from executing to succeeded, failed, or uncertain", () => {
    const p1 = createMockProposal("executing");
    expect(ProposalStateMachine.transition(p1, "succeeded").success).toBe(true);

    const p2 = createMockProposal("executing");
    expect(ProposalStateMachine.transition(p2, "failed").success).toBe(true);

    const p3 = createMockProposal("executing");
    expect(ProposalStateMachine.transition(p3, "uncertain").success).toBe(true);
  });

  it("enforces 5-minute crash recovery: stale executing proposal can transition to uncertain or succeeded", () => {
    const proposal = createMockProposal("executing");
    // Simulate 6 minutes in the past
    proposal.executedAt = new Date(Date.now() - 6 * 60 * 1000);

    const recoveryResult = ProposalStateMachine.transition(proposal, "uncertain", {
      forceStaleRecovery: true,
      now: new Date(),
    });

    expect(recoveryResult.success).toBe(true);
    expect(proposal.status).toBe("uncertain");
  });
});

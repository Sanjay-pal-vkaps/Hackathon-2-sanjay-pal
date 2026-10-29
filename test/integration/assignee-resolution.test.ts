import { describe, it, expect } from "vitest";
import { AssigneeResolver } from "@/workflow/assignee-resolver";
import { TrelloMemberSummary } from "@/adapters/trello-adapter";

describe("Milestone 6 Integration: Assignee Resolution & Ambiguity Flow (T-008)", () => {
  const boardMembers: TrelloMemberSummary[] = [
    { id: "mem-alice", fullName: "Alice Smith", username: "alicesmith" },
    { id: "mem-alex", fullName: "Alex Johnson", username: "alexj" },
    { id: "mem-alicia", fullName: "Alicia Keys", username: "aliciak" },
    { id: "mem-bob", fullName: "Bob Builder", username: "bobbuilder" },
  ];

  it("resolves exact unambiguous assignee name match without clarification", () => {
    const result = AssigneeResolver.resolveAssignee({
      candidateName: "Bob Builder",
      boardMembers,
    });

    expect(result.status).toBe("exact");
    expect(result.selectedMemberId).toBe("mem-bob");
    expect(result.selectedMemberName).toBe("Bob Builder");
    expect(result.clarificationPrompt).toBeUndefined();
  });

  describe("T-008: Ambiguous assignee handling", () => {
    it("prompts user with interactive selection menu of real board members when candidate is ambiguous (e.g. 'Al')", () => {
      const result = AssigneeResolver.resolveAssignee({
        candidateName: "Al",
        boardMembers,
        sessionId: "s1",
      });

      expect(result.status).toBe("ambiguous");
      expect(result.selectedMemberId).toBeUndefined();
      expect(result.candidateOptions).toBeDefined();
      expect(result.candidateOptions!.length).toBeGreaterThanOrEqual(3);

      const labels = result.candidateOptions!.map((o) => o.label);
      expect(labels.some((l) => l.includes("Alice Smith"))).toBe(true);
      expect(labels.some((l) => l.includes("Alex Johnson"))).toBe(true);
      expect(labels.some((l) => l.includes("Alicia Keys"))).toBe(true);
      expect(labels.some((l) => l.includes("Leave Unassigned"))).toBe(true);

      const unassignedOpt = result.candidateOptions!.find((o) => o.label.includes("Leave Unassigned"));
      expect(unassignedOpt?.callbackToken).toBe("m:s1:none");
    });

    it("presents all board members plus 'Leave Unassigned' when candidate name is unknown or missing", () => {
      const result = AssigneeResolver.resolveAssignee({
        candidateName: "Unknown Person",
        boardMembers,
        sessionId: "s2",
      });

      expect(result.status).toBe("ambiguous");
      expect(result.selectedMemberId).toBeUndefined();
      expect(result.candidateOptions).toHaveLength(boardMembers.length + 1); // 4 members + 1 unassigned
    });
  });
});

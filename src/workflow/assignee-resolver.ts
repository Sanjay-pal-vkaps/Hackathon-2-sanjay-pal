import { TrelloMemberSummary } from "@/adapters/trello-adapter";

export type AssigneeResolutionStatus = 'exact' | 'ambiguous' | 'unassigned';

export interface AssigneeResolutionResult {
  status: AssigneeResolutionStatus;
  selectedMemberId?: string | null;
  selectedMemberName?: string;
  candidateOptions?: Array<{ id: string | null; label: string; callbackToken: string }>;
  clarificationPrompt?: string;
}

export class AssigneeResolver {
  /**
   * Resolves candidate assignee against verified Trello board members
   * If ambiguous, missing, or unverified: triggers interactive picker
   */
  static resolveAssignee(params: {
    candidateName?: string;
    boardMembers: TrelloMemberSummary[];
    sessionId?: string; // used for compact callback token
  }): AssigneeResolutionResult {
    const { candidateName, boardMembers, sessionId = 's1' } = params;

    // 1. Missing assignee candidate
    if (!candidateName || !candidateName.trim()) {
      return this.buildAmbiguousPicker(boardMembers, sessionId, "No assignee was specified in the email.");
    }

    const cleanCandidate = candidateName.toLowerCase().replace(/[@.,]/g, '').trim();

    // 2. Exact match check against username or full name
    const exactMatches = boardMembers.filter(
      (m) =>
        m.username.toLowerCase() === cleanCandidate ||
        m.fullName.toLowerCase() === cleanCandidate
    );

    if (exactMatches.length === 1) {
      return {
        status: 'exact',
        selectedMemberId: exactMatches[0].id,
        selectedMemberName: exactMatches[0].fullName,
      };
    }

    // 3. Partial match check
    const partialMatches = boardMembers.filter(
      (m) =>
        m.username.toLowerCase().includes(cleanCandidate) ||
        m.fullName.toLowerCase().includes(cleanCandidate)
    );

    if (partialMatches.length === 1) {
      return {
        status: 'exact',
        selectedMemberId: partialMatches[0].id,
        selectedMemberName: partialMatches[0].fullName,
      };
    }

    // 4. Ambiguous or zero match -> Prompt user with valid board members + Unassigned
    return this.buildAmbiguousPicker(
      boardMembers,
      sessionId,
      `Assignee "${candidateName}" is ambiguous or not a verified board member.`
    );
  }

  private static buildAmbiguousPicker(
    boardMembers: TrelloMemberSummary[],
    sessionId: string,
    reason: string
  ): AssigneeResolutionResult {
    // Generate compact callback tokens strictly <= 64 bytes: m:<sessionId>:<idx>
    const candidateOptions: Array<{ id: string | null; label: string; callbackToken: string }> = [
      ...boardMembers.slice(0, 5).map((m, idx) => ({
        id: m.id,
        label: `👤 ${m.fullName} (@${m.username})`,
        callbackToken: `m:${sessionId}:${idx}`,
      })),
      {
        id: null,
        label: '⚪ Leave Unassigned',
        callbackToken: `m:${sessionId}:none`,
      },
    ];

    return {
      status: 'ambiguous',
      candidateOptions,
      clarificationPrompt: `❓ *Assignee Clarification Needed*\n${reason}\nPlease select a verified team member:`,
    };
  }
}

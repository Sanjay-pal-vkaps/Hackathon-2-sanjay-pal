import { ActionProposal, ProposalStatus } from "@/types/entities";

export interface TransitionResult {
  success: boolean;
  proposal?: ActionProposal;
  error?: string;
  code?: 'INVALID_TRANSITION' | 'PROPOSAL_EXPIRED' | 'ALREADY_PROCESSED' | 'NOT_FOUND';
}

/**
 * Valid unidirectional state transitions for Action Proposals
 */
const VALID_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  pending: ['executing', 'cancelled', 'expired'],
  executing: ['succeeded', 'failed', 'uncertain'],
  succeeded: [], // terminal
  failed: [], // terminal
  uncertain: [], // terminal / requires manual intervention
  cancelled: [], // terminal
  expired: [], // terminal
};

export class ProposalStateMachine {
  /**
   * Checks whether a status transition is permitted by architectural specification
   */
  static isValidTransition(currentStatus: ProposalStatus, nextStatus: ProposalStatus): boolean {
    const allowed = VALID_TRANSITIONS[currentStatus];
    return Boolean(allowed && allowed.includes(nextStatus));
  }

  /**
   * Attempts an atomic transition from current status to next status with concurrency/replay protection
   */
  static transition(
    proposal: ActionProposal,
    nextStatus: ProposalStatus,
    options?: { now?: Date; forceStaleRecovery?: boolean }
  ): TransitionResult {
    const now = options?.now || new Date();

    // 1. Expiration check on pending proposals
    if (proposal.status === 'pending' && proposal.expiresAt <= now) {
      proposal.status = 'expired';
      return {
        success: false,
        proposal,
        error: 'Proposal has expired (>24 hours)',
        code: 'PROPOSAL_EXPIRED',
      };
    }

    // 2. Duplicate approval / already processed check
    if (proposal.status !== 'pending') {
      // Special case: Proposal crash recovery after 5 minutes when stuck in executing
      if (options?.forceStaleRecovery && proposal.status === 'executing') {
        const executingDurationMs = now.getTime() - (proposal.executedAt?.getTime() || proposal.createdAt.getTime());
        if (executingDurationMs >= 5 * 60 * 1000) {
          // Stale execution detected; can transition to uncertain or succeeded
          if (nextStatus === 'succeeded' || nextStatus === 'uncertain') {
            proposal.status = nextStatus;
            return { success: true, proposal };
          }
        }
      }

      if (nextStatus === 'executing') {
        return {
          success: false,
          proposal,
          error: `Proposal already processed or under review (current status: ${proposal.status})`,
          code: 'ALREADY_PROCESSED',
        };
      }
    }

    // 3. Unidirectional transition validation
    if (!this.isValidTransition(proposal.status, nextStatus)) {
      return {
        success: false,
        proposal,
        error: `Invalid proposal status transition from '${proposal.status}' to '${nextStatus}'`,
        code: 'INVALID_TRANSITION',
      };
    }

    // 4. Apply transition
    proposal.status = nextStatus;
    if (nextStatus === 'executing') {
      proposal.executedAt = now;
    }

    return {
      success: true,
      proposal,
    };
  }
}

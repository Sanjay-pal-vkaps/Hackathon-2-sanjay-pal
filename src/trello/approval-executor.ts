import { ActionProposal, ActionExecution } from "@/types/entities";
import { ProposalStateMachine } from "@/state/proposal-state-machine";

export interface TrelloClient {
  createCard: (params: { listId: string; name: string; desc: string }) => Promise<{ id: string; url: string; shortUrl?: string }>;
  assignMember: (cardId: string, memberId: string) => Promise<boolean>;
  getCardsInList: (listId: string) => Promise<Array<{ id: string; desc: string; url: string; shortUrl?: string }>>;
  verifyNonCreationConclusively?: (listId: string, idempotencyKey: string) => Promise<boolean>;
}

export interface ExecutionOutcome {
  success: boolean;
  proposal: ActionProposal;
  execution?: ActionExecution;
  userNotice: string;
}

export class ApprovalExecutor {
  /**
   * Builds unique idempotency marker slug embedded into card description
   */
  static buildIdempotencyMarker(token: string): string {
    return `[idempotency_key: ${token}]`;
  }

  /**
   * Handles user cancellation callback
   */
  static handleCancellation(proposal: ActionProposal): ExecutionOutcome {
    const transition = ProposalStateMachine.transition(proposal, "cancelled");
    if (!transition.success) {
      return {
        success: false,
        proposal,
        userNotice: `❌ Cancellation rejected: ${transition.error}`,
      };
    }
    return {
      success: true,
      proposal,
      userNotice: "🚫 Task proposal cancelled. No Trello card was created.",
    };
  }

  /**
   * Executes approved Trello card creation and member assignment with atomic locking and conservative timeout recovery
   */
  static async executeApproval(
    proposal: ActionProposal,
    trelloClient: TrelloClient,
    options: { now?: Date } = {}
  ): Promise<ExecutionOutcome> {
    const now = options.now || new Date();

    // 1. Atomic state transition from pending to executing (T-014: blocks duplicate clicks)
    const transition = ProposalStateMachine.transition(proposal, "executing", { now });
    if (!transition.success) {
      return {
        success: false,
        proposal,
        userNotice: `⚠️ ${transition.error}`,
      };
    }

    const idempotencyMarker = this.buildIdempotencyMarker(proposal.approvalToken);
    const cardDescription = `${proposal.taskDescription}\n\n${idempotencyMarker}`;

    let cardId: string | undefined = undefined;
    let cardUrl: string | undefined = undefined;
    let cardCreationStatus: 'succeeded' | 'failed' | 'uncertain' = 'uncertain';
    let safeErrorMessage: string | undefined = undefined;

    // 2. Trello Card Creation Call
    try {
      const created = await trelloClient.createCard({
        listId: proposal.trelloListId,
        name: proposal.taskTitle,
        desc: cardDescription,
      });
      cardId = created.id;
      cardUrl = created.url || created.shortUrl;
      cardCreationStatus = 'succeeded';
    } catch (err: any) {
      safeErrorMessage = err.message || "Trello network error";
      const isHardError =
        err.status === 401 ||
        err.status === 403 ||
        err.status === 404 ||
        err.statusCode === 401 ||
        err.statusCode === 403 ||
        err.statusCode === 404 ||
        /permission denied|unauthorized|forbidden|not found|invalid/i.test(err.message || '');

      if (isHardError) {
        cardCreationStatus = 'failed';
      } else {
        // 3. Conservative Timeout Recovery & Card Reconciliation (T-017)
        // Never blindly retry card creation. Query list for idempotency marker.
        try {
          const existingCards = await trelloClient.getCardsInList(proposal.trelloListId);
          const matchedCard = existingCards.find((c) => c.desc && c.desc.includes(idempotencyMarker));

          if (matchedCard) {
            // Card was successfully created despite network timeout!
            cardId = matchedCard.id;
            cardUrl = matchedCard.url || matchedCard.shortUrl;
            cardCreationStatus = 'succeeded';
          } else {
            // Marker is absent from list response.
            // CRITICAL SPEC: Do NOT retry merely because marker is absent in a single list query!
            // Only retry if non-creation can be established conclusively.
            let nonCreationVerified = false;
            if (trelloClient.verifyNonCreationConclusively) {
              nonCreationVerified = await trelloClient.verifyNonCreationConclusively(proposal.trelloListId, proposal.approvalToken);
            }

            if (nonCreationVerified) {
              // Conclusively established non-creation -> safely retry once
              try {
                const retried = await trelloClient.createCard({
                  listId: proposal.trelloListId,
                  name: proposal.taskTitle,
                  desc: cardDescription,
                });
                cardId = retried.id;
                cardUrl = retried.url || retried.shortUrl;
                cardCreationStatus = 'succeeded';
              } catch (retryErr: any) {
                cardCreationStatus = 'failed';
                safeErrorMessage = retryErr.message || 'Retry failed';
              }
            } else {
              // Non-creation cannot be proven with 100% certainty. Do NOT retry automatically.
              cardCreationStatus = 'uncertain';
            }
          }
        } catch (reconcileErr: any) {
          if (
            reconcileErr.status === 401 ||
            reconcileErr.status === 403 ||
            /permission denied|unauthorized|forbidden/i.test(reconcileErr.message || '')
          ) {
            cardCreationStatus = 'failed';
            safeErrorMessage = `Permission denied querying list: ${reconcileErr.message}`;
          } else {
            cardCreationStatus = 'uncertain';
            safeErrorMessage = `Timeout during creation, and reconciliation query failed: ${reconcileErr.message}`;
          }
        }
      }
    }

    // 4. Handle Uncertain Outcome
    if (cardCreationStatus === 'uncertain') {
      proposal.status = 'uncertain';
      const execution: ActionExecution = {
        id: `exec-${Date.now()}`,
        proposalId: proposal.id,
        resultStatus: 'uncertain',
        safeErrorMessage,
        executedAt: now,
      };
      return {
        success: false,
        proposal,
        execution,
        userNotice: `⚠️ *Card Creation Status Uncertain*\nA network timeout occurred while creating the card. Automated retries were halted to prevent duplicates.\nPlease check your Trello list manually before trying again.`,
      };
    }

    // 5. Handle Hard Failure (T-019)
    if (cardCreationStatus === 'failed' || !cardId) {
      proposal.status = 'failed';
      const execution: ActionExecution = {
        id: `exec-${Date.now()}`,
        proposalId: proposal.id,
        resultStatus: 'failed',
        safeErrorMessage,
        executedAt: now,
      };
      return {
        success: false,
        proposal,
        execution,
        userNotice: `❌ *Failed to create Trello card:* ${safeErrorMessage || "Permission denied or invalid list"}.`,
      };
    }

    // 6. Member Assignment Execution (Reported Separately - T-018)
    let assignmentStatus: 'unassigned' | 'assigned' | 'failed' = 'unassigned';
    if (proposal.assigneeMemberId) {
      try {
        const assignOk = await trelloClient.assignMember(cardId, proposal.assigneeMemberId);
        assignmentStatus = assignOk ? 'assigned' : 'failed';
      } catch (assignErr) {
        assignmentStatus = 'failed';
      }
    }

    const isPartialFailure = assignmentStatus === 'failed';
    const executionResultStatus = isPartialFailure ? 'partial' : 'succeeded';
    proposal.status = 'succeeded';

    const execution: ActionExecution = {
      id: `exec-${Date.now()}`,
      proposalId: proposal.id,
      trelloCardId: cardId,
      trelloCardUrl: cardUrl,
      assignmentStatus,
      resultStatus: executionResultStatus,
      executedAt: now,
    };

    let userNotice: string;
    if (isPartialFailure) {
      userNotice = `⚠️ *Trello card created with partial failure:*\nCard link: [View Card](${cardUrl})\nMember assignment failed. Please assign the member manually.`;
    } else {
      userNotice = `✅ *Trello card created and assigned successfully!*\nCard link: [View Card](${cardUrl})`;
    }

    return {
      success: true,
      proposal,
      execution,
      userNotice,
    };
  }

  /**
   * Action-Proposal Crash Recovery (5-Minute Threshold):
   * Independent from scheduler job locking, interactive proposals stuck in `executing`
   * beyond 5 minutes are evaluated by crash recovery.
   * - If card existence with token slug is verified, transitions to `succeeded`.
   * - If unresolved, transitions to `uncertain` and escalates to user; NEVER re-executed automatically.
   */
  static async recoverStaleExecutingProposal(
    proposal: ActionProposal,
    trelloClient: TrelloClient,
    options: { now?: Date } = {}
  ): Promise<ExecutionOutcome> {
    const now = options.now || new Date();
    const executingDurationMs = now.getTime() - (proposal.executedAt?.getTime() || proposal.createdAt.getTime());
    if (executingDurationMs < 5 * 60 * 1000) {
      return {
        success: false,
        proposal,
        userNotice: "Proposal has not exceeded the 5-minute crash recovery threshold.",
      };
    }

    const idempotencyMarker = this.buildIdempotencyMarker(proposal.approvalToken);
    try {
      const existingCards = await trelloClient.getCardsInList(proposal.trelloListId);
      const matched = existingCards.find((c) => c.desc && c.desc.includes(idempotencyMarker));
      if (matched) {
        ProposalStateMachine.transition(proposal, "succeeded", { now, forceStaleRecovery: true });
        return {
          success: true,
          proposal,
          execution: {
            id: `exec-rec-${Date.now()}`,
            proposalId: proposal.id,
            trelloCardId: matched.id,
            trelloCardUrl: matched.url || matched.shortUrl,
            resultStatus: "succeeded",
            executedAt: now,
          },
          userNotice: `✅ Recovered: Trello card verified: [View Card](${matched.url || matched.shortUrl})`,
        };
      }
    } catch (err: any) {
      // Query failed or timed out
    }

    // Unresolved -> transition to uncertain, never blindly retry
    ProposalStateMachine.transition(proposal, "uncertain", { now, forceStaleRecovery: true });
    return {
      success: false,
      proposal,
      execution: {
        id: `exec-rec-${Date.now()}`,
        proposalId: proposal.id,
        resultStatus: "uncertain",
        safeErrorMessage: "Execution stalled >5m; card existence unverified",
        executedAt: now,
      },
      userNotice: `⚠️ *Proposal Crash Recovery Warning:*\nProposal was executing for >5 minutes but card creation could not be verified.\nMarked as UNCERTAIN. Automated re-execution prevented to avoid duplicate cards.`,
    };
  }
}


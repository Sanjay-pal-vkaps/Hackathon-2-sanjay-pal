import { ActionProposal } from "@/types/entities";

export interface ProposalView {
  text: string;
  inlineKeyboard: Array<Array<{ text: string; callback_data: string }>>;
}

export class ProposalPresenter {
  /**
   * Renders finalized task proposal for Telegram with inline Approve and Cancel controls.
   * Callback tokens strictly <= 64 bytes: a:<token> (approve), c:<token> (cancel)
   */
  static renderProposal(proposal: ActionProposal, assigneeName?: string): ProposalView {
    const lines: string[] = [];

    lines.push(`📝 *Action Proposal — Trello Card Creation*`);
    lines.push(`──────────────────────────────────────────`);
    lines.push(`*Title:* ${proposal.taskTitle}`);
    lines.push(`*Target Board/List:* \`${proposal.trelloBoardId}\` / \`${proposal.trelloListId}\``);
    lines.push(`*Assignee:* ${assigneeName || (proposal.assigneeMemberId ? `\`${proposal.assigneeMemberId}\`` : '_Unassigned_')}`);

    if (proposal.dueDate) {
      lines.push(`*Due Date:* ${proposal.dueDate.toISOString().split('T')[0]}`);
    }

    lines.push(`\n*Description Preview:*`);
    lines.push(`_${proposal.taskDescription.substring(0, 200)}${proposal.taskDescription.length > 200 ? '...' : ''}_`);

    lines.push(`\n⚠️ *Confirmation Gate:* No task will be created without explicit approval.`);

    const approveCallback = `a:${proposal.approvalToken}`;
    const cancelCallback = `c:${proposal.approvalToken}`;

    return {
      text: lines.join('\n'),
      inlineKeyboard: [
        [
          { text: '✅ Approve & Create Card', callback_data: approveCallback },
          { text: '❌ Cancel', callback_data: cancelCallback },
        ],
      ],
    };
  }
}

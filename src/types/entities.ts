export type ProposalStatus =
  | 'pending'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'uncertain'
  | 'cancelled'
  | 'expired';

export type ExecutionResultStatus =
  | 'succeeded'
  | 'failed'
  | 'uncertain'
  | 'partial';

export interface ActionProposal {
  id: string;
  userId: string;
  requestId: string;
  slackSourceId: string;
  gmailSourceId: string;
  trelloBoardId: string;
  trelloListId: string;
  taskTitle: string;
  taskDescription: string;
  dueDate?: Date | null;
  assigneeMemberId?: string | null;
  status: ProposalStatus;
  approvalToken: string;
  expiresAt: Date;
  createdAt: Date;
  executedAt?: Date | null;
}

export interface ActionExecution {
  id: string;
  proposalId: string;
  trelloCardId?: string | null;
  trelloCardUrl?: string | null;
  assignmentStatus?: 'unassigned' | 'assigned' | 'failed' | null;
  resultStatus: ExecutionResultStatus;
  safeErrorMessage?: string | null;
  executedAt: Date;
}

export interface ScheduledJobRun {
  id: string;
  jobType: string;
  scheduledFor: Date;
  startedAt: Date;
  completedAt?: Date | null;
  status: 'executing' | 'completed' | 'failed';
  providerStatuses: Record<string, string>;
  telegramDeliveryStatus: 'pending' | 'sent' | 'failed';
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

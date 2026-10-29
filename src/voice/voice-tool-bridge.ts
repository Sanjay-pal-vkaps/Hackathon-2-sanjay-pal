import { MCPToolRegistry, MCPCallRequest } from "@/mcp/registry";
import { MultiProviderAggregator } from "@/scheduler/aggregator";
import { ActionProposal } from "@/types/entities";
import { ProposalPresenter } from "@/trello/proposal-presenter";

export interface VoiceToolCallRequest {
  tool_name: string;
  parameters: Record<string, any>;
  userId?: string;
}

export interface VoiceToolCallResponse {
  success: boolean;
  result?: any;
  spokenResponse?: string;
  error?: string;
  actionRequired?: 'telegram_confirmation' | 'none';
  proposalId?: string;
}

export class VoiceToolBridge {
  /**
   * Mock in-memory proposal storage for voice proposals before Telegram callback
   */
  private static proposals: Map<string, ActionProposal> = new Map();

  static getProposal(id: string): ActionProposal | undefined {
    return this.proposals.get(id);
  }

  static clearProposals(): void {
    this.proposals.clear();
  }

  /**
   * Executes voice assistant tool calls through the centralized MCP Gateway and workflow policies
   */
  static async handleToolCall(
    request: VoiceToolCallRequest,
    context: {
      telegramSender?: (text: string, inlineKeyboard?: any) => Promise<boolean>;
      now?: Date;
      aggregatorOverrides?: any;
    } = {}
  ): Promise<VoiceToolCallResponse> {
    const { tool_name, parameters, userId = "user-voice-1" } = request;
    const now = context.now || new Date();

    // 1. Voice Daily Summary Query
    if (tool_name === "get_daily_summary") {
      try {
        const timeZone = parameters.timeZone || process.env.APP_TIMEZONE || "Asia/Kolkata";
        const data = await MultiProviderAggregator.aggregate({
          timeZone,
          now,
          ...context.aggregatorOverrides,
        });

        const meetingCount = data.calendarMeetings.length;
        const taskCount = data.trelloCards.length;
        const emailCount = data.gmailMessages.length;

        const spokenParts: string[] = [];
        spokenParts.push(`Here is your daily overview for ${timeZone}.`);

        if (data.providerStatuses.calendar === "unavailable") {
          spokenParts.push("Google Calendar is currently unavailable.");
        } else if (meetingCount === 0) {
          spokenParts.push("You have no meetings scheduled for today.");
        } else {
          spokenParts.push(`You have ${meetingCount} meeting${meetingCount > 1 ? "s" : ""} today.`);
        }

        if (data.providerStatuses.trello === "unavailable") {
          spokenParts.push("Trello is currently unavailable.");
        } else if (taskCount === 0) {
          spokenParts.push("You have no pending tasks due today.");
        } else {
          spokenParts.push(`You have ${taskCount} task${taskCount > 1 ? "s" : ""} due today.`);
        }

        if (data.providerStatuses.gmail === "unavailable") {
          spokenParts.push("Gmail is currently unavailable.");
        } else if (emailCount === 0) {
          spokenParts.push("No important unread emails found.");
        } else {
          spokenParts.push(`There are ${emailCount} important recent email${emailCount > 1 ? "s" : ""}.`);
        }

        const spokenResponse = spokenParts.join(" ");

        return {
          success: true,
          result: data,
          spokenResponse,
          actionRequired: "none",
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Failed to retrieve daily summary: ${err.message}`,
          spokenResponse: "I encountered an error retrieving your daily summary.",
        };
      }
    }

    // 2. Voice Task Proposal (CONFIRMATION GATE PARITY)
    // When voice user asks to create a Trello card, voice cannot write directly.
    // It creates an ActionProposal in 'pending' status and dispatches Telegram approval request.
    if (tool_name === "propose_trello_task") {
      const title = parameters.title;
      if (!title || !title.trim()) {
        return {
          success: false,
          error: "Missing required task title",
          spokenResponse: "Please specify a title for the task you want to create.",
        };
      }

      const proposalId = `prop-voice-${Date.now()}`;
      const approvalToken = `tok-v-${Date.now().toString(36)}`;
      const proposal: ActionProposal = {
        id: proposalId,
        userId,
        requestId: `req-voice-${Date.now()}`,
        slackSourceId: "voice-conversation",
        gmailSourceId: parameters.gmailMessageId || "voice-direct",
        trelloBoardId: parameters.trelloBoardId || process.env.TRELLO_DEFAULT_BOARD_ID || "board-voice",
        trelloListId: parameters.trelloListId || process.env.TRELLO_DEFAULT_LIST_ID || "list-voice-todo",
        taskTitle: title.trim(),
        taskDescription: parameters.description || `Task proposed via ElevenLabs Voice Assistant on ${now.toISOString()}`,
        dueDate: parameters.dueDate ? new Date(parameters.dueDate) : undefined,
        assigneeMemberId: parameters.assigneeMemberId,
        status: "pending",
        approvalToken,
        expiresAt: new Date(now.getTime() + 24 * 3600 * 1000),
        createdAt: now,
      };

      this.proposals.set(proposalId, proposal);

      // Render Telegram proposal card with Approve/Cancel buttons
      const proposalView = ProposalPresenter.renderProposal(proposal, parameters.assigneeName);

      // Deliver confirmation prompt to Telegram if sender provided
      if (context.telegramSender) {
        await context.telegramSender(proposalView.text, proposalView.inlineKeyboard);
      }

      const spokenResponse = `I have created a task proposal for "${proposal.taskTitle}" and sent a confirmation button to your Telegram. Please tap Approve in Telegram to create the card on Trello.`;

      return {
        success: true,
        proposalId,
        result: {
          proposalId,
          status: "pending",
          taskTitle: proposal.taskTitle,
          approvalToken,
          expiresAt: proposal.expiresAt,
        },
        spokenResponse,
        actionRequired: "telegram_confirmation",
      };
    }

    // 3. Direct write tool interception (Strict gate enforcement)
    // If voice attempts to directly call trello_create_card, route to MCP Gateway with callerType 'agent'
    // which will hard-block the unauthorized write attempt.
    if (tool_name === "trello_create_card") {
      const mcpRequest: MCPCallRequest = {
        tool: "trello_create_card",
        arguments: parameters,
        callerType: "agent", // Voice is an agent caller, NOT verified human confirmation!
      };

      const mcpResponse = await MCPToolRegistry.executeTool(mcpRequest);
      return {
        success: false,
        error: mcpResponse.error || "Direct write blocked by security policy",
        spokenResponse: "I cannot create or modify Trello cards without explicit confirmation. I have sent an approval request to your Telegram.",
        actionRequired: "telegram_confirmation",
      };
    }

    // 4. Standard Read Tools Delegation via Centralized MCP Gateway
    const mcpRequest: MCPCallRequest = {
      tool: tool_name,
      arguments: parameters,
      callerType: "agent",
    };

    const mcpResponse = await MCPToolRegistry.executeTool(mcpRequest);

    if (!mcpResponse.success) {
      return {
        success: false,
        error: mcpResponse.error,
        spokenResponse: `I encountered an issue executing ${tool_name.replace(/_/g, " ")}.`,
      };
    }

    return {
      success: true,
      result: mcpResponse.data,
      spokenResponse: `Successfully retrieved ${tool_name.replace(/_/g, " ")} details.`,
      actionRequired: "none",
    };
  }
}

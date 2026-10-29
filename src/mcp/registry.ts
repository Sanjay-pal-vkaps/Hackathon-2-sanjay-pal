export type ToolCategory = 'read' | 'write';

export interface MCPToolDefinition<TInput = any, TOutput = any> {
  name: string;
  provider: 'gmail' | 'calendar' | 'slack' | 'trello' | 'telegram';
  category: ToolCategory;
  description: string;
  inputSchema: Record<string, any>;
  timeoutMs: number;
  handler: (input: TInput, context?: any) => Promise<TOutput>;
}

export interface MCPCallRequest {
  tool: string;
  arguments: Record<string, any>;
  callerType: 'agent' | 'human_confirmation';
}

export interface MCPCallResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

export class MCPToolRegistry {
  private static tools: Map<string, MCPToolDefinition> = new Map();

  /**
   * Register a standardized MCP tool
   */
  static registerTool(tool: MCPToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Retrieve a tool definition
   */
  static getTool(name: string): MCPToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools
   */
  static listTools(): MCPToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Clear registry (used in test setup)
   */
  static clear(): void {
    this.tools.clear();
  }

  /**
   * Central invocation gateway enforcing write permission gates
   */
  static async executeTool<T = any>(request: MCPCallRequest, context?: any): Promise<MCPCallResponse<T>> {
    const tool = this.tools.get(request.tool);
    if (!tool) {
      return {
        success: false,
        error: `Tool '${request.tool}' is not registered in the MCP Gateway`,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    // STRICT PERMISSION GATE: Write tools can only be invoked by verified human confirmation
    if (tool.category === 'write' && request.callerType !== 'human_confirmation') {
      return {
        success: false,
        error: `Invocation of write tool '${tool.name}' is strictly blocked for callerType '${request.callerType}'. Explicit human approval callback is required.`,
        errorCode: 'UNAUTHORIZED_WRITE_ATTEMPT',
      };
    }

    try {
      const result = await Promise.race([
        tool.handler(request.arguments, context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tool '${tool.name}' timed out after ${tool.timeoutMs}ms`)), tool.timeoutMs)
        ),
      ]);

      return {
        success: true,
        data: result as T,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Tool execution failed',
        errorCode: 'TOOL_EXECUTION_ERROR',
      };
    }
  }
}

import { GmailAdapter } from '@/adapters/gmail-adapter';
import { CalendarAdapter } from '@/adapters/calendar-adapter';
import { SlackAdapter } from '@/adapters/slack-adapter';
import { TrelloAdapter } from '@/adapters/trello-adapter';

/**
 * Standard MCP Tools specification initial registry
 */
export function initializeStandardMCPTools(): void {
  // 1. Gmail Search / Read (strictly read-only)
  MCPToolRegistry.registerTool({
    name: 'gmail_search_read',
    provider: 'gmail',
    category: 'read',
    description: 'Searches and reads Gmail messages with lookback filtering and attachment inspection',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number', default: 100 },
      },
      required: ['query'],
    },
    timeoutMs: 10000,
    handler: async (args) => {
      return GmailAdapter.searchAndRead({
        query: args.query,
        maxResultsCap: args.maxResults,
      });
    },
  });

  // 2. Calendar Get Today (strictly read-only)
  MCPToolRegistry.registerTool({
    name: 'calendar_get_today',
    provider: 'calendar',
    category: 'read',
    description: "Retrieves today's confirmed calendar meetings localized to configured timezone",
    inputSchema: {
      type: 'object',
      properties: {
        timeZone: { type: 'string' },
      },
      required: ['timeZone'],
    },
    timeoutMs: 8000,
    handler: async (args) => {
      const meetings = await CalendarAdapter.getTodayMeetings({
        timeZone: args.timeZone,
      });
      return { events: meetings };
    },
  });

  // 3. Slack Read Channel (strictly read-only)
  MCPToolRegistry.registerTool({
    name: 'slack_read_channel',
    provider: 'slack',
    category: 'read',
    description: 'Reads recent messages from an authorized Slack channel',
    inputSchema: {
      type: 'object',
      properties: {
        channelId: { type: 'string' },
      },
      required: ['channelId'],
    },
    timeoutMs: 8000,
    handler: async (args) => {
      const messages = await SlackAdapter.readChannelMessages({
        channelId: args.channelId,
      });
      return { messages };
    },
  });

  // 4. Trello Read Board (strictly read-only)
  MCPToolRegistry.registerTool({
    name: 'trello_read_board',
    provider: 'trello',
    category: 'read',
    description: 'Reads active cards, lists, and verified members on configured Trello board',
    inputSchema: {
      type: 'object',
      properties: {
        boardId: { type: 'string' },
      },
      required: ['boardId'],
    },
    timeoutMs: 8000,
    handler: async (args) => {
      return TrelloAdapter.readBoard({
        boardId: args.boardId,
      });
    },
  });

  // 5. Trello Create Card (strictly gated write tool)
  MCPToolRegistry.registerTool({
    name: 'trello_create_card',
    provider: 'trello',
    category: 'write',
    description: 'Creates a Trello card and assigns members after human approval',
    inputSchema: {
      type: 'object',
      properties: {
        listId: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        idempotencyKey: { type: 'string' },
        assigneeMemberId: { type: 'string' },
      },
      required: ['listId', 'title', 'idempotencyKey'],
    },
    timeoutMs: 12000,
    handler: async (args) => {
      return { id: 'mock-card-id', shortUrl: 'https://trello.com/c/mock' };
    },
  });

  // 6. Telegram Send Message (write notification)
  MCPToolRegistry.registerTool({
    name: 'telegram_send_message',
    provider: 'telegram',
    category: 'write',
    description: 'Delivers markdown summaries, proposals, or alerts to authorized Telegram chat',
    inputSchema: {
      type: 'object',
      properties: {
        chatId: { type: 'string' },
        text: { type: 'string' },
        parseMode: { type: 'string', default: 'MarkdownV2' },
      },
      required: ['chatId', 'text'],
    },
    timeoutMs: 10000,
    handler: async (args) => {
      return { messageId: 12345 };
    },
  });
}

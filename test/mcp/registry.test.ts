import { describe, it, expect, beforeEach } from "vitest";
import { MCPToolRegistry, initializeStandardMCPTools } from "@/mcp/registry";

describe("Milestone 1 MCP Tool Registry and Permission Gate", () => {
  beforeEach(() => {
    MCPToolRegistry.clear();
    initializeStandardMCPTools();
  });

  it("initializes and registers all 6 standardized MCP tools", () => {
    const tools = MCPToolRegistry.listTools();
    expect(tools.length).toBe(6);

    const names = tools.map((t) => t.name);
    expect(names).toContain("gmail_search_read");
    expect(names).toContain("calendar_get_today");
    expect(names).toContain("slack_read_channel");
    expect(names).toContain("trello_read_board");
    expect(names).toContain("trello_create_card");
    expect(names).toContain("telegram_send_message");
  });

  it("T-024, T-025, T-026: verifies read tools are categorized as read-only with no write capabilities", () => {
    const gmailTool = MCPToolRegistry.getTool("gmail_search_read");
    const calendarTool = MCPToolRegistry.getTool("calendar_get_today");
    const slackTool = MCPToolRegistry.getTool("slack_read_channel");
    const trelloReadTool = MCPToolRegistry.getTool("trello_read_board");

    expect(gmailTool?.category).toBe("read");
    expect(calendarTool?.category).toBe("read");
    expect(slackTool?.category).toBe("read");
    expect(trelloReadTool?.category).toBe("read");
  });

  it("allows autonomous agent to execute read tools", async () => {
    const res = await MCPToolRegistry.executeTool({
      tool: "gmail_search_read",
      arguments: { query: "important" },
      callerType: "agent",
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
  });

  it("blocks autonomous agent from directly invoking write tools (trello_create_card)", async () => {
    const res = await MCPToolRegistry.executeTool({
      tool: "trello_create_card",
      arguments: { listId: "list-1", title: "Unauthorized task", idempotencyKey: "tok-1" },
      callerType: "agent", // Autonomous model attempting write
    });

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("UNAUTHORIZED_WRITE_ATTEMPT");
    expect(res.error).toContain("strictly blocked for callerType 'agent'");
  });

  it("allows verified human confirmation callback to execute write tool (trello_create_card)", async () => {
    const res = await MCPToolRegistry.executeTool({
      tool: "trello_create_card",
      arguments: { listId: "list-1", title: "Approved task", idempotencyKey: "tok-1" },
      callerType: "human_confirmation", // Explicit human confirmation
    });

    expect(res.success).toBe(true);
    expect(res.data?.id).toBe("mock-card-id");
  });

  it("returns TOOL_NOT_FOUND error for non-existent tools", async () => {
    const res = await MCPToolRegistry.executeTool({
      tool: "non_existent_tool",
      arguments: {},
      callerType: "agent",
    });

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("TOOL_NOT_FOUND");
  });
});

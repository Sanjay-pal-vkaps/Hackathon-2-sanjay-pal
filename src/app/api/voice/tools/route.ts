import { NextRequest, NextResponse } from "next/server";
import { VoiceToolBridge } from "@/voice/voice-tool-bridge";
import { initializeStandardMCPTools } from "@/mcp/registry";

import crypto from "crypto";

// Ensure MCP registry tools are initialized
initializeStandardMCPTools();

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.ELEVENLABS_WEBHOOK_SECRET;

    // Enforce webhook authentication when secret is configured
    if (webhookSecret) {
      const authHeader = req.headers.get("authorization");
      const xVoiceToken = req.headers.get("x-voice-token") || req.headers.get("x-webhook-secret");
      const bearerToken = authHeader ? authHeader.replace(/^Bearer\s+/i, "").trim() : null;
      const incomingToken = bearerToken || xVoiceToken;

      if (!incomingToken) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Missing webhook secret token" },
          { status: 401 }
        );
      }

      const tokenBuf = Buffer.from(incomingToken);
      const secretBuf = Buffer.from(webhookSecret);

      if (tokenBuf.length !== secretBuf.length || !crypto.timingSafeEqual(tokenBuf, secretBuf)) {
        return NextResponse.json(
          { success: false, error: "Unauthorized: Invalid webhook secret token" },
          { status: 401 }
        );
      }
    }

    const body = await req.json().catch(() => null);

    if (!body || !body.tool_name) {
      return NextResponse.json(
        { success: false, error: "Invalid payload: 'tool_name' is required" },
        { status: 400 }
      );
    }

    const { tool_name, parameters = {} } = body;
    const authHeader = req.headers.get("authorization") || req.headers.get("x-voice-token");
    const userId = authHeader ? "verified-user" : "voice-agent-caller";

    const outcome = await VoiceToolBridge.handleToolCall({
      tool_name,
      parameters,
      userId,
    });

    return NextResponse.json({
      success: outcome.success,
      spoken_response: outcome.spokenResponse,
      result: outcome.result,
      action_required: outcome.actionRequired,
      error: outcome.error,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Voice tool execution error" },
      { status: 500 }
    );
  }
}

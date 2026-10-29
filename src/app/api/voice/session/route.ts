import { NextRequest, NextResponse } from "next/server";
import { VoiceSessionService } from "@/voice/voice-session";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    let userId = "authenticated-user";

    // Basic Bearer token or cookie validation
    if (!authHeader && !process.env.TEST_ALLOW_ANON) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization header" },
        { status: 401 }
      );
    }

    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      userId = `user-${token.substring(0, 8)}`;
    }

    const body = await req.json().catch(() => ({}));
    const agentId = body.agentId || process.env.ELEVENLABS_AGENT_ID;

    const result = await VoiceSessionService.createSession({
      userId,
      agentId,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.statusCode || 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signedUrl: result.signedUrl,
      agentId: result.agentId,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to create voice session" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}

import { NextRequest, NextResponse } from "next/server";
import { verifySlackSignature } from "@/security/middleware";
import { SlackEventParser } from "@/workflow/slack-parser";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: any = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    // Handle Slack app url_verification challenge
    if (body.type === "url_verification") {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Verify Slack HMAC Signature
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (signingSecret) {
      const signatureHeader = req.headers.get("x-slack-signature");
      const timestampHeader = req.headers.get("x-slack-request-timestamp");

      const auth = verifySlackSignature({
        signatureHeader,
        timestampHeader,
        rawBody,
        signingSecret,
      });

      if (!auth.authorized) {
        return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.statusCode });
      }
    }

    // Process event callback
    if (body.type === "event_callback" && body.event) {
      const event = body.event;
      if (event.type === "message" && !event.subtype) {
        const authorizedChannels = (process.env.SLACK_AUTHORIZED_CHANNELS || "").split(",").map((s) => s.trim()).filter(Boolean);
        const isAuthorized = authorizedChannels.length === 0 || authorizedChannels.includes(event.channel);

        if (isAuthorized) {
          const parsed = SlackEventParser.parseEvent(event);
          return NextResponse.json({ ok: true, parsed: true, clues: parsed });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

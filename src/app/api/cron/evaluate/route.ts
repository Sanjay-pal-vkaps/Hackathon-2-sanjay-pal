import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/security/middleware";
import { ScheduleEvaluator } from "@/scheduler/evaluator";

async function handleCronRequest(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const expectedSecret = process.env.CRON_SECRET;

    // Verify cron authorization header if CRON_SECRET is configured
    if (expectedSecret) {
      const auth = verifyCronSecret({
        authorizationHeader: authHeader,
        expectedCronSecret: expectedSecret,
      });

      if (!auth.authorized) {
        return NextResponse.json(
          { success: false, error: auth.reason || "Unauthorized" },
          { status: auth.statusCode }
        );
      }
    }

    // Prepare telegram sender if credentials exist
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    let telegramSender: ((text: string) => Promise<boolean>) | undefined = undefined;
    if (botToken && chatId && !botToken.startsWith("mock_")) {
      telegramSender = async (text: string) => {
        try {
          const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text,
              parse_mode: "HTML",
            }),
          });
          return res.ok;
        } catch {
          return false;
        }
      };
    }

    const result = await ScheduleEvaluator.evaluateSchedule({
      telegramSender,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to evaluate schedule" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleCronRequest(req);
}

export async function POST(req: NextRequest) {
  return handleCronRequest(req);
}

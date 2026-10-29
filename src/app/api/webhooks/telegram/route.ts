import { NextRequest, NextResponse } from "next/server";
import { verifyTelegramWebhook } from "@/security/middleware";
import { ApprovalExecutor } from "@/trello/approval-executor";
import { VoiceToolBridge } from "@/voice/voice-tool-bridge";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ ok: false, error: "Missing payload" }, { status: 400 });
    }

    const secretTokenHeader = req.headers.get("x-telegram-bot-api-secret-token");
    const expectedSecretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;
    const allowedUserIds = (process.env.TELEGRAM_ALLOWED_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);

    const senderChatId = rawBody.message?.chat?.id || rawBody.callback_query?.message?.chat?.id;
    const senderUserId = rawBody.message?.from?.id || rawBody.callback_query?.from?.id;

    // 1. Verify Telegram Security Middleware
    if (expectedSecretToken) {
      const auth = verifyTelegramWebhook({
        secretTokenHeader,
        expectedSecretToken,
        senderChatId,
        senderUserId,
        allowedChatId,
        allowedUserIds,
      });

      if (!auth.authorized) {
        return NextResponse.json({ ok: false, error: auth.reason }, { status: auth.statusCode });
      }
    }

    // 2. Handle Inline Button Callback Queries (Approvals and Cancellations)
    if (rawBody.callback_query) {
      const callbackQuery = rawBody.callback_query;
      const data: string = callbackQuery.data || "";
      const callbackId = callbackQuery.id;

      let responseText = "Action processed.";

      if (data.startsWith("a:")) {
        const token = data.substring(2);
        // Find proposal across stores
        let proposal = Array.from([
          VoiceToolBridge.getProposal(`prop-voice-${token}`),
          // fallback lookup by approval token
        ]).find(p => p && p.approvalToken === token);

        if (!proposal) {
          // Check any proposal matching token
          const allVoiceProposals = (VoiceToolBridge as any).proposals;
          if (allVoiceProposals instanceof Map) {
            for (const p of allVoiceProposals.values()) {
              if (p.approvalToken === token) {
                proposal = p;
                break;
              }
            }
          }
        }

        if (proposal) {
          const apiKey = process.env.TRELLO_API_KEY;
          const apiToken = process.env.TRELLO_API_TOKEN;

          const trelloClient = {
            createCard: async (p: { listId: string; name: string; desc: string }) => {
              const url = `https://api.trello.com/1/cards?idList=${p.listId}&name=${encodeURIComponent(
                p.name
              )}&desc=${encodeURIComponent(p.desc)}&key=${apiKey}&token=${apiToken}`;
              const res = await fetch(url, { method: "POST" });
              if (!res.ok) throw new Error(`Trello API failed with ${res.status}`);
              const data = await res.json();
              return { id: data.id, url: data.url, shortUrl: data.shortUrl };
            },
            assignMember: async (cId: string, mId: string) => {
              const url = `https://api.trello.com/1/cards/${cId}/idMembers?value=${mId}&key=${apiKey}&token=${apiToken}`;
              const res = await fetch(url, { method: "POST" });
              return res.ok;
            },
            getCardsInList: async (lId: string) => {
              const url = `https://api.trello.com/1/lists/${lId}/cards?key=${apiKey}&token=${apiToken}`;
              const res = await fetch(url);
              if (!res.ok) return [];
              return res.json();
            },
          };

          const outcome = await ApprovalExecutor.executeApproval(proposal, trelloClient);
          responseText = outcome.userNotice;
        } else {
          responseText = "⚠️ Proposal not found or already expired.";
        }
      } else if (data.startsWith("c:")) {
        const token = data.substring(2);
        let proposal: any = undefined;
        const allVoiceProposals = (VoiceToolBridge as any).proposals;
        if (allVoiceProposals instanceof Map) {
          for (const p of allVoiceProposals.values()) {
            if (p.approvalToken === token) {
              proposal = p;
              break;
            }
          }
        }

        if (proposal) {
          const outcome = ApprovalExecutor.handleCancellation(proposal);
          responseText = outcome.userNotice;
        } else {
          responseText = "🚫 Cancelled.";
        }
      }

      // Answer callback query if bot token exists
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken && !botToken.startsWith("mock_")) {
        await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callback_query_id: callbackId,
            text: responseText.substring(0, 190),
          }),
        }).catch(() => {});
      }

      return NextResponse.json({ ok: true, notice: responseText });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

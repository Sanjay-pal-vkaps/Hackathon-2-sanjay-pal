# Product Decisions and Decision Log

Status: Updated MVP scope, architecture, and implementation decisions confirmed.

## Confirmed
| ID | Decision | Notes |
|---|---|---|
| D-001 | Text/Webhook MVP + Staged Voice | Core MVP implements text, webhooks, and Telegram orchestration (Milestones 1–6). Voice (ElevenLabs Conversational AI) is retained in architecture and data contracts, formally staged as Milestone 7 (Phase 2) after core MVP sign-off. |
| D-002 | Five integrations | Gmail, Google Calendar, Slack, Trello, Telegram. |
| D-003 | Dynamic 9 AM Daily summary | Evaluates `DAILY_SUMMARY_TIME` and `APP_TIMEZONE` dynamically. Evaluator pattern prevents duplicate runs via `daily-summary:YYYY-MM-DD`. |
| D-004 | Slack-to-task workflow | Slack message → Gmail email search (interactive picker if multiple) → task/assignee extraction → Telegram clarification (if ambiguous) → explicit approval → idempotent Trello create/assign → Telegram result. |
| D-005 | Telegram notifications and approvals | Telegram is the primary notification, clarification, and confirmation channel. Bot token and webhook secret stay server-side. |
| D-006 | Master agent | Routes requests, gathers evidence, and proposes bounded actions with prompt injection isolation boundaries. |
| D-007 | Centralized MCP Gateway | Separate container/host exposing standardized MCP tool definitions (`gmail_search_read`, `calendar_get_today`, `slack_read_channel`, `trello_read_board`, `trello_create_card`, `telegram_send_message`) with native webhook intake. |
| D-008 | Web stack | Next.js with TypeScript and Node.js backend endpoints. |
| D-009 | Data/auth | PostgreSQL (via Supabase or local instance) for scheduled runs, proposals, clarification sessions, and audit events. |
| D-010 | Conversation context | Short-term workflow state only; permanent memory out of scope. |
| D-011 | Gmail | Strictly read-only (`gmail.readonly`). Untrusted content boundary parsing. |
| D-012 | Google Calendar | Strictly read-only (`calendar.readonly`). Today's confirmed meetings in `APP_TIMEZONE`. |
| D-013 | Slack | Read-only in authorized channels (`channels:history`, `channels:read`). Webhook verified via HMAC-SHA256. |
| D-014 | Trello write gating | Strictly confirmation-gated write (`POST /1/cards`). LLM cannot invoke writes directly; only user callback execution can. |
| D-015 | Telegram Security & 64-byte callbacks | Webhook verified with `X-Telegram-Bot-Api-Secret-Token`. Chat/User allowlists enforced. Callbacks use compact tokens (`a:<token>`, `c:<token>`, `e:<token>:<idx>`, `m:<token>:<idx>`) strictly <= 64 bytes. |
| D-016 | Email Matching Rules | 0 matches notify user; 1 match auto-proceeds; >1 matches trigger an interactive Telegram picker. No guessing. |
| D-017 | Attachment Policy | Allowed: `.txt`, `.md`, `.csv`, `.pdf` (text extraction only). Cap: 5 MB per file, 200 KB text payload. Disallow active code/macros. |
| D-018 | Message Length Limit | Automatic chunking/splitting for Telegram messages exceeding 4096 characters, maintaining valid MarkdownV2 syntax. |
| D-019 | Conservative Trello Timeout Recovery | Embeds idempotency slug into card description. On timeout/5xx, queries target list to verify card creation before retrying. If outcome is uncertain or list query fails, do not automatically retry; record uncertain status and alert user via Telegram. Reports card creation and member assignment separately. |
| D-020 | Summary Data Selection & Exact Gmail Lookback | Calendar: today's confirmed events in `APP_TIMEZONE`. Trello: cards due today or overdue. Gmail: unread/important emails matching `after:<epoch_timestamp>` (24 hours prior) plus client-side `internalDate` check to ensure an exact rolling 24-hour window (not coarse `after:YYYY/MM/DD`). Slack: last 24h mentions/urgent keywords in authorized channels. |
| D-021 | Xero | Out of scope. |

## Dynamic Scheduling Configuration
- Local worker daemon reads `.env` on startup/reload.
- Serverless environments (e.g. Vercel) require a project redeployment for dashboard environment variable updates to reach serverless lambda contexts.
- Decouple static cron expressions from schedule changes: a frequent 5-minute evaluator (`POST /api/jobs/evaluate-schedule` with `CRON_SECRET`) checks `DAILY_SUMMARY_TIME` and `APP_TIMEZONE` against local wall-clock time with a 15-minute catch-up window.
- Atomic database lock on `daily-summary:YYYY-MM-DD` (where `YYYY-MM-DD` is the calendar date in `APP_TIMEZONE`) guarantees exactly one execution per local calendar day.

## Non-negotiable MVP Policy
Never create or assign a Trello task until a user-approved proposal is confirmed through an authorized Telegram callback. If the email, task details, or assignee is ambiguous, ask the user. Never claim success without Trello provider confirmation.

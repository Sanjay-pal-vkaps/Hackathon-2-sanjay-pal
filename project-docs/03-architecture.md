# Technical Architecture

## Approved Direction
- Frontend & API: Next.js backend endpoints (Vercel proposed).
- Identity & Data: PostgreSQL (via Supabase or local instance).
- Voice: ElevenLabs Conversational AI retained in architecture, formally staged as Milestone 7 (Post-MVP Phase 2) after core MVP text/webhook sign-off.
- Backend Orchestration: Trusted orchestration, security policy, evaluator entrypoints, Telegram webhook verification, and confirmation validation.
- Tool Isolation Host: Centralized MCP Gateway container hosting standardized MCP tools (`gmail_search_read`, `calendar_get_today`, `slack_read_channel`, `trello_read_board`, `trello_create_card`, `telegram_send_message`).
- Integration Approach: Hybrid MCP Gateway + native webhook intake adapters.
- Xero: Out of scope.

## Request and Event Paths
- Interactive Slack Workflow: Slack webhook adapter (HMAC verified) → backend orchestration → MCP Gateway `gmail_search_read` → interactive Telegram clarification (if ambiguous) → task proposal → Telegram approval callback (compact <64 byte token) → backend validation → MCP Gateway `trello_create_card` (with timeout reconciliation) → Telegram result.
- Daily Summary: Durable evaluator called on regular cron ping with `CRON_SECRET` → evaluates wall-clock time in `APP_TIMEZONE` against `DAILY_SUMMARY_TIME` → checks run lock (`daily-summary:YYYY-MM-DD`) → reads Gmail/Calendar/Slack/Trello via MCP tools → chunks messages >4096 characters → Telegram delivery.

## Key Subsystems
### 1. Scheduler and Job Evaluator
- Distinguish local vs. production environment variables:
  - Local worker daemon reads `.env` on process startup.
  - Serverless production (e.g. Vercel) requires a redeploy for environment changes to reach lambdas, while static cron schedules in `vercel.json` are fixed at build time.
- To make schedule timing configurable without static cron redeployments, a frequent runner calls `POST /api/jobs/evaluate-schedule`.
- Run idempotency: `scheduled_job_runs` table enforces an atomic lock on `daily-summary:YYYY-MM-DD` so that exactly one summary is delivered per calendar day.

### 2. Centralized MCP Gateway & Tool Registry
- Central container/service exposing JSON-RPC / MCP tools.
- Each tool declares provider, read/write classification, input schema, timeout, and idempotency behavior.
- Write tools (`trello_create_card`) are physically barred from invocation by the LLM master agent; only the authorized human confirmation callback can invoke write tools.

### 3. Telegram Bot Adapter & 64-Byte Callback Limit
- Validates `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`.
- Restricts updates to `TELEGRAM_CHAT_ID` and `TELEGRAM_ALLOWED_USER_IDS`.
- Enforces Telegram's strict **64-byte callback_data limit**:
  - Uses compact opaque tokens (e.g., `a:k9X2mQ1z`, `c:k9X2mQ1z`, `e:p7R1yL:1`, `m:p7R1yL:2`).
  - Maps tokens server-side to `action_proposals` and `clarification_sessions`.
- Message chunking utility safely splits messages >4096 characters without breaking MarkdownV2 formatting.

### 4. Idempotent Trello Writes & Timeout Reconciliation
- Embeds unique idempotency slug (`[idempotency_key: <token>]`) into card description.
- On network timeout or 5xx error, queries `GET /1/lists/{id}/cards` to verify whether the card was created before retrying.
- Card creation and member assignment are executed and reported separately (e.g. card created, member assignment failed).

## Action State Machine & Crash Recovery
`received → retrieving_sources → clarification_needed (optional) → proposal_ready → awaiting_confirmation → executing → succeeded | failed | partial | uncertain`
- Proposal transitions atomically (`pending` -> `executing`) to block concurrent double-clicks and replayed callbacks.
- State transitions are strictly unidirectional:
  - `pending` -> `executing` -> `succeeded` | `failed` | `uncertain`
  - `pending` -> `cancelled` | `expired`
- Terminal states (`succeeded`, `failed`, `cancelled`, `expired`) cannot be re-executed.
- An `uncertain` state triggers user escalation; it cannot transition back to `executing` automatically.
- Crash recovery: stale `executing` locks (>5 min) are reconciled against provider evidence or marked `uncertain` without blind re-execution.

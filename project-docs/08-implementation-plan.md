# Antigravity Implementation Plan

Status: Refined milestone plan reflecting dynamic scheduling, centralized MCP Gateway, full clarification workflows, webhook security, attachment constraints, and strict approval gating.

## Phase 0 — Audit & Planning (Complete)
- Audited repository and documentation; identified gaps and clarified ambiguous items.
- Revised `implementation_plan.md` and updated all relevant `project-docs/` specifications.
- Awaiting owner sign-off before initiating implementation.

## Milestone 1 — Project Foundation, Security Controls & MCP Tool Registry
- Scaffold Next.js / TypeScript project with Vitest test runner.
- Create database migrations for `scheduled_job_runs`, `action_proposals`, `clarification_sessions`, `action_executions`, and `audit_events`.
  - Schema constraint for `action_proposals.status`: CHECK (`status` IN ('pending', 'executing', 'succeeded', 'failed', 'uncertain', 'cancelled', 'expired')).
  - Schema constraint for `action_executions.result_status`: CHECK (`result_status` IN ('succeeded', 'failed', 'uncertain', 'partial')).
- Implement security middlewares:
  - Telegram webhook secret verification (`X-Telegram-Bot-Api-Secret-Token`).
  - Telegram chat/user allowlists (`TELEGRAM_CHAT_ID`, `TELEGRAM_ALLOWED_USER_IDS`).
  - Slack HMAC-SHA256 signature verifier (`X-Slack-Signature`).
  - Cron secret authorization (`Authorization: Bearer ${CRON_SECRET}`).
- Centralized MCP Gateway tool definitions and client connection layer.
- Implement atomic proposal state machine (`pending` -> `executing` -> `succeeded`/`failed`/`uncertain`) with duplicate approval gating and crash recovery.
- **Exit Criteria**: Unauthorized webhooks return 401/403; concurrent approval replays are blocked; `uncertain` status supported in database; MCP tool registry initializes cleanly.

## Milestone 2 — Read Adapters, Attachment Parsers & Normalization
- Implement strictly read-only adapters hosted/registered via MCP:
  - `GmailAdapter` (`gmail_search_read`):
    - Query messages, fetch message thread metadata, decode bodies.
    - **Pagination, Cap Handling & Accurate Rolling Lookback Filter**:
      - Avoid coarse date-based queries like `after:YYYY/MM/DD` (which resolves to midnight UTC and is not a true rolling 24-hour window).
      - Compute epoch timestamp `lookback_epoch = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000)` and query Gmail using `after:<lookback_epoch>`.
      - **Pagination Handling & 100-Message Cap Notification**:
        - Iterate pages using `nextPageToken` up to a maximum cap of 100 messages.
        - **Truncation Notice**: If the 100-message cap is reached and additional messages remain (`nextPageToken` is still present), the adapter flags the result set with `is_truncated: true` and a total count indicator. The daily summary and Slack-to-Gmail matching flows explicitly surface a visible user notice (e.g. `⚠️ Inbox volume exceeded 100 recent emails; results represent the 100 most recent items within the lookback window`) rather than silently presenting truncated output as complete.
      - **Exact Client-Side Timestamp Filtering**: Inspect each returned message's `internalDate` (milliseconds since epoch) to strictly enforce `internalDate >= (Date.now() - 24 * 3600 * 1000)`, discarding messages outside the rolling 24-hour window before processing.
  - `CalendarAdapter` (`calendar_get_today`): retrieve today's meetings localized to `APP_TIMEZONE`.
  - `SlackAdapter` (`slack_read_channel`): retrieve channel messages in authorized channels within rolling lookback window.
  - `TrelloAdapter` (`trello_read_board`): fetch board lists and active members.
- Implement `AttachmentParser`:
  - Allowed: `.txt`, `.md`, `.csv`, `.pdf` (text-only extraction).
  - Max size: 5 MB per file; max 200 KB text payload passed to LLM context.
  - Disallowed files skipped with warning notes.
- **Exit Criteria**: Read-only adapters contain zero write methods; attachment limits enforced safely; Gmail pagination correctly consumes all pages up to cap; cap exhaustion surfaces explicit truncation warning.

## Milestone 3 — Dynamic Daily Summary Engine & 5-Minute Evaluator
- Implement dynamic `ScheduleEvaluator` supporting environment-driven configuration (`DAILY_SUMMARY_TIME`, `APP_TIMEZONE`).
- **Production Schedule Changes & Deployment Behavior**:
  - In local development / persistent worker daemon environments, changes to `.env` take effect upon process reload/restart.
  - In serverless production environments (e.g., Vercel / AWS Lambda), environment variables are injected at deployment time and frozen per lambda lifecycle. Updating `DAILY_SUMMARY_TIME` or `APP_TIMEZONE` in production dashboard settings **honestly requires triggering a project redeployment** so serverless execution contexts receive the new configuration.
- **5-Minute Evaluator, Window Recovery & Stale Lock Protection**:
  - A cron runner triggers `POST /api/jobs/evaluate-schedule` (protected by `CRON_SECRET`) every 5 minutes.
  - Evaluator converts current UTC time to `APP_TIMEZONE` wall-clock time (`HH:mm`) and local calendar date (`YYYY-MM-DD`).
  - **Due-Time & Missed-Window Safe Recovery**:
    - Normal window: trigger if current local wall-clock time is at or past `DAILY_SUMMARY_TIME` and within a 15-minute catch-up window (`[scheduled_time, scheduled_time + 15m)`).
    - If the entire 15-minute window was missed due to extended downtime or platform outage, safe recovery permits triggering during subsequent runs on that same calendar day **only if** no completed run exists for `daily-summary:YYYY-MM-DD`.
  - **Atomic Locking & Stale Lock Eviction (15-Minute Threshold)**:
    - Acquires an atomic execution lock in `scheduled_job_runs` keyed by `daily-summary:YYYY-MM-DD`.
    - If a run exists with status `completed`, evaluation cleanly terminates immediately.
    - If a run exists with status `executing`:
      - If `started_at` is older than 15 minutes (indicating a stale scheduler crash or severe timeout), the stale lock is expired to status `failed` with error `STALE_LOCK_TIMEOUT`.
      - Safe recovery can then re-acquire the lock for a clean evaluation cycle on that calendar date.
    - If previous run on the same local date marked `failed`: allows at most 1 safe retry attempt.
  - **Telegram Delivery Recovery & Delivery Guarantee Limitations**:
    - **Minimizing Duplicate Messages**: Before retrying delivery after a network error or timeout, the system inspects `scheduled_job_runs.telegram_delivery_status`. If marked `sent` or `confirmed`, no second message is sent.
    - **Inherent Limitation**: Because the Telegram Bot API lacks native idempotency keys on `sendMessage`, an unacknowledged HTTP timeout during transmission means the message may have reached Telegram servers. While local locks prevent multiple application dispatches, **mathematically strict exactly-once delivery cannot be guaranteed across network partitions without provider-supported idempotency keys**. The engine operates on an at-most-once application dispatch model with bounded at-most-1 recovery retry.
- Multi-provider aggregator querying Gmail (with pagination, truncation flags, and exact `internalDate` filter), Calendar, Slack, and Trello in parallel using defined data-selection rules.
- Partial failure handler: failed providers marked as `[Unavailable]` while remaining data renders.
- `TelegramMessageFormatter`: markdown formatting with evidence links; automatic chunking for messages >4096 characters preserving MarkdownV2 syntax.
- **Exit Criteria**: Summary executes reliably within the 5-minute evaluator window; stale scheduler locks safely evicted at 15m threshold; delivery recovery minimizes duplicates while documenting provider idempotency limits; messages >4096 characters chunk cleanly.

## Milestone 4 — Slack-to-Gmail Matching & Telegram Clarification Flow
- `SlackEventParser`: extracts search clues from authorized channel messages.
- `GmailMatcher`: handles 0 matches (notify user), 1 match (auto-proceed), and >1 matches (interactive Telegram selection menu).
- Enforce Telegram 64-byte callback limit using short opaque tokens (`e:<token>:<idx>`, `m:<token>:<idx>`).
- `TaskExtractor`: LLM extraction with strict JSON schema and `<untrusted_source>` isolation tags.
- `AssigneeResolver`: matches candidate against Trello members; triggers Telegram member picker if ambiguous or unassigned.
- **Exit Criteria**: Multi-email matches and ambiguous assignees prompt user in Telegram; callback data stays <64 bytes; no card proposal until ambiguities are resolved.

## Milestone 5 — Idempotent Trello Write Gating & Conservative Timeout Recovery
- `ProposalPresenter`: renders finalized task proposal with details, links, and inline `[✅ Approve & Create Card]` (`a:<token>`) / `[❌ Cancel]` (`c:<token>`).
- `ApprovalExecutor`:
  - Validates unexpired proposal token.
  - Locks state from `pending` -> `executing` atomically.
  - Embeds unique idempotency slug (`[idempotency_key: <token>]`) into card description.
  - Calls Trello `POST /1/cards`.
  - **Strictly Conservative Timeout Recovery & Card Reconciliation**:
    - If Trello write encounters a network timeout, socket disconnect, or 5xx response where card creation status is uncertain, **never blindly retry card creation**.
    - Reconcile target list cards via Trello `GET /1/lists/{list_id}/cards`.
    - **Do NOT retry merely because the idempotency marker is absent in a single list query**:
      - Trello list queries are subject to eventual consistency and pagination limits. Absence in one response does not prove non-creation.
      - Retry card creation **only when non-creation can be established reliably** (e.g. verified board action audit log confirms zero card creation events for the token within the time window, or conclusive empty-list verification).
      - If non-creation cannot be established with 100% certainty, or if the reconciliation query itself fails/times out: **do not automatically retry**. Transition proposal status to `uncertain`, record telemetry in `action_executions` and `audit_events`, and notify the user via Telegram with manual verification instructions and card search guidance.
  - **Action-Proposal Crash Recovery (5-Minute Threshold)**:
    - Independent from scheduler job locking, interactive proposals stuck in `executing` beyond a **5-minute threshold** are evaluated by crash recovery.
    - If card existence with the token slug is verified, the proposal transitions to `succeeded`.
    - If status remains unresolved, the proposal transitions to `uncertain` and escalates to the user; it is never re-executed automatically.
  - Reports card creation and member assignment outcomes separately (honest partial failure reporting).
  - Updates Telegram message with verified card shortUrl.
- **Exit Criteria**: Zero Trello writes without explicit approval; duplicate clicks do not create duplicate cards; timeout recovery reconciles conservatively; no automatic retries when non-creation is uncertain; uncertain outcomes recorded and escalated to user; 5-minute proposal crash recovery separated from 15-minute scheduler lock eviction.

## Milestone 6 — Automated Verification Suite & Acceptance Alignment
- Complete automated test suite covering all **30 test scenarios (T-001 through T-030)** and critical E2E flows (E2E-1, E2E-2) defined in `07-test-plan-and-acceptance.md`:
  - Security & Webhooks (T-001 to T-003, T-027, T-029).
  - Provider Reads, Degradation & Attachment Handling (T-004, T-009, T-010, T-016, T-024 to T-026).
  - Slack-to-Gmail & Clarification Flows (T-005 to T-008, T-011, T-012, T-015).
  - Trello Gating, Concurrency & Safe Reconciliation (T-013, T-014, T-017, T-018, T-019, T-023).
  - Dynamic Scheduling, Timezones & Telegram Delivery (T-020, T-021, T-022, T-028, T-030).
- Timezone transition and DST boundary tests.
- Prompt injection regression tests.
- Token redaction verification in logs.
- **Exit Criteria**: 100% automated test pass rate across all 30 acceptance scenarios with test execution evidence.

## Milestone 7 (Phase 2 Post-MVP) — Voice Assistant Extension (ElevenLabs)
- **Scope Boundary**: Core MVP includes Telegram, text, and webhook workflows only. Voice assistant functionality is deferred to Phase 2.
- Implement ElevenLabs Conversational AI WebSocket bridge.
- Audio streaming session endpoints.
- Voice tool bridge executing tools through Centralized MCP Gateway.
- Confirmation-gate parity: voice cannot bypass Telegram/UI approval for Trello writes.
- **Exit Criteria**: Core MVP (Milestones 1–6) signed off and operating in production; owner explicitly approves Phase 2 voice rollout.

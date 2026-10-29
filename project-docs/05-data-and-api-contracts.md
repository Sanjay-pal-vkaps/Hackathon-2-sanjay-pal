# Data Model and API Contracts

## Core Entities
- `connected_accounts`: id, user_id, provider, provider_account_id, granted_scopes, status, secure_token_reference, timestamps.
- `telegram_destinations`: user_id, chat_id, authorized_sender_ids, status; enforce strict chat/user allowlists.
- `scheduled_job_runs`: id, job_type, scheduled_for, started_at, completed_at, status (`executing` | `completed` | `failed`), provider_statuses (JSON), telegram_delivery_status (`pending` | `sent` | `failed`), idempotency_key (`daily-summary:YYYY-MM-DD`).
- `source_evidence`: id, request_id/run_id, provider, item_id, title, URL, timestamp, extracted fields, is_truncated, and sanitized content boundaries.
- `clarification_sessions`: id, request_id, type (`email_picker` | `assignee_picker`), candidate_options (JSON), selected_option, status (`pending` | `resolved` | `expired`), expires_at, created_at.
- `action_proposals`: id, user_id, request_id, slack_source_id, gmail_source_id, trello_board_id, trello_list_id, task_title, task_description, due_date, assignee_member_id, status (`pending` | `executing` | `succeeded` | `failed` | `uncertain` | `cancelled` | `expired`), expires_at, created_at, executed_at.
- `action_executions`: proposal_id, trello_card_id, trello_card_url, assignment_status, result_status (`succeeded` | `failed` | `uncertain` | `partial`), safe_error_message, executed_at.
- `audit_events`: user_id, request_id/run_id, event_type, provider, outcome, safe_metadata, timestamp.

## Contract Principles & State Machine Consistency
- Unique request/run IDs and idempotency keys.
- Webhooks must pass signature/secret verification:
  - Telegram: Header `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`.
  - Slack: Header `X-Slack-Signature` matching HMAC-SHA256 signature.
  - Cron / Scheduler: Header `Authorization: Bearer ${CRON_SECRET}`.
- Model output cannot invoke write tools directly; human confirmation callback initiates write.
- **Valid State Machine Transitions for `action_proposals`**:
  - `pending` -> `executing` (atomic CAS lock on user approval callback)
  - `pending` -> `cancelled` (user cancellation callback)
  - `pending` -> `expired` (TTL elapsed > 24 hours without approval)
  - `executing` -> `succeeded` (Trello write and card URL confirmed)
  - `executing` -> `failed` (hard Trello API error / permission denied / verified non-creation)
  - `executing` -> `uncertain` (timeout / network disconnect / ambiguous reconciliation outcome)
- **Terminal States**: `succeeded`, `failed`, `cancelled`, and `expired` are immutable.
- **Duplicate Approval Handling**: Callbacks received on proposals already in `executing`, `succeeded`, `failed`, or `uncertain` return immediate rejection ("Proposal already processed or under review").
- **Separate Recovery Thresholds**:
  - **Action Proposals (5-Minute Threshold)**: Interactive proposals stuck in `executing` > 5 minutes are evaluated by crash recovery. If card existence with the token slug is verified, the proposal transitions to `succeeded`; otherwise it transitions to `uncertain` and escalates to the user without blind re-execution.
  - **Scheduled Job Runs (15-Minute Threshold)**: Scheduled runs stuck in `executing` > 15 minutes are expired to `failed` (`STALE_LOCK_TIMEOUT`), allowing at most one safe retry on that local calendar date.
- **Telegram Delivery Inherent Limitation**: Telegram Bot API lacks native idempotency keys on `sendMessage`. Delivery status checks minimize duplicates, but strict exactly-once delivery cannot be guaranteed across network partitions without provider-supported idempotency keys.
- Provider errors are normalized; no secrets or tokens in logs or Telegram output.
- Telegram messages exceeding 4096 characters are split into sequential messages while preserving MarkdownV2 tags.

## Suggested Backend Endpoints
- `POST /api/webhooks/slack` — Verified Slack event subscription entrypoint.
- `POST /api/webhooks/telegram` — Verified Telegram update entrypoint (handles `/start`, inline button clicks, email/assignee selections, and task approvals).
- `POST /api/jobs/evaluate-schedule` — Dynamic scheduler evaluator called minutely/frequently; triggers daily summary if wall-clock matches `DAILY_SUMMARY_TIME` in `APP_TIMEZONE`.
- `POST /api/jobs/daily-summary/run` — Protected manual/automated execution entrypoint for daily summary.
- `GET /api/integrations` — Connection statuses.
- `GET /api/health` — System status and scheduler configuration diagnostics.

## Error Categories
`AUTH_REQUIRED`, `UNAUTHORIZED_TELEGRAM_CHAT`, `INVALID_WEBHOOK_SECRET`, `INTEGRATION_NOT_CONNECTED`, `PERMISSION_DENIED`, `SOURCE_NOT_FOUND`, `EMAIL_AMBIGUOUS`, `ASSIGNEE_AMBIGUOUS`, `UNSUPPORTED_ATTACHMENT`, `ATTACHMENT_TOO_LARGE`, `PROVIDER_TIMEOUT`, `RATE_LIMITED`, `VALIDATION_FAILED`, `CONFIRMATION_REQUIRED`, `PROPOSAL_EXPIRED`, `PROPOSAL_ALREADY_PROCESSED`, `DUPLICATE_EVENT`, `ACTION_FAILED`, `PARTIAL_RESULT`, `TELEGRAM_DELIVERY_FAILED`, `SCHEDULE_FAILED`.

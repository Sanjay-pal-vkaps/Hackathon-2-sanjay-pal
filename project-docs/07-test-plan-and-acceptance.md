# Test Plan and Acceptance Criteria

## Critical End-to-End Tests

### E2E-1: Dynamic Daily Summary
1. Configure `DAILY_SUMMARY_TIME=09:00` and `APP_TIMEZONE=Asia/Kolkata` via environment variables.
2. Provide fixture data for Gmail, Calendar, Slack, and Trello (Gmail lookback verified with exact rolling 24h epoch timestamp filter).
3. Trigger 5-minute schedule evaluation within the due-time window (`[09:00, 09:15)`).
4. Verify one Telegram summary contains today's meetings, relevant tasks, important messages/emails, and source links.
5. Simulate one provider failure and verify the summary labels missing data without fabricating results.
6. Trigger the evaluator again on the same calendar day; verify local date lock (`daily-summary:YYYY-MM-DD`) prevents duplicate Telegram delivery.
7. Update `DAILY_SUMMARY_TIME=14:00` and `APP_TIMEZONE=America/New_York` (requiring restart locally or redeployment in serverless production); verify the evaluator recalculates and adapts correctly.

### E2E-2: Slack → Gmail → Clarification → Trello → Telegram
1. Deliver a valid, relevant Slack event from an authorized channel.
2. Simulate multiple matching Gmail emails; verify an interactive Telegram selection menu is sent and no task is proposed yet.
3. User selects email #2 via callback; verify task is extracted from email and supported attachments (<5 MB).
4. Simulate ambiguous assignee; verify Telegram prompts user to select a verified Trello board member or "Unassigned".
5. User selects assignee; verify finalized proposal card appears with full details and `[✅ Approve & Create Card]` / `[❌ Cancel]`.
6. Verify no Trello write occurs before explicit Telegram approval callback.
7. Allowlisted Telegram user confirms; verify one Trello card is created and assigned, and Telegram reports provider-confirmed card URL.
8. Simulate a rapid duplicate click or replayed callback; verify rejection with "Proposal already processed" and no duplicate card created.

## Comprehensive Test Matrix

| ID | Scenario | Expected Outcome |
|---|---|---|
| T-001 | Unauthenticated webhook request | Denied with HTTP 401 |
| T-002 | Invalid `X-Telegram-Bot-Api-Secret-Token` | Immediate HTTP 401 rejection; no processing |
| T-003 | Unauthorized Telegram chat or user ID | Rejected with HTTP 403; security audit event logged |
| T-004 | Disconnected provider in summary | Clear `[Unavailable]` label; no fabricated results |
| T-005 | Gmail search & pagination cap (100 messages) | Paginates up to 100 messages; exact internalDate filter applied; truncation warning shown if cap reached |
| T-006 | Multiple Gmail matches (>1 emails) | Interactive Telegram picker sent; no task proposed until selection |
| T-007 | Zero Gmail matches (0 emails) | Informational Telegram notice sent with search terms; prompt to clarify |
| T-008 | Ambiguous assignee | Interactive Telegram picker with real board members sent; no guessing |
| T-009 | Unsupported attachment format (.exe/.zip/.sh) | Attachment skipped safely with warning note in proposal |
| T-010 | Oversized attachment (>5 MB) | Skipped with size limit warning note; does not crash |
| T-011 | Prompt injection attempt in email/Slack | Treated as untrusted text; model cannot override policy or trigger writes |
| T-012 | User cancels proposal via Telegram | Proposal status set to `cancelled`; no Trello write |
| T-013 | Valid Telegram approval callback | One card created, assignee assigned, card link returned |
| T-014 | Double click / concurrent approval replay | Atomic lock allows only 1 write; second click returns 409 / user notice |
| T-015 | Slack webhook event retry (same `event_id`) | Deduplicated by idempotency key; processed only once |
| T-016 | Provider read timeout | Honest error / partial result; no crash |
| T-017 | Trello write timeout / uncertain creation | Marker reconciled conservatively; do not retry on single list absence; mark uncertain and escalate if non-creation unverified |
| T-018 | Trello card creation success + assignment failure | Partial failure reported to user with card link and assignment error |
| T-019 | Trello permission denied | Clear failure notification; no false success claim |
| T-020 | Dynamic schedule time/timezone change | Evaluator adapts on next cycle (after process reload locally or redeploy in production); no static code edits |
| T-021 | Scheduled run idempotency, stale lock (15m) & delivery retry | Missed-window recovery succeeds safely; stale lock evicted at 15m; Telegram retry checks delivery status to minimize duplicates |
| T-022 | Telegram message exceeding 4096 characters | Safely split into sequential messages; valid MarkdownV2 formatting preserved |
| T-023 | Expired proposal callback (>24h) | Rejected with "Proposal expired"; no write executed |
| T-024 | Attempted write to Gmail API | Hard rejected; adapter is strictly read-only |
| T-025 | Attempted write to Google Calendar API | Hard rejected; adapter is strictly read-only |
| T-026 | Attempted write to Slack API | Hard rejected; adapter is strictly read-only |
| T-027 | Secret token redaction | No tokens, secrets, or raw auth headers present in logs or error output |
| T-028 | Telegram API delivery failure | Recorded in database run status; flagged as operational error |
| T-029 | Slack message in unauthorized channel | Ignored silently; no Gmail query or proposal triggered |
| T-030 | DST transition and leap day handling | Correct local 09:00 AM calculation without time drift |

## Automated Verification Suite
- **Unit Tests**:
  - `test/unit/scheduler-config.test.ts`: Timezone calculations, dynamic env updates, 15m window catch-up, DST.
  - `test/unit/telegram-formatting.test.ts`: MarkdownV2 escaping and 4096-char chunking.
  - `test/unit/attachment-safety.test.ts`: Format allowlist, 5 MB file size limit, sanitized text extraction.
  - `test/unit/prompt-injection.test.ts`: System override phrases inside `<untrusted_source>` tags ignored.
  - `test/unit/gmail-pagination.test.ts`: Page token iteration, 100-message cap, `is_truncated` notice, exact `internalDate` filter.
- **Security Tests**:
  - `test/security/telegram-webhook.test.ts`: Secret token header enforcement, chat/user allowlists.
  - `test/security/duplicate-execution.test.ts`: Concurrent approval clicks, replayed callbacks, Slack `event_id` deduplication.
  - `test/security/read-only-enforcement.test.ts`: Verify absence of write methods on Gmail, Calendar, and Slack adapters.
- **Integration Tests**:
  - `test/integration/gmail-matching.test.ts`: 0, 1, and >1 email matching flows.
  - `test/integration/assignee-resolution.test.ts`: Exact match, ambiguous match, and unassigned choices.
  - `test/integration/trello-failure.test.ts`: Conservative reconciliation, list absence non-retry, 5-minute proposal crash recovery.
  - `test/integration/daily-summary.test.ts`: Multi-provider aggregation, 15m stale lock eviction, delivery status check, and idempotency.

## Release Gate
All 30 test scenarios must pass in automated CI/CD. Zero unconfirmed writes, zero unauthorized webhook executions, zero duplicate tasks, and complete secret redaction are strict mandatory release blockers.

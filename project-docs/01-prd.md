# Product Requirements Document

## 1. Product Summary
An AI agent that connects Gmail, Google Calendar, Slack, Trello, and Telegram. It sends a scheduled daily summary at a configurable time/timezone and handles an interactive Slack-to-Gmail-to-Trello task workflow, utilizing Telegram for interactive clarifications, notifications, and explicit user confirmation.

## 2. MVP Use Cases
### UC-1: Dynamic Daily Morning Summary
At the configured time (`DAILY_SUMMARY_TIME`, default `09:00`) in `APP_TIMEZONE` (default `Asia/Kolkata`), the agent reads authorized data from Gmail, Google Calendar, Slack, and Trello, then sends a structured summary to the configured Telegram chat. The schedule is dynamically evaluated to support environment changes without code edits. Include today's meetings, tasks/cards due or active today, important recent messages/emails, and key points. Each item includes source and link where available. If messages exceed Telegram's 4096-character limit, they are safely chunked. Label missing/failed integrations clearly and never fabricate missing data.

### UC-2: Slack message → Gmail → Clarification → Trello → Telegram
1. **Detection**: Detect a relevant message in an authorized Slack channel indicating an email or details were sent.
2. **Gmail Matching**: Search connected Gmail using context clues (sender, subject, keywords, timestamp).
   - If 0 matches: Notify user via Telegram that no email was found with search terms; prompt for clarification.
   - If 1 match: Proceed to extraction.
   - If >1 matches: Send an interactive Telegram selection message with inline buttons (`Select Email 1`, `Select Email 2`, etc.). Proceed only after explicit user selection.
3. **Safe Extraction**: Extract task title, description, due date, and candidate assignee from email body and supported attachments (`.txt`, `.md`, `.csv`, `.pdf` up to 5 MB). Treat all third-party content as untrusted data with strict prompt-injection isolation boundaries.
4. **Assignee Clarification**: Match candidate assignee against verified Trello board members. If missing, ambiguous, or unmatched, send an interactive Telegram clarification prompt listing real board members and an "Unassigned" option.
5. **Proposal Presentation**: Send finalized proposal card detailing Slack origin, Gmail evidence, task title, description, due date, target board/list, and verified assignee with `[✅ Approve & Create Card]` and `[❌ Cancel]` inline buttons.
6. **Execution Gate**: Create the Trello card and assign the verified member **only** after explicit approval callback from an allowlisted Telegram user.
7. **Result Notification**: Send a provider-confirmed success notification with the Trello card shortUrl, or report honest partial failure (e.g. card created, member assignment failed).

## 3. Goals
- Deliver a reliable cross-app summary every configured morning, dynamically respecting env updates.
- Automate Slack-to-email investigation and Trello task preparation with full interactive clarification.
- Strictly gate Trello writes behind explicit user approval.
- Enforce webhook authentication and chat/user allowlists on Telegram.
- Provide evidence links, clear partial failures, and complete audit trail.

## 4. Non-Goals
- Sending or modifying Gmail messages (strictly read-only).
- Posting to Slack or modifying Slack messages (strictly read-only).
- Creating or editing Google Calendar events (strictly read-only).
- Unrestricted Trello writes, card deletes, or board modifications.
- Voice UI / streaming audio (deferred beyond MVP).
- Permanent conversation memory, Xero, or multi-tenant billing.

## 5. Functional Requirements
| ID | Requirement | Acceptance Criteria |
|---|---|---|
| FR-001 | Authentication & Allowlist | Unauthenticated requests, non-matching Telegram webhook secrets, or untrusted Telegram chats/users cannot access data or trigger actions. |
| FR-002 | Connections | Securely manage read-only access for Gmail, Calendar, Slack and narrow write for Trello; Telegram bot destination strictly allowlisted. |
| FR-003 | Dynamic Daily Schedule | Scheduler dynamically evaluates `DAILY_SUMMARY_TIME` and `APP_TIMEZONE` (defaults: `09:00` and `Asia/Kolkata`); changes in `.env` take effect without code redeployments. |
| FR-004 | Daily Summary Content | Combines Gmail, Calendar, Slack, and Trello data with links, timestamps, and partial failure indicators. |
| FR-005 | Message Chunking | Formatted summaries or proposals exceeding 4096 characters are split across valid MarkdownV2 messages without formatting corruption. |
| FR-006 | Slack Event Ingestion | Authorized channel messages start workflow; HMAC signature verified; duplicate events deduplicated. |
| FR-007 | Gmail Multi-Match Resolution | Multiple matching emails present an interactive selection menu in Telegram; no guessing. |
| FR-008 | Attachment Handling | Supports `.txt`, `.md`, `.csv`, `.pdf` up to 5 MB; active scripts/macros rejected; text sanitized. |
| FR-009 | Assignee Clarification | Ambiguous or missing assignees trigger an interactive Telegram picker showing valid board members. |
| FR-010 | Final Task Proposal | Displays complete task details, source links, and assignee with explicit Approve and Cancel controls. |
| FR-011 | Approval Execution Gate | Trello write requires valid, unexpired, single-use confirmation from allowlisted Telegram user. |
| FR-012 | Trello Create/Assign | Creates card and assigns verified member; handles partial failure gracefully. |
| FR-013 | Duplicate Prevention | Deduplicates Slack events, daily summary runs, and proposal approval callbacks. |
| FR-014 | Audit Trail | Records schedule runs, source IDs, proposals, clarifications, callbacks, execution results, and errors without logging secrets. |
| FR-015 | Prompt-Injection Defense | External content is enclosed in `<untrusted_source>` tags; model policy prevents unauthorized tool actions. |

## 6. Daily Summary Content
- Calendar: Today's meetings, start/end times, and attendee summaries.
- Trello: Cards due today, overdue cards, and active cards on configured board/list.
- Gmail: Relevant unread/important recent emails within lookback window.
- Slack: Important recent messages from authorized channels within lookback window.
- Key points, follow-ups, and source links; clearly mark unavailable sources.

## 7. Quality and Success Measures
- Zero unconfirmed Trello writes in automated test suites and production.
- Zero duplicate task creations across network retries or callback double-clicks.
- 100% of multi-match emails and ambiguous assignees prompt interactive clarification.
- Changing `DAILY_SUMMARY_TIME` and `APP_TIMEZONE` in environment updates schedule dynamically.

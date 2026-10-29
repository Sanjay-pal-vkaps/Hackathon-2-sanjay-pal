# AI Multi-App Agent — Project Scope & Confirmation Checklist

## Purpose
Build an AI-powered personal/work assistant connecting Gmail, Google Calendar, Slack, Trello, and Telegram. It summarizes work and helps turn relevant Slack/email information into Trello tasks, but only creates a card after explicit user approval.

This is a confirmation document. Antigravity must compare it with the latest project documentation and report mismatches. It must not change code or specifications during this review.

## 1. Main Workflows

### A. Daily Summary
- Default schedule: 9:00 AM, `Asia/Kolkata`; configurable through environment settings.
- Collect today's Google Calendar meetings, relevant Trello due/overdue/active cards, relevant unread/important Gmail messages from the rolling previous 24 hours, and relevant recent Slack messages/mentions from authorized channels.
- Combine available data into a Telegram summary.
- If a provider fails, mark it unavailable while returning other available results where possible.
- If Gmail pagination reaches the 100-message cap while more results remain, set a truncation flag and visibly warn the user.
- Use local-date idempotency and bounded recovery. Telegram `sendMessage` has no native idempotency key, so strict exactly-once delivery cannot be guaranteed.

### B. Slack → Gmail → Trello Task Workflow
1. Detect a relevant message in an authorized Slack channel.
2. Extract search clues and search Gmail.
3. Read the matching email and inspect supported attachments:
   - `.txt`, `.md`, `.csv`, and text-extractable `.pdf`
   - Maximum 5 MB per file; maximum 200 KB attachment text passed to the LLM
   - Skip unsupported files with a warning.
4. Extract task details using structured AI output, including source-supported title, description, links, dates, and candidate assignee.
5. Clarify via Telegram:
   - No email match: notify user.
   - One match: continue.
   - Multiple matches: ask user to select the correct email.
   - Ambiguous/missing assignee: ask user to select a valid Trello member.
6. Send a finalized proposal to Telegram.
7. Create a Trello card only after explicit approval.
8. Assign the member separately and report card creation and assignment outcomes independently.
9. Return a card link only after creation is verified.

## 2. Integrations and Permissions

| Integration | Intended access |
|---|---|
| Gmail | Search/read email and message content |
| Google Calendar | Read today's events |
| Slack | Read messages only in authorized channels |
| Trello | Read board/lists/members; create and assign cards only after explicit approval |
| Telegram | Send summaries, clarification prompts, approval controls, and execution status |

Xero is outside the MVP. Voice is deferred to Phase 2; MVP workflows use Telegram/text and webhooks.

## 3. Architecture
- Next.js + TypeScript application.
- Centralized MCP Gateway and registered tool definitions.
- Native webhook/API endpoints for Slack and Telegram events, plus a scheduled evaluator.
- PostgreSQL/Supabase persistence for scheduled job runs, action proposals, clarification sessions, action executions, and audit events.
- Vitest automated tests.
- Keep provider adapters, orchestration, security controls, and persistence separated.

## 4. Security and Reliability
- Verify Telegram webhook secret token.
- Enforce Telegram chat/user allowlists.
- Verify Slack HMAC-SHA256 signatures and protect against replay.
- Protect cron endpoints with a bearer secret.
- Use least-privilege scopes and do not expose credentials in logs.
- Treat email bodies and attachments as untrusted data; they must not override system instructions or bypass approval/security controls.
- Use atomic proposal-state transitions to block duplicate/concurrent approvals.
- Persist retry counts and execution/audit state.
- For uncertain Trello creation outcomes, reconcile using the idempotency marker before further action.
- Do not retry just because one Trello list query cannot find the marker. If non-creation cannot be reliably established, set proposal status to `uncertain`, record it, and notify the user.
- Keep scheduled-summary recovery separate from action-proposal crash recovery.
- Scheduled jobs older than the documented 15-minute stale-lock threshold may transition to failed under the recovery policy. Proposals stuck in `executing` beyond 5 minutes must be reconciled; if card existence cannot be verified, set `uncertain` and alert the user.
- Telegram delivery retries must be bounded and based on persisted delivery state. Do not claim strict exactly-once delivery.

## 5. Milestones and Exit Criteria

### Milestone 1 — Foundation, Security, MCP Registry
Scaffold Next.js/TypeScript, configure Vitest, create initial database migrations, implement security middleware, and establish the centralized MCP tool registry.
**Exit:** Unauthorized requests are rejected, concurrent approval replay is blocked, and the registry initializes cleanly.

### Milestone 2 — Read Adapters and Attachment Parsing
Implement read-only Gmail, Calendar, Slack, and Trello adapters; attachment parsing; exact timestamp filtering; pagination and truncation handling.
**Exit:** Read adapters have no write methods, limits are enforced, and rolling 24-hour filtering is accurate.

### Milestone 3 — Daily Summary and Scheduler
Implement configurable scheduling, local timezone/date handling, atomic daily execution lock, provider aggregation, partial-failure handling, Telegram formatting/chunking, delivery-state tracking, and bounded recovery.
**Exit:** At most one successful daily summary per local date under the documented policy; repeated evaluations do not trigger duplicate normal runs; failures are visible and auditable.

### Milestone 4 — Matching and Clarification
Implement Slack event parsing, Gmail matching, structured task extraction, assignee resolution, and Telegram selection flows.
**Exit:** Ambiguous emails/assignees require clarification; no final proposal is sent before ambiguity is resolved.

### Milestone 5 — Approval-Gated Trello Writes
Implement finalized proposals, expiring approval tokens, atomic execution locking, idempotency marker, conservative timeout reconciliation, separate assignment outcome, and Telegram reporting.
**Exit:** No Trello writes without explicit approval; duplicate clicks are blocked; uncertain outcomes are escalated instead of blindly retried.

### Milestone 6 — Automated Verification
Implement and run acceptance scenarios T-001 through T-030 and critical E2E flows E2E-1 and E2E-2, plus timezone/DST, prompt-injection, token-redaction, pagination, and recovery tests.
**Exit:** Actual test execution evidence is recorded. Never claim tests passed unless they were run.

### Milestone 7 — Phase 2 Voice Extension
Deferred until Milestones 1–6 are signed off and the owner explicitly approves. Voice cannot bypass the Trello approval requirement.

## 6. Confirmation Checklist
For each item, Antigravity must report one status: `MATCH`, `MISMATCH`, `NOT SPECIFIED`, or `NOT IMPLEMENTED YET`.

1. Daily summary includes Calendar, Trello, Gmail, and authorized Slack data and is delivered through Telegram.
2. Slack → Gmail → Trello workflow includes matching, attachment inspection, clarification, proposal, explicit approval, card creation, assignment, and verified result reporting.
3. Gmail/Calendar are read-only; Slack is read-only in authorized channels; Trello writes are approval-gated.
4. MCP Gateway, provider adapters, webhooks/scheduler, and database persistence match the intended architecture.
5. Security, untrusted-content handling, auditability, state locking, and recovery are documented.
6. Gmail rolling 24-hour filtering, 100-message truncation warnings, and attachment limits are specified.
7. Telegram delivery limitations and conservative Trello timeout recovery are documented accurately.
8. Scheduler recovery (15 minutes) and proposal crash recovery (5 minutes) are separate and tested.
9. All 30 acceptance scenarios and critical E2E flows are present; tests are actually executed before reporting success.
10. MVP excludes Xero and voice; voice remains Phase 2.
11. Milestone boundaries and exit criteria match this document.
12. Actual implementation status is clearly distinguished from specification-only work.

## 7. Instructions to Antigravity
Compare this document with the latest versions of:
- `08-implementation-plan.md`
- `05-data-and-api-contracts.md`
- `06-security-and-reliability.md`
- `03-architecture.md`
- `07-test-plan-and-acceptance.md`

Do not modify code, install packages, deploy, or edit specifications during this review.

Return:
1. A table listing every checklist item, its status (`MATCH`, `MISMATCH`, `NOT SPECIFIED`, or `NOT IMPLEMENTED YET`), and evidence with exact file/section references.
2. All mismatches, missing requirements, and scope deviations.
3. What is implemented versus only documented.
4. Tests actually executed and their real results, if any.
5. A clear statement on whether the current project matches the intended scope.

Do not claim a requirement is implemented or a test passed unless verified from the repository and actual execution.

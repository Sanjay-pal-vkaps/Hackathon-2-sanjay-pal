# Prompt — Build one approved milestone

Implement only the specific milestone I approve. First reread `AGENTS.md` and relevant `project-docs/`. Preserve the existing architecture and avoid unrelated refactors.

Requirements that must remain true:
- Daily summary uses `DAILY_SUMMARY_TIME` and `APP_TIMEZONE`, defaults 09:00 and Asia/Kolkata, and runs through a durable timezone-aware scheduler.
- Telegram bot token remains server-side; only allowlisted chat/sender IDs can receive private summaries or confirm actions.
- Slack/Gmail/Calendar remain read-only; Trello card creation/assignment requires explicit, valid confirmation.
- Assignees must map to real Trello members; ask if uncertain.
- Handle duplicate events, duplicate summary runs, retries, partial failures and ambiguous writes safely.
- Add/adjust unit, integration and end-to-end tests. Run them and report exact results; do not claim tests passed if not run.
- Do not deploy or modify production without explicit approval.

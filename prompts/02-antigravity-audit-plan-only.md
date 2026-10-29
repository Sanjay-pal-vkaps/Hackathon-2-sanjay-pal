# Prompt — Antigravity audit (plan only)

Read `AGENTS.md` and every file in `project-docs/`. Inspect the existing repository and return a plan only; do not edit code yet.

Plan for these two workflows only:
1. Daily 9 AM Telegram summary from Gmail, Google Calendar, Slack and Trello. Use `DAILY_SUMMARY_TIME=09:00` and `APP_TIMEZONE=Asia/Kolkata` defaults; scheduling must be durable and timezone-aware.
2. Relevant Slack message → Gmail email/attachment lookup → task proposal → Telegram clarification/confirmation → Trello create and verified-member assignment → Telegram result.

Verify current official provider docs, OAuth scopes, Slack event/polling options, Telegram webhook/callback security, Trello member assignment, scheduler fit, test setup and current voice integration. Include environment variable names, migrations, security controls, test plan, risks and milestone acceptance criteria. Preserve existing architecture and do not broaden scope. Wait for approval before coding.

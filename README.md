# Multi-App AI Agent — Updated MVP Documentation

Status: Updated to the confirmed MVP: daily 9:00 AM summary plus Slack → Gmail → Trello workflow with Telegram notifications and approval.

## Confirmed MVP
- Voice and text assistant remain supported.
- Integrations: Gmail, Google Calendar, Slack, Trello, and Telegram.
- **Daily summary at 9:00 AM** from Gmail, Google Calendar, Slack, and Trello. Time and timezone are environment-configurable.
- **Slack-to-task workflow:** detect a relevant message in an authorized Slack channel, find the related Gmail email, inspect its content/allowed attachment, prepare a Trello task, and notify the user on Telegram.
- If assignee details are clear and match a valid Trello member, include that assignee in the proposed task. If unclear, ask via Telegram.
- Telegram is used for daily summaries, action proposals, confirmation/clarification, and success/failure notifications.
- No Trello write occurs until the user confirms through the approved Telegram confirmation flow (or the app UI, if implemented). The backend validates confirmation and permissions.
- Architecture: Next.js frontend (Vercel proposed), Supabase Auth + PostgreSQL, ElevenLabs Conversational AI, backend APIs, separate container-hosted centralized MCP Gateway, hybrid MCP + native API adapters.
- Gmail, Google Calendar, and Slack remain read-only. Trello has narrow confirmation-gated task creation/assignment only. Telegram bot sends messages and receives authorized callback/commands only for this workflow.
- Short-term conversation context only; permanent memory out of scope. Xero out of scope/stretch goal.

## Suggested reading order
1. `project-docs/00-product-decisions.md`
2. `project-docs/01-prd.md`
3. `project-docs/02-ux-voice-spec.md`
4. `project-docs/03-architecture.md`
5. `project-docs/04-integrations-and-permissions.md`
6. `project-docs/05-data-and-api-contracts.md`
7. `project-docs/06-security-and-reliability.md`
8. `project-docs/07-test-plan-and-acceptance.md`
9. `project-docs/08-implementation-plan.md`
10. `AGENTS.md` and prompts in `prompts/`

## First setup notes
- Copy `.env.example` to `.env` locally and fill values securely; never commit `.env`.
- Set `DAILY_SUMMARY_TIME=09:00` and `APP_TIMEZONE=Asia/Kolkata` for 9 AM India time.
- Configure a Telegram bot token and the permitted destination chat ID. Do not expose the bot token to the browser.
- The scheduler must use the configured timezone and be deployed on a reliable scheduler/worker; a local in-process timer alone is not sufficient for production.

## Use with Antigravity
Ask Antigravity to read `AGENTS.md` and all `project-docs/` files, inspect the repository, verify current official provider docs, and return a plan only. Do not permit code edits until the plan is approved.

## Important
This package describes the intended product, not integrations already connected or tests already passed. Provider capabilities, OAuth scopes, Slack event/polling strategy, Telegram bot setup, deployment scheduling, and current voice SDK behavior must be verified during implementation.

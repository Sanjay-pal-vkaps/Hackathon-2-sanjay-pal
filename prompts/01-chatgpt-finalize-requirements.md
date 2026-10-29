# Prompt — Finalize requirements with ChatGPT

Use `project-docs/` as the source of truth. The MVP has two workflows: (1) at 9:00 AM in `APP_TIMEZONE`, send a Telegram summary using Gmail, Google Calendar, Slack and Trello; (2) detect a relevant authorized Slack message, find the related Gmail email/attachment, prepare a Trello task, ask via Telegram if the email/assignee is ambiguous, then create/assign only after explicit confirmation and notify Telegram with the provider-confirmed result. The schedule defaults are `DAILY_SUMMARY_TIME=09:00` and `APP_TIMEZONE=Asia/Kolkata`.

Preserve Next.js, Supabase Auth/PostgreSQL, ElevenLabs voice, backend APIs, separate centralized MCP Gateway and hybrid MCP/native adapters. Gmail/Calendar/Slack are read-only. Trello writes are narrow and confirmation-gated. Telegram bot token stays server-side and chat/sender IDs are allowlisted. Xero and permanent memory are out of scope.

Review contradictions, open decisions, acceptance criteria and security gaps. Do not write application code. Label unresolved items OPEN/PROPOSED and avoid adding features outside the two workflows.

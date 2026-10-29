# UX and Voice Interaction Specification

## Main screens
1. Sign-in/onboarding and connected apps
2. Main text/voice assistant
3. Source evidence detail
4. Request/action history
5. Settings for integrations, Telegram destination, daily summary time/timezone and voice

## Telegram messages
### Daily summary
- Header with date/time and timezone.
- Sections: meetings, tasks due/overdue, important emails, important Slack messages, key points/follow-ups.
- Source links where available; show incomplete provider data clearly.

### Task proposal
- Slack source author/channel/message and link.
- Matched Gmail email sender/subject/date and link; attachment name if used.
- Proposed Trello title/description/due date, target board/list and assignee.
- Explicit Approve and Cancel controls (or equivalent secure bot callback).
- If source email or assignee is ambiguous, ask a concise clarification instead of presenting an executable proposal.

### Result
- Only after provider confirmation, say the task was created and assigned; include Trello card link.
- On failure/uncertain outcome, state that clearly and do not claim completion.

## Voice behavior
- Voice and text use the same backend policy and tool path.
- Voice cannot bypass the confirmation gate. The Telegram confirmation can be used even when the workflow began from Slack/background processing.
- Speak concise summaries; show detailed evidence and links in UI/Telegram.

## Required states
Loading, no connection, expired permission, no/multiple email matches, unsupported attachment, partial summary, proposal awaiting confirmation, proposal expired/cancelled, action success/failure/uncertain, Telegram delivery failure, scheduler failure, microphone denied or voice unavailable.

## Accessibility and reliability
Keyboard-accessible UI, visible focus, responsive layouts, clear status not relying on color alone, bounded retries, and readable Telegram messages. Test timezone display and user-configured destination before release.

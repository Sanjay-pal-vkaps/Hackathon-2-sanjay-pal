# Integration and Permission Matrix

Capabilities and exact OAuth scopes must be verified against current official documentation before coding.

| Provider | MVP Operations | Access Boundary | Write Allowed? |
|---|---|---|---|
| Gmail | Search/list and read message metadata/body; retrieve supported attachment content | Connected user's account only (`gmail.readonly`) | No, strictly read-only |
| Google Calendar | Read today's events and relevant details | Connected user's calendar (`calendar.readonly`) | No, strictly read-only |
| Slack | Detect/read relevant messages and authorized channel context | Only configured workspace and channels (`channels:history`, `channels:read`) | No, strictly read-only |
| Trello | Read board/list/cards and members; create approved card and assign verified member | Configured board/list (`read,write` scope) | Yes, **strictly gated** by explicit Telegram approval |
| Telegram | Send summaries, clarification prompts, proposals, and results; receive callbacks | Allowlisted chat ID and user IDs | Sends messages; callbacks execute Trello writes only after state and permission validation |
| Xero | None | Stretch goal only | No |

## Slack-to-Gmail Matching & Clarification
- Extract message author, channel, text, timestamp, names, subjects, and file references as search clues.
- If 0 matches: Send Telegram notification with search terms and prompt user to clarify keywords.
- If 1 match: Automatically load message and attachments for task extraction.
- If >1 matches: Present interactive Telegram selection menu with candidate snippets; wait for user selection before extracting task.

## Gmail and Attachment Constraints
- Strictly read-only (`gmail.readonly`).
- **Supported Formats**: `.txt`, `.md`, `.csv`, `.pdf` (text-only extraction; no script execution, macros, or binary handlers).
- **Size Limits**: Max 5 MB per attachment; max 200 KB text payload passed to LLM context (truncated safely).
- **Prompt Injection Defense**: Wrap all extracted text inside `<untrusted_source>` isolation tags.
- Disallowed files (e.g., `.exe`, `.js`, `.xlsm`, `.zip`) are skipped with a warning note in the proposal.

## Trello Task Create and Assignment
- Destination board and list configured via `TRELLO_DEFAULT_BOARD_ID` and `TRELLO_DEFAULT_LIST_ID` (or discovered from primary list).
- Extract title, description, and due date from evidence.
- Resolve assignee against real board members via `GET /1/boards/{id}/members`. If missing or ambiguous, present an interactive Telegram picker showing member names and an "Unassigned" option.
- Present final proposal on Telegram with `[✅ Approve & Create Card]` and `[❌ Cancel]`.
- Upon approval callback:
  1. Verify proposal is `pending` and unexpired.
  2. Transition state atomically to `executing`.
  3. Call `POST /1/cards`.
  4. If member assignment fails but card creation succeeds, report honest partial failure with card link.
  5. Never claim success without provider confirmation (HTTP 200 + card URL).

## Telegram Webhook Security
- Register webhook with `secret_token = TELEGRAM_WEBHOOK_SECRET`.
- Reject any request lacking `X-Telegram-Bot-Api-Secret-Token` with HTTP 401.
- Restrict incoming updates to `TELEGRAM_CHAT_ID` and `TELEGRAM_ALLOWED_USER_IDS`. Reject others with HTTP 403.
- Enforce single-use, unexpired proposal callback tokens.
- Chunk messages exceeding 4096 characters to prevent Telegram API errors.

## Dynamic Daily Summary Scheduling
- Evaluated dynamically against `DAILY_SUMMARY_TIME` and `APP_TIMEZONE` (defaults: `09:00` and `Asia/Kolkata`).
- Changing `.env` takes immediate effect on the next evaluation cycle without code changes or static cron redeployments.
- Deduplicate daily runs by run key (`daily-summary:YYYY-MM-DD`).

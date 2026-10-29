-- Initial Schema Migration for Multi-App AI Agent
-- Milestone 1 Core Entities and Constraints

-- 1. Connected Accounts
CREATE TABLE IF NOT EXISTS connected_accounts (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('gmail', 'google_calendar', 'slack', 'trello', 'telegram')),
  provider_account_id VARCHAR(255) NOT NULL,
  granted_scopes TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked')),
  secure_token_reference VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Telegram Destinations (Chat & User Allowlist)
CREATE TABLE IF NOT EXISTS telegram_destinations (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  chat_id VARCHAR(64) NOT NULL,
  authorized_sender_ids TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Scheduled Job Runs (Dynamic 9 AM Summary Execution Locking)
CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id VARCHAR(64) PRIMARY KEY,
  job_type VARCHAR(64) NOT NULL DEFAULT 'daily_summary',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(32) NOT NULL DEFAULT 'executing' CHECK (status IN ('executing', 'completed', 'failed')),
  provider_statuses JSONB NOT NULL DEFAULT '{}'::jsonb,
  telegram_delivery_status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (telegram_delivery_status IN ('pending', 'sent', 'failed')),
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Source Evidence
CREATE TABLE IF NOT EXISTS source_evidence (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  run_id VARCHAR(64),
  provider VARCHAR(32) NOT NULL CHECK (provider IN ('gmail', 'google_calendar', 'slack', 'trello')),
  item_id VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_truncated BOOLEAN NOT NULL DEFAULT FALSE,
  sanitized_content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Clarification Sessions (Interactive Telegram Pickers)
CREATE TABLE IF NOT EXISTS clarification_sessions (
  id VARCHAR(64) PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('email_picker', 'assignee_picker')),
  candidate_options JSONB NOT NULL,
  selected_option VARCHAR(255),
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- 6. Action Proposals (Gated Trello Card Proposals)
CREATE TABLE IF NOT EXISTS action_proposals (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  slack_source_id VARCHAR(255) NOT NULL,
  gmail_source_id VARCHAR(255) NOT NULL,
  trello_board_id VARCHAR(64) NOT NULL,
  trello_list_id VARCHAR(64) NOT NULL,
  task_title VARCHAR(255) NOT NULL,
  task_description TEXT NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE,
  assignee_member_id VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'succeeded', 'failed', 'uncertain', 'cancelled', 'expired')),
  approval_token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  executed_at TIMESTAMP WITH TIME ZONE
);

-- 7. Action Executions (Trello Execution & Result Status)
CREATE TABLE IF NOT EXISTS action_executions (
  id VARCHAR(64) PRIMARY KEY,
  proposal_id VARCHAR(64) NOT NULL REFERENCES action_proposals(id),
  trello_card_id VARCHAR(64),
  trello_card_url TEXT,
  assignment_status VARCHAR(32) CHECK (assignment_status IN ('unassigned', 'assigned', 'failed')),
  result_status VARCHAR(32) NOT NULL CHECK (result_status IN ('succeeded', 'failed', 'uncertain', 'partial')),
  safe_error_message TEXT,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  request_id VARCHAR(64),
  run_id VARCHAR(64),
  event_type VARCHAR(64) NOT NULL,
  provider VARCHAR(32),
  outcome VARCHAR(32) NOT NULL CHECK (outcome IN ('success', 'failure', 'denied', 'uncertain')),
  safe_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance and lookup
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_key ON scheduled_job_runs(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_action_proposals_token ON action_proposals(approval_token);
CREATE INDEX IF NOT EXISTS idx_action_proposals_status ON action_proposals(status);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_time ON audit_events(user_id, timestamp);

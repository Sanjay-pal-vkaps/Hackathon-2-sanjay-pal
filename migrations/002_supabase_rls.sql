-- Supabase Hardening Migration: Enable Row Level Security (RLS) across all core tables
-- This ensures that anonymous PostgREST clients cannot query or mutate data directly.
-- The Next.js server connects using the service_role key or direct DATABASE_URL with bypassrls/service privileges.

-- 1. Enable RLS on all tables
ALTER TABLE IF EXISTS connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS telegram_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS source_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clarification_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_events ENABLE ROW LEVEL SECURITY;

-- 2. Allow service_role full administrative access to all tables
DO $$
BEGIN
  -- connected_accounts
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_connected_accounts') THEN
    CREATE POLICY service_role_all_connected_accounts ON connected_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- telegram_destinations
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_telegram_destinations') THEN
    CREATE POLICY service_role_all_telegram_destinations ON telegram_destinations FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- scheduled_job_runs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_scheduled_job_runs') THEN
    CREATE POLICY service_role_all_scheduled_job_runs ON scheduled_job_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- source_evidence
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_source_evidence') THEN
    CREATE POLICY service_role_all_source_evidence ON source_evidence FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- clarification_sessions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_clarification_sessions') THEN
    CREATE POLICY service_role_all_clarification_sessions ON clarification_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- action_proposals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_action_proposals') THEN
    CREATE POLICY service_role_all_action_proposals ON action_proposals FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- action_executions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_action_executions') THEN
    CREATE POLICY service_role_all_action_executions ON action_executions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- audit_events
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_audit_events') THEN
    CREATE POLICY service_role_all_audit_events ON audit_events FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

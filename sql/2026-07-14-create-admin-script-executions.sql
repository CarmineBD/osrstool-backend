CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_script_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_name text NOT NULL,
  status text NOT NULL,
  trigger text NOT NULL DEFAULT 'manual',
  requested_by_user_id uuid NULL,
  params jsonb NULL,
  result jsonb NULL,
  error_message text NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NULL,
  duration_ms integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_script_executions_status_check
    CHECK (status IN ('running', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_admin_script_executions_script_started_at
  ON admin_script_executions (script_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_script_executions_status_started_at
  ON admin_script_executions (status, started_at DESC);

CREATE OR REPLACE FUNCTION set_admin_script_executions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_script_executions_set_updated_at ON admin_script_executions;
CREATE TRIGGER admin_script_executions_set_updated_at
BEFORE UPDATE ON admin_script_executions
FOR EACH ROW
EXECUTE FUNCTION set_admin_script_executions_updated_at();

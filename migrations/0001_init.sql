CREATE TABLE IF NOT EXISTS nodes_records (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  organization_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nodes_records_user ON nodes_records(user_id);
CREATE INDEX IF NOT EXISTS idx_nodes_records_org ON nodes_records(organization_id);

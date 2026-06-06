import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MIGRATION = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  main_path    TEXT NOT NULL DEFAULT 'main.tex',
  shell_escape BOOLEAN NOT NULL DEFAULT false,
  engine       TEXT NOT NULL DEFAULT 'auto',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  data        BYTEA,
  is_binary   BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, path)
);

-- columns added after first release (idempotent)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS main_path TEXT NOT NULL DEFAULT 'main.tex';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS shell_escape BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE files ADD COLUMN IF NOT EXISTS data BYTEA;
ALTER TABLE files ADD COLUMN IF NOT EXISTS is_binary BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS files_project_idx ON files(project_id);
`;

export async function migrate(): Promise<void> {
  // retry until postgres ready
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query(MIGRATION);
      console.log("[db] migrations applied");
      return;
    } catch (err) {
      if (attempt >= 15) throw err;
      console.log(`[db] not ready (attempt ${attempt}), retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

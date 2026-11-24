-- SOOLOO Studio schema. Non-destructive: safe to run on the existing production database.
-- Never add DROP statements here. Back up D1 (Time Travel) before applying new migrations.
CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, consented_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS editorial_drafts (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '', research TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_assets (draft_id TEXT NOT NULL REFERENCES editorial_drafts(id), format TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(draft_id,format));
CREATE TABLE IF NOT EXISTS transcript_jobs (id TEXT PRIMARY KEY, source_url TEXT NOT NULL, mode TEXT NOT NULL, provider_job_id TEXT, status TEXT NOT NULL, transcript TEXT, lang TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS transcript_jobs_active ON transcript_jobs(source_url,mode) WHERE status IN ('starting','pending');
CREATE INDEX IF NOT EXISTS transcript_jobs_source ON transcript_jobs(source_url,mode,created_at);
CREATE TABLE IF NOT EXISTS generation_locks (draft_id TEXT NOT NULL, format TEXT NOT NULL, locked_until TEXT NOT NULL, PRIMARY KEY(draft_id,format));
CREATE TABLE IF NOT EXISTS usage_events (id TEXT PRIMARY KEY, provider TEXT NOT NULL, operation TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS usage_events_day ON usage_events(provider,created_at);
CREATE TABLE IF NOT EXISTS transcript_notes (job_id TEXT NOT NULL, level INTEGER NOT NULL, idx INTEGER NOT NULL, notes TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(job_id,level,idx));
CREATE TABLE IF NOT EXISTS transcript_briefs (job_id TEXT PRIMARY KEY, brief TEXT NOT NULL, parts INTEGER NOT NULL, created_at TEXT NOT NULL);

-- Free-tool email capture (functions/api/lead.js)
CREATE TABLE IF NOT EXISTS leads (email TEXT NOT NULL, source TEXT NOT NULL, consented_at TEXT NOT NULL, PRIMARY KEY(email,source));

-- Additive Media OS phase one.
CREATE TABLE IF NOT EXISTS media_competitors (id TEXT PRIMARY KEY, channel TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, notes TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(channel,url));
CREATE TABLE IF NOT EXISTS media_ideas (id TEXT PRIMARY KEY, channel TEXT NOT NULL, title TEXT NOT NULL, source_url TEXT NOT NULL, notes TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL);

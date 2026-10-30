CREATE TABLE IF NOT EXISTS sites (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,            -- JSON: category, city, phone, address, hours, rating, services, about, colors
  status TEXT NOT NULL DEFAULT 'preview', -- preview | active | past_due | paused | canceled | expired
  email TEXT,
  stripe_customer TEXT,
  stripe_sub TEXT,
  panel_token TEXT UNIQUE,
  custom_domain TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL,            -- change | domain | other
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | done
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT, type TEXT NOT NULL, detail TEXT, created_at INTEGER NOT NULL
);
-- agregado después con wrangler d1 execute (no estaba en este archivo)
ALTER TABLE sites ADD COLUMN html TEXT;
-- 2026-10-29: sending moved from the Mac to the Worker cron (src/mailer.js)
ALTER TABLE sites ADD COLUMN sent_at INTEGER;
CREATE TABLE IF NOT EXISTS suppress (email TEXT PRIMARY KEY, why TEXT, created_at INTEGER NOT NULL); -- address or whole domain

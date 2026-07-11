-- ============================================================
-- Help & Support System — Database Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Bug Reports
CREATE TABLE IF NOT EXISTS bug_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject         TEXT NOT NULL,
  description     TEXT NOT NULL,
  screenshot_url  TEXT DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Feature Requests
CREATE TABLE IF NOT EXISTS feature_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL,
  votes        INT NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Reports
CREATE TABLE IF NOT EXISTS user_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reported_username TEXT NOT NULL,
  reason            TEXT NOT NULL,
  description       TEXT DEFAULT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bug_reports_user_id      ON bug_reports (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id  ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_feature_requests_user_id ON feature_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_id ON user_reports (reporter_id);

-- Row Level Security
ALTER TABLE bug_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_requests   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own bug reports" ON bug_reports;
CREATE POLICY "Users can insert own bug reports"
  ON bug_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own bug reports" ON bug_reports;
CREATE POLICY "Users can view own bug reports"
  ON bug_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own support tickets" ON support_tickets;
CREATE POLICY "Users can insert own support tickets"
  ON support_tickets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own support tickets" ON support_tickets;
CREATE POLICY "Users can view own support tickets"
  ON support_tickets FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own feature requests" ON feature_requests;
CREATE POLICY "Users can insert own feature requests"
  ON feature_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own feature requests" ON feature_requests;
CREATE POLICY "Users can view own feature requests"
  ON feature_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own user reports" ON user_reports;
CREATE POLICY "Users can insert own user reports"
  ON user_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('bug_reports','support_tickets','feature_requests','user_reports')
ORDER BY table_name;

-- Nibblio initial schema (spec §33). Applied by src/db/migrate.ts, which
-- records each file in schema_migrations — never mutate applied files;
-- add 002_*.sql etc. for changes.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guest_profiles (
  guest_id      TEXT PRIMARY KEY,               -- client-generated, HMAC-checked
  user_id       BIGINT REFERENCES users(id),    -- set when linked to an account
  nickname      TEXT NOT NULL DEFAULT 'Worm',
  selected_skin TEXT NOT NULL DEFAULT 's0',
  coins         BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_profiles (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id),
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skins (
  skin_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  rarity        TEXT NOT NULL DEFAULT 'common',
  unlock_type   TEXT NOT NULL DEFAULT 'default'
);

CREATE TABLE IF NOT EXISTS skin_unlocks (
  guest_id      TEXT NOT NULL REFERENCES guest_profiles(guest_id),
  skin_id       TEXT NOT NULL REFERENCES skins(skin_id),
  unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, skin_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id            BIGSERIAL PRIMARY KEY,
  room_id       TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS match_results (
  id            BIGSERIAL PRIMARY KEY,
  match_id      BIGINT REFERENCES matches(id),
  guest_id      TEXT NOT NULL,
  score         BIGINT NOT NULL DEFAULT 0,
  kills         INT NOT NULL DEFAULT 0,
  survived_sec  INT NOT NULL DEFAULT 0,
  rank          INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_match_results_guest ON match_results(guest_id, created_at DESC);

CREATE TABLE IF NOT EXISTS player_statistics (
  guest_id          TEXT PRIMARY KEY REFERENCES guest_profiles(guest_id),
  total_games       BIGINT NOT NULL DEFAULT 0,
  total_kills       BIGINT NOT NULL DEFAULT 0,
  total_deaths      BIGINT NOT NULL DEFAULT 0,
  best_score        BIGINT NOT NULL DEFAULT 0,
  best_rank         INT,
  longest_survival  INT NOT NULL DEFAULT 0,   -- seconds
  food_collected    BIGINT NOT NULL DEFAULT 0,
  boost_time_sec    BIGINT NOT NULL DEFAULT 0,
  powerups_collected BIGINT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS achievements (
  guest_id      TEXT NOT NULL REFERENCES guest_profiles(guest_id),
  achievement   TEXT NOT NULL,
  earned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (guest_id, achievement)
);

CREATE TABLE IF NOT EXISTS settings (
  guest_id      TEXT PRIMARY KEY REFERENCES guest_profiles(guest_id),
  payload       JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS purchases (
  id            BIGSERIAL PRIMARY KEY,
  guest_id      TEXT NOT NULL REFERENCES guest_profiles(guest_id),
  item          TEXT NOT NULL,
  amount_coins  BIGINT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id            BIGSERIAL PRIMARY KEY,
  guest_id      TEXT,
  event         TEXT NOT NULL,
  detail        JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events(created_at DESC);

-- seed skins from the shipped set
INSERT INTO skins (skin_id, name, rarity, unlock_type) VALUES
  ('s0','Mango','common','default'),
  ('s1','Bubblegum','common','default'),
  ('s2','Minty','common','default'),
  ('s3','Skyberry','common','default'),
  ('s4','Grape Jam','rare','default'),
  ('s5','Lemon Fizz','rare','default')
ON CONFLICT (skin_id) DO NOTHING;

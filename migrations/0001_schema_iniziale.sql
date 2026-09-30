-- Schema iniziale (SPEC §10)

CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('admin', 'operatore')),
  pw_hash         TEXT NOT NULL,
  pw_salt         TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE searches (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  address_text      TEXT NOT NULL,
  address_place_id  TEXT,
  lat               REAL NOT NULL,
  lng               REAL NOT NULL,
  radius_km         REAL NOT NULL,
  types_json        TEXT NOT NULL,
  include_contacts  INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'in_corso' CHECK (status IN ('in_corso', 'completata', 'errore')),
  result_count      INTEGER NOT NULL DEFAULT 0,
  api_calls         INTEGER NOT NULL DEFAULT 0,
  saturated_calls   INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT
);

CREATE TABLE search_results (
  search_id   INTEGER NOT NULL REFERENCES searches(id),
  place_id    TEXT NOT NULL,
  name        TEXT,
  address     TEXT,
  types_json  TEXT,
  phone       TEXT,
  website     TEXT,
  fetched_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (search_id, place_id)
);

CREATE INDEX idx_searches_created_at ON searches(created_at);
CREATE INDEX idx_searches_user_id ON searches(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);

-- Parcels playtest database (Cloudflare D1, which is SQLite).
-- Create it once:  npx wrangler d1 execute parcels-playtest --remote --file=schema.sql

-- Everything the game reports during a play session, one row per event, in order.
-- t = milliseconds since the session started; data = JSON with the event's details.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  player TEXT NOT NULL,
  session TEXT NOT NULL,
  type TEXT NOT NULL,
  t INTEGER,
  level TEXT,
  board INTEGER,
  data TEXT
);
CREATE INDEX IF NOT EXISTS events_session ON events (session);
CREATE INDEX IF NOT EXISTS events_type ON events (type);

-- One row per finished board (solved, or the solution was viewed).
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  player TEXT NOT NULL,
  session TEXT NOT NULL,
  level TEXT,
  board INTEGER,
  outcome TEXT,          -- 'solved' or 'revealed'
  time_ms INTEGER,
  misses INTEGER,
  pops INTEGER,
  hints INTEGER,
  pairs INTEGER,
  locks INTEGER,
  score INTEGER,          -- from the old points system; no longer sent (the result is outcome + hints)
  stars INTEGER,          -- likewise
  new_best INTEGER,      -- 1 if it set the player's best time for the level
  data TEXT              -- the full report as JSON
);
CREATE INDEX IF NOT EXISTS games_level ON games (level);

-- Feedback form entries.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT NOT NULL,
  player TEXT,
  session TEXT,
  rating INTEGER,        -- 1 to 5, or empty
  message TEXT,
  contact TEXT,          -- optional name or email they typed
  context TEXT           -- JSON: screen, level, board, device
);

-- Syncing a player's results across their devices: one row per sync code (no accounts; the code is
-- the key). data holds the merged results and best times from every device using that code.
CREATE TABLE IF NOT EXISTS sync (
  code TEXT PRIMARY KEY,
  data TEXT NOT NULL,          -- {progress: {level: {board: result}}, bests: {level: {time, board, at}}}
  updated_at INTEGER NOT NULL  -- ms since 1970
);

CREATE TABLE status_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO status_meta (id, revision) VALUES (1, 0);

-- Separate records avoid D1's per-row size limit for the whole status board.
CREATE TABLE status_records (
  kind TEXT NOT NULL CHECK (kind IN ('service', 'incident')),
  id TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, id)
);

CREATE TABLE monitor_lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

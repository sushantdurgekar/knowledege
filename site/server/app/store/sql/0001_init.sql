-- Study Hubs Postgres schema v1 (architecture-spec.md section 4.8, build-contracts.md section 23).
-- Applied once at startup under pg_advisory_lock(842001) and recorded in schema_migrations.
--
-- Ids are COLLATE "C" so that ordering and cursors follow code points, like the document
-- ids of the Firestore and memory stores. `progress.doc_id` ({uid}~{hub}) is the hub
-- document's id: scans page by it. progress.uid is deliberately not a foreign key: as on
-- Firestore, a hub document may exist without a user document (a sync before the user
-- upsert, a backup holding one without the other); delete_user removes both.

CREATE TABLE IF NOT EXISTS users (
  uid text COLLATE "C" PRIMARY KEY,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  name text,
  photo text,
  provider text,
  created_at timestamptz,
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS progress (
  uid text COLLATE "C" NOT NULL,
  hub_id text COLLATE "C" NOT NULL CHECK (hub_id ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  part text NOT NULL CHECK (part IN ('main', 'mocks', 'cards', 'legacy')),
  upd bigint NOT NULL,
  data bytea NOT NULL CHECK (octet_length(data) <= 131072),
  raw_len integer NOT NULL,
  done integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  doc_id text COLLATE "C" GENERATED ALWAYS AS (uid || '~' || hub_id) STORED,
  PRIMARY KEY (uid, hub_id, part)
);
ALTER TABLE progress ALTER COLUMN data SET STORAGE EXTERNAL;  -- already gzip
CREATE INDEX IF NOT EXISTS progress_doc_id ON progress (doc_id);

CREATE TABLE IF NOT EXISTS tombstones (
  h text COLLATE "C" PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key text COLLATE "C" PRIMARY KEY,
  value jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A job is a JSON document (`doc`, the same dict the other stores keep); the columns
-- next to it are what queries filter and sort on.
CREATE TABLE IF NOT EXISTS jobs (
  id text COLLATE "C" PRIMARY KEY,
  kind text NOT NULL,
  state text NOT NULL,
  holder text,
  created_at text COLLATE "C",
  doc jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_state ON jobs (state, id);
CREATE INDEX IF NOT EXISTS jobs_created ON jobs (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS usage (
  key text COLLATE "C" PRIMARY KEY,
  counters jsonb NOT NULL DEFAULT '{}'
);

-- Restore `replace` stages rows here (COPY), then one transaction swaps them in.
CREATE UNLOGGED TABLE IF NOT EXISTS users_import (
  job_id text NOT NULL,
  uid text COLLATE "C" NOT NULL,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  name text,
  photo text,
  provider text,
  created_at timestamptz,
  last_login_at timestamptz
);
CREATE INDEX IF NOT EXISTS users_import_job ON users_import (job_id);

CREATE UNLOGGED TABLE IF NOT EXISTS progress_import (
  job_id text NOT NULL,
  uid text COLLATE "C" NOT NULL,
  hub_id text COLLATE "C" NOT NULL,
  part text NOT NULL,
  upd bigint NOT NULL,
  data bytea NOT NULL,
  raw_len integer NOT NULL,
  done integer
);
CREATE INDEX IF NOT EXISTS progress_import_job ON progress_import (job_id);

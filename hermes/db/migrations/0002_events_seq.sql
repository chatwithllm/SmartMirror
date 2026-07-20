-- 0002_events_seq — add a monotonic sequence for gapless SSE cursor replay.
-- Additive & idempotent (RULE 7). `seq` gives the web tail a unique, ordered
-- cursor so `Last-Event-ID` resync replays exactly the missed events.
ALTER TABLE events ADD COLUMN IF NOT EXISTS seq bigint;

-- Backfill existing rows in ts order, then attach an owned sequence as default.
CREATE SEQUENCE IF NOT EXISTS events_seq_seq OWNED BY events.seq;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM events WHERE seq IS NULL) THEN
    PERFORM setval('events_seq_seq', COALESCE((SELECT max(seq) FROM events), 0) + 1, false);
    UPDATE events e
       SET seq = nextval('events_seq_seq')
      FROM (SELECT id FROM events WHERE seq IS NULL ORDER BY ts, id) ord
     WHERE e.id = ord.id;
  END IF;
END $$;

ALTER TABLE events ALTER COLUMN seq SET DEFAULT nextval('events_seq_seq');

CREATE UNIQUE INDEX IF NOT EXISTS events_seq_uidx ON events (seq);

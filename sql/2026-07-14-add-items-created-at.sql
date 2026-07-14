ALTER TABLE items
ADD COLUMN IF NOT EXISTS created_at timestamptz;

UPDATE items
SET created_at = COALESCE(created_at, last_synced_at, now())
WHERE created_at IS NULL;

ALTER TABLE items
ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE items
ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_created_at_desc
  ON items (created_at DESC, id DESC);

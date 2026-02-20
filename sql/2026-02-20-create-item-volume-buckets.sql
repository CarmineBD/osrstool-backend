CREATE TABLE IF NOT EXISTS item_volume_buckets (
  item_id integer NOT NULL,
  bucket_ts timestamptz NOT NULL,
  high_volume integer NOT NULL DEFAULT 0,
  low_volume integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, bucket_ts),
  CHECK (high_volume >= 0 AND low_volume >= 0)
);

CREATE INDEX IF NOT EXISTS item_volume_buckets_bucket_ts_idx
  ON item_volume_buckets (bucket_ts);

CREATE TABLE IF NOT EXISTS variant_history_15m (
  variant_id uuid NOT NULL REFERENCES method_variants(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  low_profit_sum numeric NOT NULL,
  high_profit_sum numeric NOT NULL,
  low_profit_min numeric NOT NULL,
  low_profit_max numeric NOT NULL,
  high_profit_min numeric NOT NULL,
  high_profit_max numeric NOT NULL,
  open_low_profit numeric NOT NULL,
  open_high_profit numeric NOT NULL,
  open_timestamp timestamptz NOT NULL,
  close_low_profit numeric NOT NULL,
  close_high_profit numeric NOT NULL,
  close_timestamp timestamptz NOT NULL,
  samples integer NOT NULL CHECK (samples > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, bucket_start)
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS variant_history_15m_bucket_start_idx
ON variant_history_15m (bucket_start);

DELETE FROM variant_history_15m
WHERE bucket_start >= now() - interval '90 days';

WITH filtered AS MATERIALIZED (
  SELECT
    variant_id,
    "timestamp",
    to_timestamp(floor(extract(epoch FROM "timestamp") / 900) * 900) AS bucket_start,
    low_profit,
    high_profit
  FROM variant_history
  WHERE "timestamp" >= now() - interval '90 days'
),
agg AS (
  SELECT
    variant_id,
    bucket_start,
    SUM(low_profit) AS low_profit_sum,
    SUM(high_profit) AS high_profit_sum,
    MIN(low_profit) AS low_profit_min,
    MAX(low_profit) AS low_profit_max,
    MIN(high_profit) AS high_profit_min,
    MAX(high_profit) AS high_profit_max,
    COUNT(*)::integer AS samples
  FROM filtered
  GROUP BY variant_id, bucket_start
),
opens AS (
  SELECT DISTINCT ON (variant_id, bucket_start)
    variant_id,
    bucket_start,
    low_profit AS open_low_profit,
    high_profit AS open_high_profit,
    "timestamp" AS open_timestamp
  FROM filtered
  ORDER BY variant_id, bucket_start, "timestamp" ASC
),
closes AS (
  SELECT DISTINCT ON (variant_id, bucket_start)
    variant_id,
    bucket_start,
    low_profit AS close_low_profit,
    high_profit AS close_high_profit,
    "timestamp" AS close_timestamp
  FROM filtered
  ORDER BY variant_id, bucket_start, "timestamp" DESC
)
INSERT INTO variant_history_15m (
  variant_id,
  bucket_start,
  low_profit_sum,
  high_profit_sum,
  low_profit_min,
  low_profit_max,
  high_profit_min,
  high_profit_max,
  open_low_profit,
  open_high_profit,
  open_timestamp,
  close_low_profit,
  close_high_profit,
  close_timestamp,
  samples,
  updated_at
)
SELECT
  agg.variant_id,
  agg.bucket_start,
  agg.low_profit_sum,
  agg.high_profit_sum,
  agg.low_profit_min,
  agg.low_profit_max,
  agg.high_profit_min,
  agg.high_profit_max,
  opens.open_low_profit,
  opens.open_high_profit,
  opens.open_timestamp,
  closes.close_low_profit,
  closes.close_high_profit,
  closes.close_timestamp,
  agg.samples,
  now()
FROM agg
JOIN opens USING (variant_id, bucket_start)
JOIN closes USING (variant_id, bucket_start)
ON CONFLICT (variant_id, bucket_start) DO UPDATE SET
  low_profit_sum = EXCLUDED.low_profit_sum,
  high_profit_sum = EXCLUDED.high_profit_sum,
  low_profit_min = EXCLUDED.low_profit_min,
  low_profit_max = EXCLUDED.low_profit_max,
  high_profit_min = EXCLUDED.high_profit_min,
  high_profit_max = EXCLUDED.high_profit_max,
  open_low_profit = EXCLUDED.open_low_profit,
  open_high_profit = EXCLUDED.open_high_profit,
  open_timestamp = EXCLUDED.open_timestamp,
  close_low_profit = EXCLUDED.close_low_profit,
  close_high_profit = EXCLUDED.close_high_profit,
  close_timestamp = EXCLUDED.close_timestamp,
  samples = EXCLUDED.samples,
  updated_at = now();

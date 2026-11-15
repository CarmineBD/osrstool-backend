-- Run once in each environment before deploying the multi-market backend.
-- Existing records are the normal OSRS market and remain untouched.

ALTER TABLE variant_history
  ADD COLUMN IF NOT EXISTS market_mode varchar(16) NOT NULL DEFAULT 'osrs';
CREATE INDEX IF NOT EXISTS variant_history_market_variant_timestamp_desc_idx
  ON variant_history (market_mode, variant_id, "timestamp" DESC);

ALTER TABLE variant_history_15m
  ADD COLUMN IF NOT EXISTS market_mode varchar(16) NOT NULL DEFAULT 'osrs';
DO $$
DECLARE
  primary_key_name text;
BEGIN
  SELECT conname INTO primary_key_name
  FROM pg_constraint
  WHERE conrelid = 'public.variant_history_15m'::regclass AND contype = 'p';

  IF primary_key_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.variant_history_15m DROP CONSTRAINT %I', primary_key_name);
  END IF;
END $$;
ALTER TABLE variant_history_15m
  ADD CONSTRAINT variant_history_15m_pkey PRIMARY KEY (market_mode, variant_id, bucket_start);

ALTER TABLE variant_history_daily
  ADD COLUMN IF NOT EXISTS market_mode varchar(16) NOT NULL DEFAULT 'osrs';
DO $$
DECLARE
  primary_key_name text;
BEGIN
  SELECT conname INTO primary_key_name
  FROM pg_constraint
  WHERE conrelid = 'public.variant_history_daily'::regclass AND contype = 'p';

  IF primary_key_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.variant_history_daily DROP CONSTRAINT %I', primary_key_name);
  END IF;
END $$;
ALTER TABLE variant_history_daily
  ADD CONSTRAINT variant_history_daily_pkey PRIMARY KEY (market_mode, variant_id, bucket_date);

ALTER TABLE item_volume_buckets
  ADD COLUMN IF NOT EXISTS market_mode varchar(16) NOT NULL DEFAULT 'osrs';
DO $$
DECLARE
  primary_key_name text;
BEGIN
  SELECT conname INTO primary_key_name
  FROM pg_constraint
  WHERE conrelid = 'public.item_volume_buckets'::regclass AND contype = 'p';

  IF primary_key_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.item_volume_buckets DROP CONSTRAINT %I', primary_key_name);
  END IF;
END $$;
ALTER TABLE item_volume_buckets
  ADD CONSTRAINT item_volume_buckets_pkey PRIMARY KEY (market_mode, item_id, bucket_ts);

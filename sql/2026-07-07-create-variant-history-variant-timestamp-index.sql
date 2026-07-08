CREATE INDEX CONCURRENTLY IF NOT EXISTS variant_history_variant_id_timestamp_desc_idx
ON variant_history (variant_id, "timestamp" DESC);

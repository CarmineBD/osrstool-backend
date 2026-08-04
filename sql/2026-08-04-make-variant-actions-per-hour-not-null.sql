UPDATE method_variants
SET actions_per_hour = 0
WHERE actions_per_hour IS NULL;

ALTER TABLE method_variants
ALTER COLUMN actions_per_hour SET NOT NULL;

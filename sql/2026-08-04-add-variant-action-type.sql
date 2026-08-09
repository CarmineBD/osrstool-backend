ALTER TABLE method_variants
ADD COLUMN IF NOT EXISTS action_type varchar(32);

ALTER TABLE variant_snapshots
ADD COLUMN IF NOT EXISTS action_type varchar(32);

UPDATE method_variants
SET action_type = 'items'
WHERE action_type IS NULL;

UPDATE variant_snapshots snapshot
SET action_type = variant.action_type
FROM method_variants variant
WHERE snapshot.variant_id = variant.id
  AND snapshot.action_type IS NULL;

ALTER TABLE method_variants
ALTER COLUMN action_type SET NOT NULL;

ALTER TABLE money_making_methods
ADD COLUMN IF NOT EXISTS icon_id integer;

ALTER TABLE method_variants
ADD COLUMN IF NOT EXISTS icon_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_money_making_methods_icon_id_items'
  ) THEN
    ALTER TABLE money_making_methods
    ADD CONSTRAINT fk_money_making_methods_icon_id_items
    FOREIGN KEY (icon_id) REFERENCES items (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_method_variants_icon_id_items'
  ) THEN
    ALTER TABLE method_variants
    ADD CONSTRAINT fk_method_variants_icon_id_items
    FOREIGN KEY (icon_id) REFERENCES items (id);
  END IF;
END $$;

-- Optional after backfilling existing rows:
-- ALTER TABLE money_making_methods ALTER COLUMN icon_id SET NOT NULL;
-- ALTER TABLE method_variants ALTER COLUMN icon_id SET NOT NULL;

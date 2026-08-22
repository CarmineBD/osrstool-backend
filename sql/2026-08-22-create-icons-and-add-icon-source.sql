CREATE TABLE IF NOT EXISTS icons (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  icon_path text NOT NULL,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_icons_type CHECK (type IN ('interface', 'spell', 'prayer', 'skill', 'other'))
);

ALTER TABLE money_making_methods
  ADD COLUMN IF NOT EXISTS icon_source text;

ALTER TABLE method_variants
  ADD COLUMN IF NOT EXISTS icon_source text;

UPDATE money_making_methods
SET icon_source = 'item'
WHERE icon_source IS NULL;

UPDATE method_variants
SET icon_source = 'item'
WHERE icon_source IS NULL;

ALTER TABLE money_making_methods
  ALTER COLUMN icon_source SET NOT NULL;

ALTER TABLE method_variants
  ALTER COLUMN icon_source SET NOT NULL;

ALTER TABLE money_making_methods
  DROP CONSTRAINT IF EXISTS fk_money_making_methods_icon_id_items;

ALTER TABLE method_variants
  DROP CONSTRAINT IF EXISTS fk_method_variants_icon_id_items;

ALTER TABLE money_making_methods
  ALTER COLUMN icon_id TYPE bigint USING icon_id::bigint;

ALTER TABLE method_variants
  ALTER COLUMN icon_id TYPE bigint USING icon_id::bigint;

ALTER TABLE money_making_methods
  ALTER COLUMN icon_source SET DEFAULT 'item';

ALTER TABLE method_variants
  ALTER COLUMN icon_source SET DEFAULT 'item';

ALTER TABLE money_making_methods
  ADD CONSTRAINT chk_money_making_methods_icon_source
  CHECK (icon_source IN ('item', 'game_icon'));

ALTER TABLE method_variants
  ADD CONSTRAINT chk_method_variants_icon_source
  CHECK (icon_source IN ('item', 'game_icon'));

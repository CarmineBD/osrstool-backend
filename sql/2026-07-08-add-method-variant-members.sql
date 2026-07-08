ALTER TABLE method_variants
ADD COLUMN IF NOT EXISTS members boolean NOT NULL DEFAULT false;

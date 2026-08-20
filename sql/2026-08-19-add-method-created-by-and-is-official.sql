ALTER TABLE public.money_making_methods
ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.money_making_methods
ADD COLUMN IF NOT EXISTS is_official boolean;

ALTER TABLE public.money_making_methods
ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.money_making_methods
SET
  created_by = COALESCE(created_by, 'e139f001-33bf-4a11-91da-e9952d3c8574'::uuid),
  is_official = COALESCE(is_official, true),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE created_by IS NULL
   OR is_official IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.money_making_methods
ALTER COLUMN created_by SET NOT NULL;

ALTER TABLE public.money_making_methods
ALTER COLUMN is_official SET DEFAULT false;

ALTER TABLE public.money_making_methods
ALTER COLUMN is_official SET NOT NULL;

ALTER TABLE public.money_making_methods
ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.money_making_methods
ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_money_making_methods_is_official
  ON public.money_making_methods (is_official);

CREATE INDEX IF NOT EXISTS idx_money_making_methods_created_by
  ON public.money_making_methods (created_by);

CREATE OR REPLACE FUNCTION set_money_making_methods_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS money_making_methods_set_updated_at ON public.money_making_methods;
CREATE TRIGGER money_making_methods_set_updated_at
BEFORE UPDATE ON public.money_making_methods
FOR EACH ROW
EXECUTE FUNCTION set_money_making_methods_updated_at();

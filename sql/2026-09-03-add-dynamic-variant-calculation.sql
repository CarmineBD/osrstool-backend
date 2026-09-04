-- Dynamic method variants
-- Run once in each environment before deploying the backend changes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.method_variants
  ADD COLUMN IF NOT EXISTS calculation_mode varchar(16);

UPDATE public.method_variants
SET calculation_mode = 'fixed'
WHERE calculation_mode IS NULL;

ALTER TABLE public.method_variants
  ALTER COLUMN calculation_mode SET DEFAULT 'fixed',
  ALTER COLUMN calculation_mode SET NOT NULL,
  DROP CONSTRAINT IF EXISTS chk_method_variants_calculation_mode,
  ADD CONSTRAINT chk_method_variants_calculation_mode
    CHECK (calculation_mode IN ('fixed', 'dynamic'));

-- Dynamic variants calculate this legacy hourly value at read time, so it must be nullable.
ALTER TABLE public.method_variants
  ALTER COLUMN actions_per_hour DROP NOT NULL;

-- Action type applies only to fixed variants.
ALTER TABLE public.method_variants
  ALTER COLUMN action_type DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL UNIQUE REFERENCES public.method_variants(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  roll_interval_ticks integer NOT NULL CHECK (roll_interval_ticks > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actions_variant_id ON public.actions (variant_id);

CREATE TABLE IF NOT EXISTS public.actions_inputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  item_id integer NOT NULL REFERENCES public.items(id),
  quantity numeric NOT NULL CHECK (quantity >= 0),
  CONSTRAINT uq_actions_inputs_action_item UNIQUE (action_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_actions_inputs_action_id ON public.actions_inputs (action_id);
CREATE INDEX IF NOT EXISTS idx_actions_inputs_item_id ON public.actions_inputs (item_id);

CREATE TABLE IF NOT EXISTS public.actions_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  item_id integer NOT NULL REFERENCES public.items(id),
  quantity numeric NOT NULL CHECK (quantity >= 0),
  CONSTRAINT uq_actions_outputs_action_item UNIQUE (action_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_actions_outputs_action_id ON public.actions_outputs (action_id);
CREATE INDEX IF NOT EXISTS idx_actions_outputs_item_id ON public.actions_outputs (item_id);

CREATE TABLE IF NOT EXISTS public.cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL UNIQUE REFERENCES public.method_variants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cycles_variant_id ON public.cycles (variant_id);

CREATE TABLE IF NOT EXISTS public.cycle_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.cycles(id) ON DELETE CASCADE,
  step_order_position integer NOT NULL CHECK (step_order_position > 0),
  name text NOT NULL,
  duration_ticks integer NULL CHECK (duration_ticks IS NULL OR duration_ticks >= 0),
  clicks_made integer NOT NULL DEFAULT 0 CHECK (clicks_made >= 0),
  is_afk boolean NOT NULL DEFAULT false,
  action_id_made uuid NULL REFERENCES public.actions(id),
  actions_made integer NULL CHECK (actions_made IS NULL OR actions_made > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cycle_steps_cycle_position UNIQUE (cycle_id, step_order_position),
  CONSTRAINT chk_cycle_steps_action_or_duration CHECK (
    (action_id_made IS NULL AND actions_made IS NULL AND duration_ticks IS NOT NULL)
    OR
    (action_id_made IS NOT NULL AND actions_made IS NOT NULL AND duration_ticks IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cycle_steps_cycle_id ON public.cycle_steps (cycle_id);
CREATE INDEX IF NOT EXISTS idx_cycle_steps_action_id_made ON public.cycle_steps (action_id_made);

ALTER TABLE public.cycle_steps
  ADD COLUMN IF NOT EXISTS name text;

UPDATE public.cycle_steps
SET name = CONCAT('Step ', step_order_position)
WHERE name IS NULL OR btrim(name) = '';

ALTER TABLE public.cycle_steps
  ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.cycle_steps
  DROP CONSTRAINT IF EXISTS cycle_steps_duration_ticks_check,
  DROP CONSTRAINT IF EXISTS chk_cycle_steps_duration_ticks,
  ADD CONSTRAINT chk_cycle_steps_duration_ticks
    CHECK (duration_ticks IS NULL OR duration_ticks >= 0);

CREATE TABLE IF NOT EXISTS public.action_skill_xp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  skill_id integer NOT NULL REFERENCES public.skills(id),
  experience numeric NOT NULL CHECK (experience >= 0),
  CONSTRAINT uq_action_skill_xp_action_skill UNIQUE (action_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_action_skill_xp_action_id ON public.action_skill_xp (action_id);
CREATE INDEX IF NOT EXISTS idx_action_skill_xp_skill_id ON public.action_skill_xp (skill_id);

-- The following trigger prevents a cycle step from pointing at an action owned by another variant.
CREATE OR REPLACE FUNCTION public.ensure_cycle_step_action_matches_variant()
RETURNS trigger AS $$
BEGIN
  IF NEW.action_id_made IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.cycles cycle
    JOIN public.actions action ON action.variant_id = cycle.variant_id
    WHERE cycle.id = NEW.cycle_id
      AND action.id = NEW.action_id_made
  ) THEN
    RAISE EXCEPTION 'cycle_steps.action_id_made must belong to the cycle variant';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cycle_steps_action_matches_variant ON public.cycle_steps;
CREATE TRIGGER cycle_steps_action_matches_variant
BEFORE INSERT OR UPDATE OF cycle_id, action_id_made ON public.cycle_steps
FOR EACH ROW EXECUTE FUNCTION public.ensure_cycle_step_action_matches_variant();

-- At the application layer, a dynamic variant must have exactly one action and one cycle,
-- while fixed variants must not persist rows in these tables. The database uniqueness above
-- enforces the one-per-variant side; the API validates the calculation mode and payload shape.

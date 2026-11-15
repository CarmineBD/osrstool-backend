-- Dynamic variant modifiers. Run once in each environment before deploying the backend.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.method_variants(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  type varchar(32) NOT NULL,
  skill_id integer NULL REFERENCES public.skills(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_modifiers_type CHECK (type IN ('skill_level', 'location', 'equipment')),
  CONSTRAINT chk_modifiers_skill CHECK (
    (type = 'skill_level' AND skill_id IS NOT NULL)
    OR (type <> 'skill_level' AND skill_id IS NULL)
  ),
  CONSTRAINT uq_modifiers_variant_type_name UNIQUE (variant_id, type, name)
);

CREATE INDEX IF NOT EXISTS idx_modifiers_variant_id ON public.modifiers (variant_id);
CREATE INDEX IF NOT EXISTS idx_modifiers_skill_id ON public.modifiers (skill_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_modifiers_variant_skill_level
  ON public.modifiers (variant_id, skill_id)
  WHERE type = 'skill_level';

CREATE TABLE IF NOT EXISTS public.modifier_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_id uuid NOT NULL REFERENCES public.modifiers(id) ON DELETE CASCADE,
  target_type varchar(32) NOT NULL,
  target_id uuid NOT NULL,
  target_property varchar(64) NOT NULL,
  operation varchar(16) NOT NULL,
  value_type varchar(16) NOT NULL,
  value jsonb NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_modifier_effects_target_type CHECK (
    target_type IN ('actions', 'actions_inputs', 'actions_outputs', 'actions_skill_xp', 'cycle_steps')
  ),
  CONSTRAINT chk_modifier_effects_operation CHECK (operation IN ('set', 'add', 'multiply')),
  CONSTRAINT chk_modifier_effects_value_type CHECK (value_type IN ('constant', 'curve')),
  CONSTRAINT chk_modifier_effects_target_property CHECK (
    (target_type = 'actions' AND target_property IN ('rollIntervalTicks', 'baseSuccessChance'))
    OR (target_type = 'actions_inputs' AND target_property = 'quantity')
    OR (target_type = 'actions_outputs' AND target_property = 'quantity')
    OR (target_type = 'actions_skill_xp' AND target_property = 'experience')
    OR (target_type = 'cycle_steps' AND target_property IN ('durationTicks', 'clicksMade', 'isAfk', 'actionsMade'))
  )
);

CREATE INDEX IF NOT EXISTS idx_modifier_effects_modifier_id ON public.modifier_effects (modifier_id);
CREATE INDEX IF NOT EXISTS idx_modifier_effects_target ON public.modifier_effects (target_type, target_id);

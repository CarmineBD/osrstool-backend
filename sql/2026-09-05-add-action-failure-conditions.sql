-- Conditional dynamic-action effects. Run once in each environment before deploying the backend.

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS base_success_chance numeric(5,4);

UPDATE public.actions
SET base_success_chance = 1
WHERE base_success_chance IS NULL;

ALTER TABLE public.actions
  ALTER COLUMN base_success_chance TYPE numeric(5,4)
    USING base_success_chance::numeric(5,4),
  ALTER COLUMN base_success_chance SET DEFAULT 1,
  ALTER COLUMN base_success_chance SET NOT NULL,
  DROP CONSTRAINT IF EXISTS chk_actions_base_success_chance,
  ADD CONSTRAINT chk_actions_base_success_chance
    CHECK (base_success_chance >= 0 AND base_success_chance <= 1);

ALTER TABLE public.actions_inputs
  ADD COLUMN IF NOT EXISTS condition varchar(7);
UPDATE public.actions_inputs SET condition = 'always' WHERE condition IS NULL;
ALTER TABLE public.actions_inputs
  ALTER COLUMN condition SET DEFAULT 'always',
  ALTER COLUMN condition SET NOT NULL,
  DROP CONSTRAINT IF EXISTS chk_actions_inputs_condition,
  ADD CONSTRAINT chk_actions_inputs_condition
    CHECK (condition IN ('always', 'success', 'failure')),
  DROP CONSTRAINT IF EXISTS uq_actions_inputs_action_item,
  DROP CONSTRAINT IF EXISTS uq_actions_inputs_action_item_condition,
  ADD CONSTRAINT uq_actions_inputs_action_item_condition UNIQUE (action_id, item_id, condition);

ALTER TABLE public.actions_outputs
  ADD COLUMN IF NOT EXISTS condition varchar(7);
UPDATE public.actions_outputs SET condition = 'always' WHERE condition IS NULL;
ALTER TABLE public.actions_outputs
  ALTER COLUMN condition SET DEFAULT 'always',
  ALTER COLUMN condition SET NOT NULL,
  DROP CONSTRAINT IF EXISTS chk_actions_outputs_condition,
  ADD CONSTRAINT chk_actions_outputs_condition
    CHECK (condition IN ('always', 'success', 'failure')),
  DROP CONSTRAINT IF EXISTS uq_actions_outputs_action_item,
  DROP CONSTRAINT IF EXISTS uq_actions_outputs_action_item_condition,
  ADD CONSTRAINT uq_actions_outputs_action_item_condition UNIQUE (action_id, item_id, condition);

ALTER TABLE public.action_skill_xp
  ADD COLUMN IF NOT EXISTS condition varchar(7);
UPDATE public.action_skill_xp SET condition = 'always' WHERE condition IS NULL;
ALTER TABLE public.action_skill_xp
  ALTER COLUMN condition SET DEFAULT 'always',
  ALTER COLUMN condition SET NOT NULL,
  DROP CONSTRAINT IF EXISTS chk_action_skill_xp_condition,
  ADD CONSTRAINT chk_action_skill_xp_condition
    CHECK (condition IN ('always', 'success', 'failure')),
  DROP CONSTRAINT IF EXISTS uq_action_skill_xp_action_skill,
  DROP CONSTRAINT IF EXISTS uq_action_skill_xp_action_skill_condition,
  ADD CONSTRAINT uq_action_skill_xp_action_skill_condition UNIQUE (action_id, skill_id, condition);

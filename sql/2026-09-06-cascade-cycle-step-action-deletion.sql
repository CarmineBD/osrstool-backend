-- Deleting a dynamic variant deletes its action. Cycle steps that represent
-- actions also reference that action through action_id_made, so this FK must
-- cascade as well.
ALTER TABLE public.cycle_steps
  DROP CONSTRAINT IF EXISTS cycle_steps_action_id_made_fkey;

ALTER TABLE public.cycle_steps
  ADD CONSTRAINT cycle_steps_action_id_made_fkey
  FOREIGN KEY (action_id_made)
  REFERENCES public.actions(id)
  ON DELETE CASCADE;

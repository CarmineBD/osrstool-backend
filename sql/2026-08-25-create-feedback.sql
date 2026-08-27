CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE public.feedback_type AS ENUM ('feature', 'bug', 'improvement', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE public.feedback_status AS ENUM ('new', 'considering', 'planned', 'completed', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type public.feedback_type NOT NULL,
  content text NOT NULL,
  status public.feedback_status NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_feedback_user
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON DELETE CASCADE,
  CONSTRAINT chk_feedback_content_length
    CHECK (char_length(btrim(content)) BETWEEN 10 AND 5000)
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at_desc
  ON public.feedback (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id
  ON public.feedback (user_id);

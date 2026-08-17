CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  terms_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_user_terms_acceptances_user
    FOREIGN KEY (user_id)
    REFERENCES public.users (id)
    ON DELETE CASCADE,
  CONSTRAINT uq_user_terms_acceptances_user_version
    UNIQUE (user_id, terms_version),
  CONSTRAINT chk_user_terms_acceptances_terms_version_nonempty
    CHECK (length(btrim(terms_version)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_user_terms_acceptances_user_id
  ON public.user_terms_acceptances (user_id);

CREATE INDEX IF NOT EXISTS idx_user_terms_acceptances_terms_version
  ON public.user_terms_acceptances (terms_version);

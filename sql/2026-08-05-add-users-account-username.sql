ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS account_username text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_username_unique_ci
ON public.users (LOWER(account_username))
WHERE account_username IS NOT NULL;

BEGIN;

ALTER TABLE method_variants
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liked_user_ids text[] NOT NULL DEFAULT '{}'::text[];

UPDATE method_variants
SET
  likes_count = COALESCE(likes_count, 0),
  liked_user_ids = COALESCE(liked_user_ids, '{}'::text[]);

DROP TABLE IF EXISTS method_likes;

COMMIT;

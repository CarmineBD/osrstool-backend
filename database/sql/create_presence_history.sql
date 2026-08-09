CREATE TABLE IF NOT EXISTS public.presence_history (
  bucket_kind text NOT NULL,
  bucket_start timestamptz NOT NULL,
  peak_online integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presence_history_pk PRIMARY KEY (bucket_kind, bucket_start),
  CONSTRAINT presence_history_bucket_kind_check
    CHECK (bucket_kind IN ('hour', 'day')),
  CONSTRAINT presence_history_peak_online_check
    CHECK (peak_online >= 0),
  CONSTRAINT presence_history_bucket_alignment_check
    CHECK (
      (bucket_kind = 'hour' AND bucket_start = date_trunc('hour', bucket_start))
      OR
      (bucket_kind = 'day' AND bucket_start = date_trunc('day', bucket_start))
    )
);

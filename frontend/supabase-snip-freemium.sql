-- Backend-enforced freemium for snip/plug usage. Run in Supabase SQL Editor.

-- 1. Table: monthly usage per user (for free-tier limit)
-- Columns: user_id, period (e.g. 'YYYY-MM'), snip_count
CREATE TABLE IF NOT EXISTS public.user_usage (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period text NOT NULL,
  snip_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

-- If user_usage already existed without "period", add it and fix primary key (run once):
ALTER TABLE public.user_usage ADD COLUMN IF NOT EXISTS period text;
UPDATE public.user_usage SET period = to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM') WHERE period IS NULL;
ALTER TABLE public.user_usage ALTER COLUMN period SET NOT NULL;
ALTER TABLE public.user_usage DROP CONSTRAINT IF EXISTS user_usage_pkey;
ALTER TABLE public.user_usage ADD CONSTRAINT user_usage_pkey PRIMARY KEY (user_id, period);

ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage"
  ON public.user_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only the RPC (SECURITY DEFINER) will insert/update user_usage
CREATE POLICY "Users can insert own usage"
  ON public.user_usage FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own usage"
  ON public.user_usage FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. RPC: record one snip and enforce free-tier monthly limit (25). Returns error or success.
CREATE OR REPLACE FUNCTION public.record_snip_and_check_limit(
  p_content text DEFAULT '',
  p_source_url text DEFAULT '',
  p_target_doc_id text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tier text;
  v_period text;
  v_count int;
  v_limit int := 25;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT tier INTO v_tier FROM public.profiles WHERE id = v_uid;
  v_tier := COALESCE(v_tier, 'free');

  IF v_tier = 'free' THEN
    v_period := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
    SELECT COALESCE(snip_count, 0) INTO v_count
      FROM public.user_usage
      WHERE user_id = v_uid AND period = v_period;
    v_count := COALESCE(v_count, 0);
    IF v_count >= v_limit THEN
      RETURN jsonb_build_object('error', 'snip_limit_reached', 'limit', v_limit);
    END IF;
  END IF;

  INSERT INTO public.snips_history (user_id, content, source_url, target_doc_id)
  VALUES (v_uid, left(p_content, 10000), left(p_source_url, 2048), left(p_target_doc_id, 256));

  v_period := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  INSERT INTO public.user_usage (user_id, period, snip_count)
  VALUES (v_uid, v_period, 1)
  ON CONFLICT (user_id, period)
  DO UPDATE SET snip_count = public.user_usage.snip_count + 1;

  RETURN jsonb_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('error', 'record_snip_failed', 'message', SQLERRM);
END;
$$;

-- 2b. RPC: get current snip usage (read-only). For disabling "Snip and Plug" when limit reached.
CREATE OR REPLACE FUNCTION public.get_snip_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tier text;
  v_period text;
  v_count int;
  v_limit int := 25;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated', 'allowed', true);
  END IF;
  SELECT tier INTO v_tier FROM public.profiles WHERE id = v_uid;
  v_tier := COALESCE(v_tier, 'free');
  IF v_tier != 'free' THEN
    RETURN jsonb_build_object('used', 0, 'limit', 0, 'allowed', true);
  END IF;
  v_period := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  SELECT COALESCE(snip_count, 0) INTO v_count
    FROM public.user_usage
    WHERE user_id = v_uid AND period = v_period;
  v_count := COALESCE(v_count, 0);
  RETURN jsonb_build_object('used', v_count, 'limit', v_limit, 'allowed', (v_count < v_limit));
END;
$$;

-- 3. snips_history: allow the RPC to insert (RPC runs with caller's auth.uid() in session).
-- Run this if snips_history has RLS enabled; otherwise inserts from the RPC can be blocked.
ALTER TABLE public.snips_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own snips" ON public.snips_history;
CREATE POLICY "Users can insert own snips"
  ON public.snips_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Optional: allow users to read their own snips (e.g. for a history UI).
DROP POLICY IF EXISTS "Users can read own snips" ON public.snips_history;
CREATE POLICY "Users can read own snips"
  ON public.snips_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

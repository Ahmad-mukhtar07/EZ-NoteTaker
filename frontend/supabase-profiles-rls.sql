-- Run in Supabase Dashboard → SQL Editor.
-- Creates profile row on signup. Uses Supabase-recommended search_path and EXECUTE PROCEDURE.

-- 1. Function (search_path = '' and full table names per Supabase docs)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, tier, full_name, email)
  VALUES (NEW.id, 'free', NEW.raw_user_meta_data->>'full_name', NEW.email);
  RETURN NEW;
END;
$$;

-- 2. Trigger (EXECUTE PROCEDURE per Supabase docs)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- 3. Verify: list triggers on auth.users (should show on_auth_user_created)
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass;

-- 4. Backfill existing users (run once)
-- INSERT INTO public.profiles (id, tier, full_name, email)
-- SELECT id, 'free', raw_user_meta_data->>'full_name', email FROM auth.users
-- ON CONFLICT (id) DO NOTHING;

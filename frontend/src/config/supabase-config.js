import { createClient } from '@supabase/supabase-js'

// Vite exposes only env vars prefixed with VITE_ via import.meta.env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase;
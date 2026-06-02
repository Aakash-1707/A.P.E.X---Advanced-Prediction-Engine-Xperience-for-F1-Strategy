import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!supabaseConfigured) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
    'Standings will load from OpenF1 instead of Supabase.'
  );
}

// Avoid placeholder URLs — they fail slowly and trigger stale mock fallbacks.
export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : createClient('https://invalid.local', 'invalid');

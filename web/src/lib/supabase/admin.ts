import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only. Uses the secret key, bypasses RLS.
// Never import from a client component or expose to the browser.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing. Supabase redirects here with ?code=... after the user
// clicks the email link; we exchange the code for a session cookie, then
// bounce the user to ?next= (or /).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing-code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}

"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signInWithName(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    redirect("/login?error=missing-name");
  }
  if (name.length > 40) {
    redirect("/login?error=name-too-long");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: name } },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/");
}

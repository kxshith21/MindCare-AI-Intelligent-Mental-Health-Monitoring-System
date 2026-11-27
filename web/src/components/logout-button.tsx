"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase";

/** Signs out of Supabase Auth and returns to /login. */
export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <Button type="button" variant="ghost" size="sm" onClick={handleLogout}>
      Log out
    </Button>
  );
}

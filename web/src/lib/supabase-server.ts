/**
 * Supabase SERVER-side client (Server Components, Route Handlers, Server
 * Actions). Kept separate from `lib/supabase.ts` because `next/headers` is
 * server-only and would break client bundles that import the browser client.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env.local.",
    );
  }
  return { url, anonKey };
}

/** Client for Server Components, Route Handlers, and Server Actions. */
export async function createSupabaseServerClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies are read-only —
          // the proxy refreshes the session instead.
        }
      },
    },
  });
}

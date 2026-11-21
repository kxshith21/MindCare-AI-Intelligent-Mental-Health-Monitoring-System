/**
 * Supabase clients (cookie-based sessions via @supabase/ssr).
 *
 * - Browser client for client components.
 * - Server client for Server Components / Route Handlers / Server Actions.
 * - The request proxy (src/proxy.ts) builds its own client against the
 *   incoming request cookies.
 *
 * TODO(Phase 2): wire the real NEXT_PUBLIC_SUPABASE_* values into .env.local.
 */
import { cookies } from "next/headers";
import { createBrowserClient, createServerClient } from "@supabase/ssr";

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

/** Supabase env is configured (Phase 2+). */
export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Client for client components ("use client"). */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
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

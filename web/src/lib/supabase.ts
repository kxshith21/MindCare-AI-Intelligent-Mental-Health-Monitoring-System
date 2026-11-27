/**
 * Supabase browser-side client (cookie-based sessions via @supabase/ssr).
 *
 * Client components import from this module. The SERVER client lives in
 * `lib/supabase-server.ts` — `next/headers` must never be pulled into a
 * client bundle (it breaks the build).
 *
 * The proxy (src/proxy.ts) builds its own client against request cookies.
 */
import { createBrowserClient } from "@supabase/ssr";

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

/** Supabase env is configured. */
export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Client for client components ("use client"). */
export function createSupabaseBrowserClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}

/**
 * Cookie-aware Supabase helper for src/proxy.ts (Next.js 16's middleware).
 * Reads the session from request cookies and writes refreshed cookies back
 * to the response. No token is exposed to client JavaScript.
 */
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

export const AWAITING_VERIFICATION_PATH = "/psychologist/awaiting-verification";

function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase env vars are missing");
  }
  return { url, anonKey };
}

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  user: User | null;
}> {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  return { response, user: data.user };
}

export async function isVerifiedPsychologist(
  request: NextRequest,
  userId: string,
): Promise<boolean> {
  const { url, anonKey } = getSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Cookie refresh is handled in updateSession().
      },
    },
  });
  const { data } = await supabase
    .from("psychologist_profiles")
    .select("verified")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.verified);
}

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * The browser calls Supabase Auth directly with the anon key, so the CSP must
 * allow the configured Supabase origin. FastAPI is reached same-origin through
 * the /api route handlers, so API_URL is deliberately absent here.
 */
function supabaseConnectOrigins(): string[] {
  const origins = new Set<string>(["'self'", "https://*.supabase.co"]);
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") {
        origins.add(url.origin);
      }
    } catch {
      // Invalid config fails clearly in the Supabase client; don't weaken CSP.
    }
  }
  if (isDev) {
    // Local Supabase is reachable by either loopback hostname.
    origins.add("http://localhost:54321");
    origins.add("http://127.0.0.1:54321");
  }
  return [...origins];
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src ${supabaseConnectOrigins().join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

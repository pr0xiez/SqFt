import withPWA from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const isPreview = process.env.VERCEL_ENV === "preview";
const toolbar = isPreview ? " https://vercel.live" : "";

// Content-Security-Policy, tuned to what this app actually loads:
// - `app/layout.tsx` has one inline <script> (no-flash theme init) with no
//   nonce, and dozens of components use inline `style={{...}}` — both need
//   'unsafe-inline'. We don't use per-request nonces (that requires opting
//   every page into dynamic rendering; out of scope here), so this is the
//   documented "without nonces" CSP shape for next.config.js.
// - 'unsafe-eval' is only needed in dev, where React uses eval() to
//   reconstruct server error stacks in the browser; never in production.
// - Production has no third-party script/style/font origins (fonts are
//   self-hosted via next/font/google, which bakes the font files into the
//   build — no runtime request to fonts.googleapis.com/fonts.gstatic.com).
//   The Stripe Checkout flow (`PayInvoiceButton`) is a full top-level
//   `window.location.assign(url)` redirect to Stripe-hosted checkout, not an
//   embedded iframe or client-side fetch to stripe.com, so it needs no
//   frame-src/connect-src allowance.
// - Preview toolbar origins follow Vercel's documented CSP requirements:
//   https://vercel.com/docs/vercel-toolbar/managing-toolbar#using-a-content-security-policy
//   HTTPS images also support externally hosted organization logos.
// - `frame-ancestors 'none'` is the fix for #225: the public, token-authed
//   /estimate-review and /invoice-review pages have a one-click "approve"
//   action and must never be embeddable in a hostile iframe.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${toolbar};
  style-src 'self' 'unsafe-inline'${toolbar};
  img-src 'self' blob: data: https:;
  font-src 'self'${toolbar}${isPreview ? " https://assets.vercel.com" : ""};
  connect-src 'self'${toolbar}${isPreview ? " wss://ws-us3.pusher.com" : ""};
  frame-src 'self'${toolbar};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  ${isDev ? "" : "upgrade-insecure-requests;"}
`;

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        // Applied to every route, including the public token-authed
        // /estimate-review and /invoice-review pages (see #225) — those pages
        // share the global framing policy. Their stricter referrer policy is
        // applied below because the URL contains a bearer token.
        source: "/:path*",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Superseded by CSP's frame-ancestors below in modern browsers,
            // but kept for older browsers that don't support CSP2.
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          ...(!isDev
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]
            : []),
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\s{2,}/g, " ").trim(),
          },
        ],
      },
      ...["/estimate-review/:path*", "/invoice-review/:path*"].map(
        (source) => ({
          source,
          headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
        })
      ),
    ];
  },
};

export default withPWA({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development", // disable SW in dev to avoid caching issues
  workboxOptions: {
    disableDevLogs: true,
  },
})(nextConfig);

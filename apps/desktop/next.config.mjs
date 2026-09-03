import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/*
 * Two dev servers writing one build directory corrupt it, and the failure looks
 * unrelated to its cause: `ENOENT ... .next/server/pages/_document.js` while the
 * files are visibly being written. It happens whenever a second `npm run dev`
 * lands on another port — which is exactly what the auto-port script makes easy.
 *
 * Giving each port its own directory removes the collision. Production builds
 * keep the default, so nothing about the deployed output changes.
 */
const devPort = process.env.NODE_ENV === 'development' ? process.env.PORT : null;

const isDev = process.env.NODE_ENV === 'development';

/*
 * Zero trust starts with the browser: the page itself is a place an attacker
 * would like to run code, frame the workspace, or exfiltrate a session to
 * somewhere else. None of these headers replace the server-side checks — they
 * narrow what a successful injection could do with them.
 *
 * `unsafe-inline` for scripts is not decoration: the theme is applied by an
 * inline script before first paint so the page does not flash the wrong colour
 * scheme, and Next inlines its own bootstrap. A nonce would remove it, and
 * would mean giving up static rendering on every route that has one.
 * Development additionally needs `unsafe-eval` for hot reload, and an open
 * `connect-src` because the backend host is resolved per request so the
 * workspace can be opened from another machine on the network.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // The document viewer runs its renderers in workers it creates itself.
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  isDev
    ? 'connect-src *'
    : `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Nothing may frame the workspace. Clickjacking a one-click approval button
  // is exactly the shape of attack this app offers.
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing in this workspace needs a camera, a microphone or a location.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ...(isDev ? [] : [{
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }]),
];

/*
 * PDF.js's worker bundle calls `new Function(...)` internally (its own JIT
 * path, not something this app writes or controls). A dedicated Worker
 * enforces the CSP delivered on ITS OWN response, separately from the page
 * that created it — so the page-wide `script-src` above never reaches it
 * either way, and dropping `unsafe-eval` from the page CSP for production
 * does nothing to stop this worker from using it. Scoping `unsafe-eval` to
 * just this one vendored script's response is what actually narrows the
 * page's own attack surface while leaving the worker able to run at all.
 */
const PDF_WORKER_HEADERS = [
  { key: 'Content-Security-Policy', value: "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      { source: '/file-viewer/vendor/pdf/:path*', headers: PDF_WORKER_HEADERS },
      // Excludes the pdf worker path above so it gets only its own headers —
      // two Content-Security-Policy headers on one response are enforced as
      // an intersection, and the stricter one would still block the eval.
      { source: '/((?!file-viewer/vendor/pdf/).*)', headers: SECURITY_HEADERS },
    ];
  },
  ...(devPort ? { distDir: `.next-${devPort}` } : {}),
  // The shared domain package ships TypeScript source, not a build artefact.
  transpilePackages: ['@snoopy/shared'],
  // Pin tracing to this monorepo so a stray lockfile further up the filesystem
  // is not mistaken for the workspace root.
  outputFileTracingRoot: path.join(here, '../..'),
  /*
   * The document viewer's renderer bundle carries isomorphic helpers that
   * branch on `process.versions.node` at runtime and reach for `fs/promises`
   * on the branch a browser never takes. Webpack resolves the import anyway
   * and fails the build. Stubbing the Node built-ins out of the browser bundle
   * leaves the unreachable branch unreachable, which is what it always was.
   */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false, 'fs/promises': false, path: false, crypto: false, stream: false, zlib: false,
        module: false, url: false, util: false, http: false, https: false, os: false,
        canvas: false, worker_threads: false, child_process: false,
      };
      config.module.rules.push({
        test: /[\\/]pdfjs-dist[\\/].*\.mjs$/,
        loader: path.join(here, 'scripts/rename-bundled-webpack-globals.cjs'),
      });
    }
    return config;
  },
};
export default nextConfig;

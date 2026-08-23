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

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(devPort ? { distDir: `.next-${devPort}` } : {}),
  // The shared domain package ships TypeScript source, not a build artefact.
  transpilePackages: ['@snoopy/shared'],
  // Pin tracing to this monorepo so a stray lockfile further up the filesystem
  // is not mistaken for the workspace root.
  outputFileTracingRoot: path.join(here, '../..'),
};
export default nextConfig;

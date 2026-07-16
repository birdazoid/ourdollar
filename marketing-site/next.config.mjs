import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This site is a subdirectory of the OurDollar repo (which has its own
  // lockfile). Pin file-tracing to this directory so builds don't reach up into
  // the Expo app.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;

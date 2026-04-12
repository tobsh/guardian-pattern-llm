/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — the whole thing ships as /out to S3 + CloudFront.
  // No SSR, no server actions. The chat is fully client-side once booted.
  output: 'export',
  images: {
    unoptimized: true,
  },
  // Keep source maps out of production bundles to avoid leaking
  // non-obvious backend URLs and build environment details.
  productionBrowserSourceMaps: false,
  // Strict mode catches stale subscriptions in Amplify auth listeners.
  reactStrictMode: true,
};

export default nextConfig;

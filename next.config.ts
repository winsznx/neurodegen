import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Railway-only deployment per V2 architecture. `output: 'standalone'` makes
  // `next build` emit a self-contained server bundle Railway's railpack builder
  // ships without node_modules. `pnpm start` (= `next start`) keeps working
  // against the standalone build for local dev.
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/manifest.webmanifest',
        headers: [{ key: 'Content-Type', value: 'application/manifest+json' }],
      },
      {
        source: '/api/x402/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, X-Payment-Proof',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

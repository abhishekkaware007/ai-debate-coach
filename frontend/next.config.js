/** @type {import('next').NextConfig} */
const BACKEND = "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // face-api.js tries to require('fs') for Node file system access;
      // stub it out in the browser bundle to silence the build warning.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
      };
    }
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/analyze",
        destination: `${BACKEND}/analyze`,
      },
      {
        source: "/api/sessions",
        destination: `${BACKEND}/sessions`,
      },
      {
        source: "/api/mock-interview/:path*",
        destination: `${BACKEND}/api/mock-interview/:path*`,
      },
      {
        source: "/api/debate/:path*",
        destination: `${BACKEND}/api/debate/:path*`,
      },
      {
        source: "/test-llm",
        destination: `${BACKEND}/test-llm`,
      },
    ];
  },
};

module.exports = nextConfig;

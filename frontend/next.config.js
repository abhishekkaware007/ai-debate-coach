/** @type {import('next').NextConfig} */
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
        destination: "http://127.0.0.1:8000/analyze",
      },
    ];
  },
};

module.exports = nextConfig;

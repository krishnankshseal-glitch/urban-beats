/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;

// Makes `next dev` behave like the actual Cloudflare Workers runtime
// (bindings like Hyperdrive available, etc.) instead of plain Node —
// only affects local development, not what gets deployed.
const { initOpenNextCloudflareForDev } = require("@opennextjs/cloudflare");
initOpenNextCloudflareForDev();

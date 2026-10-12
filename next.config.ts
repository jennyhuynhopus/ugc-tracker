import type { NextConfig } from "next";

// In a GitHub Codespace the site is reached through a forwarded
// *.app.github.dev address; let form submissions (server actions) from it through.
const codespaceOrigin =
  process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
    ? `${process.env.CODESPACE_NAME}-3200.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : null;

const nextConfig: NextConfig = {
  experimental: codespaceOrigin ? { serverActions: { allowedOrigins: [codespaceOrigin] } } : undefined,
  // postgres.js opens raw TCP sockets; keep it out of the server bundle.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;

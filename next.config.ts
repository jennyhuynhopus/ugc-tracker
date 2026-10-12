import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js opens raw TCP sockets; keep it out of the server bundle.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;

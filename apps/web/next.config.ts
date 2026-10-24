import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@vyra/core", "@vyra/backend"],
}

export default nextConfig

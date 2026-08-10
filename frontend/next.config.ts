import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Tree-shakes these to only the modules actually imported instead of
  // pulling in the whole package — lucide-react and recharts are both
  // large barrel exports, and this measurably cuts JS parse/hydrate time
  // on every dashboard page.
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  compress: true,
};

export default nextConfig;

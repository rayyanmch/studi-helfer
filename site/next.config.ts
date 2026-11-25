import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Website ist rein statisch: "next build" legt sie fertig in out/ (kein Server nötig).
  output: "export",
  images: { unoptimized: true },
  devIndicators: false,
  // Zwei Root-Layouts (/ und /de): 404 kommt aus app/global-not-found.tsx
  experimental: { globalNotFound: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

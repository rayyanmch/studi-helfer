import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Für die Mac-App: "next build" legt zusätzlich .next/standalone an (eigener kleiner Server),
  // den desktop/ mitliefert und lokal startet. Ändert nichts an "next dev".
  output: "standalone",
  // Das runde „N“ unten links verdeckt in der Mac-App den Sync-Status. Fehler zeigt Next trotzdem an.
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
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

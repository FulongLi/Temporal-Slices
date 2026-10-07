/// <reference types="vitest/config" />
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Local imagery (public/local/, see `npm run import:images`) may not be
 * redistributable, so production builds drop it unless VITE_INCLUDE_LOCAL=1.
 */
function excludeLocalImagery(): Plugin {
  let outDir = "dist";
  return {
    name: "temporal-exclude-local-imagery",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (process.env.VITE_INCLUDE_LOCAL !== "1") rmSync(resolve(outDir, "local"), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  // GitHub Pages serves this project from /Temporal-Slices/. Keep local
  // development at / and let the deployment workflow opt into the repo path.
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react(), excludeLocalImagery()],
  server: { port: Number(process.env.PORT) || 5173 },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});

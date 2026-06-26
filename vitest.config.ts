import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/db/**", "node_modules/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          include: ["src/db/**/*.test.ts"],
          // GLOBAL reference tables (mata_pelajaran, fase, kurikulum) have no RLS tenant
          // isolation. Parallel db test files seeding/clearing these shared rows cause
          // FK RESTRICT violations and race conditions. Sequential execution eliminates
          // all cross-file contamination. Cost: ~2s on ~22 files — acceptable for
          // integration tests where reliability >> marginal speed.
          fileParallelism: false,
        },
      },
    ],
  },
});

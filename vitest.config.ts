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
        },
      },
    ],
  },
});

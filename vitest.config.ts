import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "test/", "dist/", "src/index.ts"],
      // thresholds: {
      //   lines:
      // },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});

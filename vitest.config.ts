import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@backporter": resolve(__dirname, "./tools/backporter/src"),
      "@linter": resolve(__dirname, "./tools/linter/src"),
      "@file-utils": resolve(__dirname, "./tools/file-utils/src"),
      "@json-utils": resolve(__dirname, "./tools/json-utils/src"),
      "@mc-paths": resolve(__dirname, "./tools/mc-paths/src"),
      "@logger": resolve(__dirname, "./tools/logger/src"),
      "@tools": resolve(__dirname, "./tools"),
    },
  },
});

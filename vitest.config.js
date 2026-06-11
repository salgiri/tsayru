import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node", // selector tests opt into jsdom per-file
    include: ["test/**/*.test.js"],
    setupFiles: ["test/setup.js"],
  },
});

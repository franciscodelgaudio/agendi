import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reportOnFailure: true,
      reporter: ["text-summary", "html", "lcov"],
      include: ["src/**/*.{js,jsx,ts,tsx}"],
      exclude: ["**/*.d.ts", "**/*.{test,spec}.{js,jsx,ts,tsx}", "**/tests/**"],
    },
  },
});

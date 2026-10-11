// Unit tests run against the TypeScript sources in jsdom; build.mjs is not needed first.
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __SH_VERSION__: JSON.stringify("test"),
    __SH_AUTOSTART__: "false",
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      // An https hub URL, as in production (location.origin feeds the absolute download link).
      jsdom: { url: "https://study-hubs.test/h/ai-103" },
    },
    include: ["test/**/*.test.ts"],
    restoreMocks: true,
    unstubGlobals: true,
  },
});

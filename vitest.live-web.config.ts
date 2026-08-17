import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    disableConsoleIntercept: true,
    include: [
      "src/source-acquisition-security/__acceptance__/live-web-manual.acceptance.ts",
    ],
    passWithNoTests: false,
  },
});

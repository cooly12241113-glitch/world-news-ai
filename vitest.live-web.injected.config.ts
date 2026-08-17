import { defineConfig, mergeConfig } from "vitest/config";
import liveWebConfig from "./vitest.live-web.config";

export default mergeConfig(liveWebConfig, defineConfig({
  test: {
    setupFiles: [
      "src/source-acquisition-security/__tests__/fixtures/live-web-acceptance-injected.setup.ts",
    ],
  },
}));

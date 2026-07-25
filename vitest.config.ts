import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@world-news-ai/script-web": fileURLToPath(
        new URL("./src/script/web-contracts.ts", import.meta.url),
      ),
      "@world-news-ai/domain": fileURLToPath(
        new URL("./src/domain/index.ts", import.meta.url),
      ),
    },
  },
});

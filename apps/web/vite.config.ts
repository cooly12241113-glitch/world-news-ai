import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "node:crypto": fileURLToPath(new URL("./src/features/runtime/browser-crypto-adapter.ts", import.meta.url)),
      "@world-news-ai/script-web": fileURLToPath(new URL("../../src/script/web-contracts.ts", import.meta.url)),
      "@world-news-ai/domain": fileURLToPath(new URL("../../src/domain/index.ts", import.meta.url)),
      "@world-news-ai/follow-up": fileURLToPath(new URL("../../src/follow-up/index.ts", import.meta.url)),
      "@world-news-ai/replan": fileURLToPath(new URL("../../src/replan/web-contracts.ts", import.meta.url)),
      "@world-news-ai/session": fileURLToPath(new URL("../../src/session/index.ts", import.meta.url)),
      "@world-news-ai/application-follow-up": fileURLToPath(new URL("../../src/application/follow-up/index.ts", import.meta.url)),
      "@world-news-ai/application-briefing-run": fileURLToPath(new URL("../../src/application/briefing-run/index.ts", import.meta.url)),
      "@world-news-ai/briefing": fileURLToPath(new URL("../../src/briefing/index.ts", import.meta.url)),
      "@world-news-ai/context": fileURLToPath(new URL("../../src/context/index.ts", import.meta.url)),
      "@world-news-ai/explanation": fileURLToPath(new URL("../../src/explanation/index.ts", import.meta.url)),
      "@world-news-ai/generation": fileURLToPath(new URL("../../src/generation/index.ts", import.meta.url)),
      "@world-news-ai/script": fileURLToPath(new URL("../../src/script/index.ts", import.meta.url)),
      "@world-news-ai/personalization": fileURLToPath(new URL("../../src/personalization/index.ts", import.meta.url)),
      "@world-news-ai/application-personalized-impact": fileURLToPath(new URL("../../src/application/personalized-impact/index.ts", import.meta.url)),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});

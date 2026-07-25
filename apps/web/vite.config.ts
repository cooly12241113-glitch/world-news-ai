import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@world-news-ai/script-web": fileURLToPath(new URL("../../src/script/web-contracts.ts", import.meta.url)),
      "@world-news-ai/domain": fileURLToPath(new URL("../../src/domain/index.ts", import.meta.url)),
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});

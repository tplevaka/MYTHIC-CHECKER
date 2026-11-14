import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "electron/shared"),
    },
  },
  build: {
    outDir: "app-dist",
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ["**/release*/**", "**/dist/**", "**/dist-electron/**", "**/app-dist/**"] },
  },
});

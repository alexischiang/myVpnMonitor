import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import compression from "vite-plugin-compression";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  plugins: [
    tailwindcss(),
    react(),
    compression({ algorithm: "brotliCompress", ext: ".br", threshold: 1024, deleteOriginFile: false }),
    compression({ algorithm: "gzip", ext: ".gz", threshold: 1024, deleteOriginFile: false })
  ],
  server: {
    watch: {
      ignored: ["**/docs-site/**"]
    },
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/uploads": "http://127.0.0.1:3000",
      "/docs": "http://localhost:3001",
      "/sub": "http://127.0.0.1:3000",
      "/c": "http://127.0.0.1:3000",
      "/custom": "http://127.0.0.1:3000"
    }
  }
});

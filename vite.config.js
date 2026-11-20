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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/react-router") || id.includes("/scheduler/")) return "vendor-react"
          if (id.includes("/motion/") || id.includes("/framer-motion/")) return "vendor-motion"
          if (id.includes("/@radix-ui/") || id.includes("/radix-ui/")) return "vendor-radix"
          if (id.includes("/recharts/") || id.includes("/d3-")) return "vendor-charts"
          if (id.includes("/pinyin-pro/")) return "vendor-pinyin"
          if (id.includes("/@uiw/")) return "vendor-md-editor"
          if (id.includes("/react-markdown/") || id.includes("/remark-") || id.includes("/rehype-")) return "vendor-markdown"
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/uploads": "http://127.0.0.1:3000",
      "/docs": "http://127.0.0.1:3000",
      "/sub": "http://127.0.0.1:3000",
      "^/c(?:/|$)": "http://127.0.0.1:3000",
      "/custom": "http://127.0.0.1:3000"
    }
  }
});

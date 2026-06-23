import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import compression from "vite-plugin-compression";

export default defineConfig({
  plugins: [
    react(),
    compression({ algorithm: "brotliCompress", ext: ".br", threshold: 1024, deleteOriginFile: false }),
    compression({ algorithm: "gzip", ext: ".gz", threshold: 1024, deleteOriginFile: false })
  ],
  publicDir: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("scheduler") || id.match(/react[\\/](cjs|index)/)) return "vendor-react";
            if (id.includes("antd") || id.includes("@rc-component") || id.includes("@ant-design") || id.includes("stylis")) return "vendor-antd";
            if (id.includes("react-router") || id.includes("@remix-run")) return "vendor-router";
            return "vendor-misc";
          }
        }
      }
    }
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/sub": "http://127.0.0.1:3000",
      "/c": "http://127.0.0.1:3000",
      "/custom": "http://127.0.0.1:3000"
    }
  }
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/sub": "http://127.0.0.1:3000",
      "/c": "http://127.0.0.1:3000",
      "/custom": "http://127.0.0.1:3000"
    }
  }
});

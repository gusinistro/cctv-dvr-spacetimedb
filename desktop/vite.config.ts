import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "ui"),
  plugins: [react()],
  clearScreen: false,
  server: { host: "127.0.0.1", port: 1420, strictPort: true, allowedHosts: [".manus.computer"] },
  build: { outDir: path.resolve(import.meta.dirname, "dist"), emptyOutDir: true },
});

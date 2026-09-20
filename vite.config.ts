import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: {
    proxy: {
      "/api": `http://localhost:${process.env.BACKEND_PORT ?? "3000"}`,
    },
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
});

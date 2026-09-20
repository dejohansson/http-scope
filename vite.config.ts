import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  server: {
    port: 4500,
    proxy: {
      "/api": `http://localhost:${process.env.BACKEND_PORT ?? "4000"}`,
    },
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
});

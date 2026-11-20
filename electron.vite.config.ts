import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: resolve("electron/main.ts"),
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
      rollupOptions: {
        input: resolve("electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: "src",
    build: {
      rollupOptions: {
        input: resolve("src/index.html"),
      },
    },
    plugins: [vue(), tailwindcss()],
  },
});

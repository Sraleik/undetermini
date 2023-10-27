// vite.config.ts
import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

// https://vitejs.dev/guide/build.html#library-mode
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "undetermini",
      fileName: "undetermini",
      formats: ["es", "umd", "iife", "cjs"]
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: [
        "cohere-ai",
        "currency.js",
        "dotenv",
        "js-tiktoken",
        "langchain",
        "lokijs",
        "ulidx",
        "zod"
      ],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          "cohere-ai": "cohere-ai",
          "currency.js": "currency-js",
          dotenv: "dotenv",
          "js-tiktoken": "tiktoken",
          langchain: "langchain",
          lokijs: "lokijs",
          ulidx: "ulidx",
          zod: "zod"
        }
      }
    }
  },
  plugins: [dts()]
});

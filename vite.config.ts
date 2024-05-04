// vite.config.ts
import { resolve } from "path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
// import { nodePolyfills } from "vite-plugin-node-polyfills";

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
        "chalk",
        "console-table-printer",
        "currency.js",
        "js-tiktoken",
        "lokijs",
        "sha.js"
      ],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          chalk: "chalk",
          "console-table-printer": "console-table-printer",
          "currency.js": "currency-js",
          "js-tiktoken": "tiktoken",
          lokijs: "lokijs",
          "sha.js": "shajs"
        }
      }
    }
  },
  plugins: [
    dts()
    // nodePolyfills({
    //   include: ["crypto", "stream"],
    //   globals: {
    //     Buffer: true
    //   }
    // })
  ]
});

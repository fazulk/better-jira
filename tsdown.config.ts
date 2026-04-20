import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["electron/main.ts"],
  format: "cjs",
  outDir: "dist-electron",
  outExtensions: () => ({ js: ".cjs" }),
  sourcemap: true,
  platform: "node",
  target: "node20",
  // `electron` must stay external — its APIs (app, BrowserWindow, …) only exist
  // when the module is resolved inside the running Electron binary at runtime.
  // Bundling it pulls in node_modules/electron/index.js instead, which just
  // returns the string path to the binary, and then `import_electron.app` is
  // undefined at runtime — the app boots, throws on the first `.on()` call, and
  // exits with code 0 before Electron can even log anything.
  deps: { neverBundle: ["electron"] },
  clean: true,
});

import { defineConfig } from "vite";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  server: { port: 5180 },
  preview: { port: 5180 },
  build: { rollupOptions: { input: { main: "index.html", changelog: "changelog.html", privacy: "privacy.html", terms: "terms.html" } } },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});

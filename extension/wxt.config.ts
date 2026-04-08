import { defineConfig } from "wxt";

export default defineConfig({
  vite: () => ({
    esbuild: {
      // Lit uses field decorators (@property, @state) which require legacy
      // decorator mode.  Without this esbuild throws "Unsupported decorator
      // location: field".
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
          useDefineForClassFields: false,
        },
      },
    },
  }),
  manifest: {
    name: "Provenir",
    description:
      "Real-time content authenticity scoring — detects AI generation, plagiarism, and verifies provenance.",
    version: "0.1.0",
    permissions: ["activeTab", "storage"],
    host_permissions: ["*://*/*"],
    web_accessible_resources: [
      {
        // The WASM binary is fetched by the content script via chrome.runtime.getURL().
        // Content script fetch() runs in the page's security context, so the file
        // must be declared here or the request gets chrome-extension://invalid/.
        resources: ["provenir_core_bg.wasm"],
        matches: ["*://*/*"],
      },
    ],
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  webExt: {
    startUrls: ["https://example.com"],
  },
});

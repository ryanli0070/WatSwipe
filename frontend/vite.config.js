import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Port 5173 is pinned because it's hard-coded in the extension manifest's
// content-script match + host_permissions for the postMessage bridge.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
});

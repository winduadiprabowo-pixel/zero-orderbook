// build: 1772802641987
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    // v96: chunk size warning threshold naik
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // v96: manual chunks — vendor besar di-split
        // browser cache chunk terpisah, tidak re-download semua saat update kecil
        manualChunks: {
          'react-core':  ['react', 'react-dom'],
          'lightweight': ['lightweight-charts'],
          'panels':      ['react-resizable-panels'],
          'query':       ['@tanstack/react-query'],
        },
      },
    },
  },
}));

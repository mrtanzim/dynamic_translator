import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

// Rollup plugin that replaces process.env.NODE_ENV in IIFE bundles.
// CRXJS builds IIFE content scripts with a separate Rollup instance that does
// not inherit Vite's `define` config, so React's CJS references to
// process.env.NODE_ENV survive into the bundle and throw at runtime.
function replaceProcessEnv(): import('vite').Plugin {
  return {
    name: 'replace-process-env',
    renderChunk(code) {
      if (!code.includes('process.env')) return null
      return {
        code: code.replaceAll('process.env.NODE_ENV', JSON.stringify('production')),
        map: null,
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    rollupOptions: {
      plugins: [replaceProcessEnv()],
    },
  },
})


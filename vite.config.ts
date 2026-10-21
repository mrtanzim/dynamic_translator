import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // Replace process.env.NODE_ENV in the IIFE bundle — content scripts run in
  // a browser environment where `process` is not defined.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
})


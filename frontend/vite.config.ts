import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// BACKEND_URL lets docker-compose point the dev proxy at the "backend" service
// name instead of localhost; it defaults to localhost for non-Docker runs.
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Codespaces (and Gitpod) serve the forwarded dev server from a generated
    // subdomain; Vite's Host-header check would otherwise reject it as an
    // unrecognised host.
    allowedHosts: ['.app.github.dev', '.githubpreview.dev', '.gitpod.io'],
    proxy: {
      '/api': backendUrl,
    },
  },
})

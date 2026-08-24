import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// BACKEND_URL lets docker-compose point the dev proxy at the "backend" service
// name instead of localhost; it defaults to localhost for non-Docker runs.
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': backendUrl,
    },
  },
})

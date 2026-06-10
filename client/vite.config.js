import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiUrl = import.meta.env.VITE_API_BASE_URL;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/jobs': {
        target: apiUrl,
        changeOrigin: true,
      },
      '/api/dlq': {
        target: apiUrl,
        changeOrigin: true,
      },
      '/api/events': {
        target: apiUrl,
        changeOrigin: true,
      },
    },
  },
})

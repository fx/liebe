import { defineConfig } from '@tanstack/react-start/config'

export default defineConfig({
  server: {
    preset: 'vercel',
  },
  react: {
    mode: 'spa',
  },
  routers: {
    client: {
      entry: './app.tsx',
    },
  },
})
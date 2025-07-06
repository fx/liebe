import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

// Custom plugin to handle panel.js compilation
function panelPlugin() {
  return {
    name: 'panel-plugin',
    configureServer(server) {
      server.middlewares.use('/panel.js', async (req, res, next) => {
        try {
          // Use Vite's built-in transformation for the panel entry
          const panelPath = '/src/custom-panel.ts'
          const result = await server.transformRequest(panelPath)
          
          if (result) {
            res.setHeader('Content-Type', 'application/javascript')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.end(result.code)
          } else {
            res.statusCode = 404
            res.end('Panel not found')
          }
        } catch (error) {
          console.error('Panel compilation error:', error)
          res.statusCode = 500
          res.end(`console.error('Panel compilation failed: ${error.message}')`)
        }
      })
      
      server.middlewares.use('/panel', async (req, res, next) => {
        // Redirect /panel to /panel.js
        res.writeHead(302, { Location: '/panel.js' })
        res.end()
      })
    }
  }
}

export default defineConfig({
  server: {
    port: 3000,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    // Ensure dependencies are pre-bundled for the custom panel
    include: ['react', 'react-dom', '@tanstack/react-router'],
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      spa: {
        enabled: true,
      },
    }),
    panelPlugin(),
  ],
})

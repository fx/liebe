import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

import { readFileSync, existsSync } from 'fs'

// Custom plugin to serve /panel.js from /dist/panel.js
function panelPlugin() {
  return {
    name: 'panel-plugin',
    configureServer(server) {
      server.middlewares.use('/panel.js', (req, res, next) => {
        const panelPath = resolve(__dirname, 'dist/panel.js')
        
        if (existsSync(panelPath)) {
          try {
            const content = readFileSync(panelPath, 'utf-8')
            res.setHeader('Content-Type', 'application/javascript')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(content)
            return
          } catch (error) {
            console.error('Error reading panel.js:', error)
          }
        }
        
        // If file doesn't exist, return helpful message
        res.setHeader('Content-Type', 'application/javascript')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(`console.error('Panel not built. Run: npm run build:ha');`)
      })
      
      // Also serve the CSS file
      server.middlewares.use('/panel.css', (req, res, next) => {
        const cssPath = resolve(__dirname, 'dist/panel.css')
        
        if (existsSync(cssPath)) {
          try {
            const content = readFileSync(cssPath, 'utf-8')
            res.setHeader('Content-Type', 'text/css')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.setHeader('Cache-Control', 'no-cache')
            res.end(content)
            return
          } catch (error) {
            console.error('Error reading panel.css:', error)
          }
        }
        
        res.statusCode = 404
        res.end()
      })
      
      server.middlewares.use('/panel', (req, res, next) => {
        // Redirect /panel to /panel.js for consistency
        res.writeHead(302, { Location: '/panel.js' })
        res.end()
      })
    }
  }
}

export default defineConfig({
  server: {
    port: 3000,
    cors: {
      origin: '*',
      credentials: false,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': '*',
      'Access-Control-Allow-Headers': '*',
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

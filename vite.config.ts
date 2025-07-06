import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import type { ViteDevServer, Connect } from 'vite'
import type { ServerResponse } from 'http'
import tsConfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'
import { build } from 'vite'

function panelPlugin() {
  let panelContent = ''
  let cssContent = ''
  let isBuilding = false

  async function buildPanel() {
    if (isBuilding) return
    isBuilding = true

    try {
      console.log('[Panel Plugin] Building panel.js...')

      await build({
        mode: 'development',
        configFile: false,
        logLevel: 'error',
        build: {
          lib: {
            entry: resolve(__dirname, 'src/panel.ts'),
            name: 'LiebePanel',
            formats: ['iife'],
            fileName: () => 'panel.js',
          },
          outDir: resolve(__dirname, '.vite-temp'),
          emptyOutDir: true,
          minify: false,
          sourcemap: 'inline',
          rollupOptions: {
            external: [],
            output: {
              globals: {},
              format: 'iife',
              inlineDynamicImports: true,
            },
          },
        },
        define: {
          'process.env.NODE_ENV': '"development"',
        },
        resolve: {
          alias: {
            '~': resolve(__dirname, 'src'),
          },
        },
        plugins: [
          tsConfigPaths({
            projects: ['./tsconfig.json'],
          }),
        ],
      })
      const fs = await import('fs')
      const panelPath = resolve(__dirname, '.vite-temp/panel.js')
      const cssPath = resolve(__dirname, '.vite-temp/style.css')

      if (fs.existsSync(panelPath)) {
        panelContent = fs.readFileSync(panelPath, 'utf-8')
      }

      if (fs.existsSync(cssPath)) {
        cssContent = fs.readFileSync(cssPath, 'utf-8')
      } else {
        const liebeCssPath = resolve(__dirname, '.vite-temp/liebe.css')
        if (fs.existsSync(liebeCssPath)) {
          cssContent = fs.readFileSync(liebeCssPath, 'utf-8')
        }
      }

      console.log('[Panel Plugin] Panel built successfully')
    } catch (error) {
      console.error('[Panel Plugin] Build failed:', error)
      panelContent = `console.error('Panel build failed:', ${JSON.stringify((error as Error).message || 'Unknown error')});`
    } finally {
      isBuilding = false
    }
  }

  return {
    name: 'dev-panel-plugin',
    async configureServer(server: ViteDevServer) {
      await buildPanel()
      server.watcher.on('change', async (file: string) => {
        if (file.includes('src/') && !file.includes('.test.')) {
          await buildPanel()
          server.ws.send({
            type: 'full-reload',
            path: '/panel.js',
          })
        }
      })
      server.middlewares.use(
        '/panel.js',
        async (_req: Connect.IncomingMessage, res: ServerResponse, _next: Connect.NextFunction) => {
          res.setHeader('Content-Type', 'application/javascript')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(panelContent)
        }
      )
      server.middlewares.use(
        '/liebe.css',
        async (_req: Connect.IncomingMessage, res: ServerResponse, _next: Connect.NextFunction) => {
          res.setHeader('Content-Type', 'text/css')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(cssContent)
        }
      )
      server.middlewares.use(
        '/panel.css',
        async (_req: Connect.IncomingMessage, res: ServerResponse, _next: Connect.NextFunction) => {
          res.setHeader('Content-Type', 'text/css')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(cssContent)
        }
      )
    },
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
    include: ['react', 'react-dom', '@tanstack/react-router', '@radix-ui/themes'],
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

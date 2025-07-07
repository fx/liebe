import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'fs'

// Plugin to inline CSS into the panel.js file
function inlineCSSPlugin() {
  return {
    name: 'inline-css',
    closeBundle() {
      const distPath = resolve(__dirname, 'dist')
      const jsPath = resolve(distPath, 'panel.js')
      const cssPath = resolve(distPath, 'liebe.css')

      if (fs.existsSync(jsPath) && fs.existsSync(cssPath)) {
        const js = fs.readFileSync(jsPath, 'utf-8')
        const css = fs.readFileSync(cssPath, 'utf-8')

        // Create a self-executing function that injects the CSS
        const cssInjector = `
(function() {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
})();
`

        // Prepend CSS injection to the JS bundle
        fs.writeFileSync(jsPath, cssInjector + js)

        // Remove the CSS file as it's now inlined
        fs.unlinkSync(cssPath)
      }
    },
  }
}

export default defineConfig({
  mode: 'production',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': JSON.stringify({}),
    process: JSON.stringify({ env: {} }),
  },
  build: {
    minify: true,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/panel.ts'),
      name: 'Liebe',
      fileName: () => 'panel.js',
      formats: ['iife'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        assetFileNames: '[name][extname]',
        inlineDynamicImports: true,
      },
    },
    cssCodeSplit: false,
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    inlineCSSPlugin(),
  ],
})

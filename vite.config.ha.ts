import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

export default defineConfig({
  mode: 'development',
  define: {
    'process.env.NODE_ENV': JSON.stringify('development'),
    'process.env': JSON.stringify({}),
    process: JSON.stringify({ env: {} }),
  },
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/panel.ts'),
      name: 'Liebe',
      fileName: () => 'panel.js',
      formats: ['iife'],
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        assetFileNames: '[name][extname]',
      },
    },
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
})

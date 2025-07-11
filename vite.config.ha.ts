import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production'

  return {
    mode,
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env': JSON.stringify({ NODE_ENV: mode }),
      process: JSON.stringify({ env: { NODE_ENV: mode } }),
    },
    build: {
      minify: isProduction,
      sourcemap: !isProduction,
      lib: {
        entry: resolve(__dirname, 'src/panel.ts'),
        name: 'Liebe',
        fileName: () => 'panel.js',
        formats: ['iife'],
      },
      outDir: 'dist',
      emptyOutDir: isProduction,
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
    ],
  }
})

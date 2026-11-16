import { defineConfig } from 'vite';

// `vite` serves the example, `vite build` produces the library (excalibur stays external, tiny-sdf is bundled)
export default defineConfig(({ mode }) => ({
  server: {
    open: '/example/'
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => (mode === 'min' ? 'excalibur-sdf-text.min.js' : 'excalibur-sdf-text.js')
    },
    minify: mode === 'min' ? 'esbuild' : false,
    emptyOutDir: mode !== 'min',
    sourcemap: true,
    rollupOptions: {
      external: ['excalibur']
    }
  }
}));

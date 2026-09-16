import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: 'localhost', port: 5186, strictPort: true },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths so the build works under https://<user>.github.io/<repo>/
  base: './',
  server: { port: 5199, strictPort: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});

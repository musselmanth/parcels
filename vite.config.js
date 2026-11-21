import { defineConfig } from 'vite';

export default defineConfig({
  // relative asset paths, so the build works at https://<user>.github.io/parcels/ (or anywhere)
  base: './',
  server: { host: true }, // also reachable from your phone on the same network
});

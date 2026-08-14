import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' keeps asset paths relative so the built site works when served
// from a subpath (e.g. https://anappidea.llc/tiny-planet/) as well as from root.
export default defineConfig({
  base: './',
  plugins: [react()],
});

import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build works both locally and under /cayley-tree/ on GitHub Pages.
  base: './',
  build: { target: 'es2022' },
});

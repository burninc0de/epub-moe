import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/** Short commit of the build, so a deployed copy can be traced back to a revision. */
const resolveBuildCommit = (): string => {
  const fromEnvironment =
    process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.VITE_BUILD_COMMIT;
  if (fromEnvironment) return fromEnvironment.slice(0, 7);

  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return '';
  }
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 800,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  resolve: {
    alias: {
      events: 'events',
    },
  },
  define: {
    global: 'window',
    __AUTO_LOAD_EPUB__: JSON.stringify(process.env.VITE_AUTO_LOAD_EPUB || ''),
    __BUILD_COMMIT__: JSON.stringify(resolveBuildCommit()),
  },
});
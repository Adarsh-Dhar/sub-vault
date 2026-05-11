import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { devvit } from '@devvit/start/vite';
import { fileURLToPath, URL } from 'node:url';

const stripUseClientPlugin = {
  name: 'strip-use-client',
  transform(code: string) {
    if (code.includes("'use client'") || code.includes('"use client"')) {
      const transformedCode = code.replace(/['"]use client['"];?\s*/g, '');
      if (transformedCode !== code) {
        return {
          code: transformedCode,
          map: null,
        };
      }
    }
  },
};

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/client', import.meta.url)),
    },
  },
  plugins: [stripUseClientPlugin, react(), tailwind(), devvit()],
});

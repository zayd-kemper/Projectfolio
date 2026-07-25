import { fileURLToPath } from "url"
import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@tiptap') || id.includes('prosemirror') || id.includes('linkifyjs')) return 'editor-tiptap';
          if (id.includes('@codemirror/lang-javascript') || id.includes('@lezer/javascript')) return 'editor-codemirror-js';
          if (id.includes('@codemirror/lang-css') || id.includes('@lezer/css')) return 'editor-codemirror-css';
          if (id.includes('@codemirror') || id.includes('@uiw/react-codemirror') || id.includes('@uiw/codemirror-extensions-basic-setup')) return 'editor-codemirror';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('decimal.js') || id.includes('victory-vendor')) return 'charts';
          if (id.includes('framer-motion')) return 'motion'; // motion@12 resolves through node_modules/framer-motion internally
          if (id.includes('@hello-pangea')) return 'drag-drop';
          if (id.includes('react-dropzone') || id.includes('file-selector')) return 'upload';
          if (id.includes('@supabase')) return 'supabase';
          if (
            id.includes('react') ||
            id.includes('react-dom') ||
            id.includes('react-router-dom') ||
            id.includes('@remix-run/router') ||
            id.includes('scheduler') ||
            id.includes('prop-types') ||
            id.includes('use-sync-external-store')
          ) return 'react-vendor';
          if (id.includes('axios')) return 'http-client';
          if (id.includes('date-fns')) return 'date-utils';
          if (id.includes('react-hot-toast') || id.includes('goober')) return 'toast';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})

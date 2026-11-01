import { fileURLToPath } from "url"
import path from "path"
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  // Read through loadEnv, not process.env: inside this config file process.env
  // only ever sees shell variables, so a value set in frontend/.env would be
  // silently ignored. loadEnv reads .env files *and* shell vars, so either works.
  const env = loadEnv(mode, __dirname, '');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5000';
  const tunnelHost = env.VITE_TUNNEL_HOST;

  return {
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
    // Vite refuses any request whose Host header isn't localhost or an IP (a
    // DNS-rebinding guard). A tunnel forwards its own hostname, so without this
    // ngrok returns "Blocked request. This host is not allowed."
    allowedHosts: [
      '.ngrok-free.app',
      '.ngrok-free.dev',
      '.ngrok.app',
      '.ngrok.io',
      '.trycloudflare.com',
    ],
    // Over a tunnel the page is https on :443, but HMR would still dial the
    // local port and fail. Only override when actually tunnelling, so plain
    // localhost dev is untouched. Set VITE_TUNNEL_HOST to your tunnel hostname.
    ...(tunnelHost
      ? { hmr: { host: tunnelHost, protocol: 'wss', clientPort: 443 } }
      : {}),
    proxy: {
      // The SPA calls a relative /api (see src/utils/api.js), so this proxy is
      // what lets a single tunnel on :3000 serve the API too — no second tunnel
      // and no CORS, because the browser only ever sees one origin.
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    },
  };
})

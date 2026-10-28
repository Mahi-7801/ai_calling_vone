import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// A browser that reloads the tab, goes to sleep, or loses the network resets the
// TCP connection without a WebSocket close handshake. Vite's proxy treats that
// as an error and prints a full stack ("ws proxy error: read ECONNRESET"),
// which buries the failures that actually need attention. Drop the known-benign
// socket resets and keep everything else.
const BENIGN_SOCKET_CODES = new Set(['ECONNRESET', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'])

function quietBenignSocketResets(): Plugin {
  return {
    name: 'quiet-benign-socket-resets',
    apply: 'serve',
    configureServer(server) {
      const config = server.config
      const original = config.logger.error.bind(config.logger)
      config.logger.error = (msg: string, options?: { error?: Error & { code?: string } }) => {
        const code = options?.error?.code
        if (code && BENIGN_SOCKET_CODES.has(code)) return
        if (code === 'ECONNREFUSED' && /ws proxy/i.test(msg)) return
        original(msg as never, options as never)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), quietBenignSocketResets()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:5000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cvPlugin } from './plugins/cv.ts'

// https://vite.dev/config/
export default defineConfig({
  // `cvPlugin` publishes whichever CV in `files/` is newest and exposes it to
  // the app as `virtual:cv` — see `plugins/cv.ts` for how the pick is made.
  plugins: [react(), cvPlugin()],

  server: {
    // `safe-auth/` is a Java backend in this repo, and in development the safe
    // exhibit talks to it through this proxy rather than straight at
    // localhost:8080. That makes the request same-origin, which means CORS is
    // simply not in the picture while you work -- the backend's own CORS config
    // exists for the deployed case and is not exercised here at all.
    //
    // Nothing listening is the normal state and costs nothing: the proxy fails
    // fast, and the exhibit falls back to its recorded transcript.
    proxy: {
      '/safe-auth': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/safe-auth/, ''),
      },
    },
  },
})

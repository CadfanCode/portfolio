import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cvPlugin } from './plugins/cv.ts'

// https://vite.dev/config/
export default defineConfig({
  // `cvPlugin` publishes whichever CV in `files/` is newest and exposes it to
  // the app as `virtual:cv` — see `plugins/cv.ts` for how the pick is made.
  plugins: [react(), cvPlugin()],
})

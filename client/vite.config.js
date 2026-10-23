import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Exposes to local network (0.0.0.0) for phone / mobile testing
    port: 5173
  }
});

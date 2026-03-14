import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// Custom plugin to generate version.json on build
const generateVersionJSON = () => {
  return {
    name: 'generate-version-json',
    writeBundle(options, bundle) {
      const versionData = {
        version: new Date().getTime().toString(),
        timestamp: new Date().toISOString()
      };
      // output destination inside the defined outDir (usually 'dist')
      fs.writeFileSync(`${options.dir}/version.json`, JSON.stringify(versionData, null, 2));
      console.log('✅ Generated version.json');
    }
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), generateVersionJSON()],

  build: {
    // Target modern browsers — smaller output, no legacy polyfills
    target: 'es2020',

    // Strip console.* calls in production for performance
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.warn', 'console.info'],
      },
    },

    rollupOptions: {
      output: {
        // Manual chunk splitting — each vendor is cached independently
        manualChunks: {
          // React core — tiny, changes never
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],

          // Leaflet + react-leaflet — large, changes rarely
          'vendor-leaflet': ['leaflet', 'react-leaflet'],

          // Supabase — large SDK, changes rarely
          'vendor-supabase': ['@supabase/supabase-js'],

          // Framer Motion — animation library, changes rarely
          'vendor-framer': ['framer-motion'],

          // 3D Engine — huge, only needed on profile
          'vendor-3d': ['three', '@react-three/fiber', '@react-three/drei'],

          // WebRTC — huge, only needed for calls
          'vendor-rtc': ['agora-rtc-sdk-ng'],

          // ML Face Auth — huge, only needed on face login
          'vendor-ml': ['face-api.js'],

          // Extra Heavy UI — dynamically loaded
          'vendor-emoji': ['emoji-picker-react'],
        },
      },
    },

    // Warn when any single chunk exceeds 600kb
    chunkSizeWarningLimit: 600,
  },

  // Optimise deps pre-bundling
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'leaflet', 'react-leaflet', 'framer-motion', 'three', '@react-three/fiber', '@react-three/drei', 'agora-rtc-sdk-ng', 'face-api.js'],
  },
})

import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root:'frontend',
  plugins:[react()],
  build:{
    outDir:'../dist',
    emptyOutDir:true,
    rollupOptions:{output:{manualChunks(id){
      if(id.includes('node_modules/viem')||id.includes('node_modules/ox'))return 'evm';
      if(id.includes('node_modules/genlayer-js'))return 'genlayer';
      if(id.includes('node_modules/react')||id.includes('node_modules/lucide-react'))return 'ui';
    }}},
  },
  server:{host:'127.0.0.1',port:5173,strictPort:true},
});

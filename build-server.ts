import * as esbuild from 'esbuild';
import fs from 'fs';

if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

esbuild.build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/server.cjs',
  external: [
    'express',
    'ccxt',
    'technicalindicators',
    'node-telegram-bot-api',
    'cors',
    'dotenv',
    'fsevents',
    'ws',
    'vite'
  ],
  format: 'cjs',
}).catch(() => process.exit(1));

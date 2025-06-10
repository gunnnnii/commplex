#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get command line arguments
const args = process.argv.slice(2);

// Run ava with tsx
const avaProcess = spawn('node', [
  '--import=tsx/esm',
  '--no-warnings',
  join(__dirname, '..', 'node_modules', 'ava', 'entrypoints', 'cli.mjs'),
  ...args
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    FORCE_COLOR: '0'
  }
});

avaProcess.on('close', (code) => {
  process.exit(code);
});
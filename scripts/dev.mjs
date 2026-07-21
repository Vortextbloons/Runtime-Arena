#!/usr/bin/env node
/**
 * dev.mjs
 * Starts the web dev server and watches shared/badge-definitions.json
 * for changes, re-syncing definitions automatically.
 */

import { spawn } from 'child_process';
import { watch } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const sharedJson = resolve(root, 'shared', 'badge-definitions.json');

// Initial sync
const sync = spawn('node', [resolve(__dirname, 'sync-badge-defs.mjs')], { stdio: 'inherit', cwd: root });
sync.on('close', (code) => {
  if (code !== 0) console.error('sync-defs failed');

  // Start web dev server
  const dev = spawn('npm', ['run', 'dev', '--workspace=@runtime-arena/web'], {
    stdio: 'inherit',
    cwd: root,
    shell: true,
  });

  // Watch shared JSON for changes
  let debounce = null;
  watch(sharedJson, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      console.log('\n[sync-defs] badge-definitions.json changed, regenerating...');
      const re = spawn('node', [resolve(__dirname, 'sync-badge-defs.mjs')], { stdio: 'inherit', cwd: root });
      re.on('close', (c) => {
        if (c === 0) console.log('[sync-defs] done — Vite HMR will pick up changes');
      });
    }, 200);
  });

  dev.on('close', () => process.exit());
});

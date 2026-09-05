#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const isWindows = os.platform() === 'win32';

const content = fs.readFileSync('.env.local', 'utf8');
const lines = content.split(/\r?\n/);

let count = 0;
let skip = 0;

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  
  const key = trimmed.substring(0, eqIdx).trim();
  const value = trimmed.substring(eqIdx + 1).trim();
  
  if (!key || !value) {
    console.log(`SKIP: ${key} (empty value)`);
    skip++;
    continue;
  }
  
  // Use vercel env add <key> <environment>
  // vercel env add reads value from stdin
  const result = spawnSync('npx', ['vercel', 'env', 'add', key, 'production'], {
    input: value,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: isWindows,
    timeout: 30000,
  });
  
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  
  if (result.status === 0 || stdout.includes('Added') || stdout.includes('already')) {
    console.log(`OK: ${key}`);
    count++;
  } else {
    console.log(`FAIL: ${key} - ${stderr || stdout}`);
  }
}

console.log(`\nDone: ${count} added, ${skip} skipped`);

#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const major = Number.parseInt(process.versions.node.split('.')[0], 10);
if (!Number.isFinite(major) || major < 18) {
  console.error('agentic-dev-kit requires Node.js 18 or later. This process is ' + process.version + '.');
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes('--source')) {
  console.error('Do not pass --source to the package entry point. The installed package is the source.');
  process.exit(1);
}
if (args.includes('--update') && !args.includes('--target')) {
  console.error('Usage: npx --yes github:islam-abdallah252/agentic-dev-kit --target <repository> --update');
  process.exit(1);
}
if (!args.includes('--target') && !args.includes('--materialize-cursor')) {
  console.error('Usage: npx --yes github:islam-abdallah252/agentic-dev-kit --target <repository>');
  console.error('       npx --yes github:islam-abdallah252/agentic-dev-kit --target <repository> --update');
  console.error('       npx --yes github:islam-abdallah252/agentic-dev-kit --materialize-cursor');
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [path.join(kitRoot, 'ai', 'install', 'bootstrap.mjs'), '--source', kitRoot, ...args],
  { stdio: 'inherit' }
);
process.exit(result.status === null ? 1 : result.status);

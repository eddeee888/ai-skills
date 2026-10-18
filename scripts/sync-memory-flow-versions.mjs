#!/usr/bin/env node
// Writes the cops and oss plugin versions into the stamp of docs/memory-flow.html.
// CI runs this and fails if the file changes, so a version bump needs a re-render.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'docs', 'memory-flow.html');

const versions = [];
for (const plugin of ['cops', 'oss']) {
  const manifest = join(root, plugin, '.claude-plugin', 'plugin.json');
  let version;
  try {
    version = JSON.parse(readFileSync(manifest, 'utf8')).version;
  } catch (error) {
    console.error(`cannot read ${manifest}: ${error.message}`);
    process.exit(1);
  }
  if (typeof version !== 'string' || version === '') {
    console.error(`${manifest} has no "version" string`);
    process.exit(1);
  }
  versions.push(`${plugin} ${version}`);
}

const html = readFileSync(htmlPath, 'utf8');
const span = /(<span id="versions">)[^<]*(<\/span>)/;
if (!span.test(html)) {
  console.error(`${htmlPath} has no <span id="versions"> to stamp`);
  process.exit(1);
}

// <span id="versions">cops ? · oss ?</span> -> <span id="versions">cops 0.1.34 · oss 0.1.10</span>
const stamped = html.replace(span, (_match, open, close) => `${open}${versions.join(' · ')}${close}`);
if (stamped !== html) {
  writeFileSync(htmlPath, stamped);
}

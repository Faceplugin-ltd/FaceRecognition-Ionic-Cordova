#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

module.exports = function (ctx) {
  const root =
    (ctx && ctx.opts && ctx.opts.projectRoot) ||
    process.argv[2] ||
    process.cwd();
  const src = path.join(root, 'resources', 'android', 'res');
  const dest = path.join(root, 'platforms', 'android', 'app', 'src', 'main', 'res');
  if (!fs.existsSync(src) || !fs.existsSync(path.dirname(dest))) return;
  copyDir(src, dest);
  console.log('[icons] Copied FacePlugin launcher icons into Android res/');
};

if (require.main === module) {
  module.exports(null);
}

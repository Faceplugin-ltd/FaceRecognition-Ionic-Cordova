#!/usr/bin/env node
/**
 * Prepend repo-local or cached Gradle to PATH, then run the remaining args.
 * Usage: node scripts/with-gradle.js cordova run android
 */
const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');

const GRADLE_VERSION = process.env.FACEPLUGIN_GRADLE_VERSION || '8.7';
const ROOT = path.resolve(__dirname, '..');

function findLocalGradle() {
  const candidate = path.join(ROOT, '.tools', `gradle-${GRADLE_VERSION}`, 'bin');
  const exe = path.join(candidate, process.platform === 'win32' ? 'gradle.bat' : 'gradle');
  if (fs.existsSync(exe)) return candidate;

  // Reuse Gradle wrapper dist cache when present (no re-download).
  const dists = path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.gradle',
    'wrapper',
    'dists',
    `gradle-${GRADLE_VERSION}-bin`
  );
  if (fs.existsSync(dists)) {
    for (const hash of fs.readdirSync(dists)) {
      const bin = path.join(dists, hash, `gradle-${GRADLE_VERSION}`, 'bin');
      const g = path.join(bin, process.platform === 'win32' ? 'gradle.bat' : 'gradle');
      if (fs.existsSync(g)) return bin;
    }
  }
  return null;
}

// Ensure portable Gradle exists when nothing is on PATH.
try {
  execSync(process.platform === 'win32' ? 'where gradle' : 'command -v gradle', {
    stdio: 'ignore',
    shell: true,
  });
} catch {
  require('child_process').execSync(`node "${path.join(__dirname, 'ensure-gradle.js')}"`, {
    stdio: 'inherit',
    cwd: ROOT,
  });
}

const localBin = findLocalGradle();
const env = { ...process.env };
if (localBin) {
  env.PATH = `${localBin}${path.delimiter}${env.PATH || ''}`;
  env.GRADLE_HOME = path.dirname(localBin);
}

// Prefer the real user Gradle cache (avoid broken sandbox GRADLE_USER_HOME mirrors).
const realHome = process.env.USERPROFILE || process.env.HOME;
if (realHome) {
  const realCache = path.join(realHome, '.gradle');
  const current = env.GRADLE_USER_HOME || '';
  if (!current || /cursor-sandbox-cache|sandbox/i.test(current)) {
    env.GRADLE_USER_HOME = realCache;
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/with-gradle.js <command> [args...]');
  process.exit(1);
}

const result = spawnSync(args[0], args.slice(1), {
  stdio: 'inherit',
  env,
  cwd: ROOT,
  shell: true,
});
process.exit(result.status == null ? 1 : result.status);

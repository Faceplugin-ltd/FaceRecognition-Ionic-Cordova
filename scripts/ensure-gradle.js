#!/usr/bin/env node
/**
 * Download a portable Gradle distribution into .tools/ so Cordova check_reqs
 * succeeds without requiring Android Studio's bundled Gradle or a system install.
 * Safe for CI and customer machines.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const GRADLE_VERSION = process.env.FACEPLUGIN_GRADLE_VERSION || '8.7';
const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, '.tools');
const GRADLE_HOME = path.join(TOOLS, `gradle-${GRADLE_VERSION}`);
const MARKER = path.join(GRADLE_HOME, 'bin', process.platform === 'win32' ? 'gradle.bat' : 'gradle');

function whichGradle() {
  try {
    execSync(process.platform === 'win32' ? 'where gradle' : 'command -v gradle', {
      stdio: 'ignore',
      shell: true,
    });
    return true;
  } catch {
    return false;
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

async function main() {
  if (fs.existsSync(MARKER)) {
    console.log(`[ensure-gradle] Using ${GRADLE_HOME}`);
    return;
  }
  if (whichGradle() && process.env.FACEPLUGIN_FORCE_GRADLE !== '1') {
    console.log('[ensure-gradle] System Gradle found on PATH — skipping download');
    return;
  }

  fs.mkdirSync(TOOLS, { recursive: true });
  const zipName = `gradle-${GRADLE_VERSION}-bin.zip`;
  const zipPath = path.join(TOOLS, zipName);
  const url = `https://services.gradle.org/distributions/${zipName}`;
  console.log(`[ensure-gradle] Downloading ${url} ...`);
  await download(url, zipPath);

  console.log('[ensure-gradle] Extracting...');
  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${TOOLS.replace(/'/g, "''")}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`unzip -qo "${zipPath}" -d "${TOOLS}"`, { stdio: 'inherit' });
  }
  fs.unlinkSync(zipPath);

  if (!fs.existsSync(MARKER)) {
    throw new Error(`[ensure-gradle] Expected binary missing at ${MARKER}`);
  }
  console.log(`[ensure-gradle] Ready: ${GRADLE_HOME}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

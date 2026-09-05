#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const aar = path.join(root, 'FacePlugin', 'src', 'android', 'facerecognitionsdk.aar');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
}

if (!fs.existsSync(aar)) {
  console.error(
    'Missing FacePlugin/src/android/facerecognitionsdk.aar\n' +
      'Download the Android runtime (see README → Get the runtimes) and place it there.'
  );
  process.exit(1);
}

run('npm run build');
run('npm run plugin:build');

if (!fs.existsSync(path.join(root, 'platforms', 'android'))) {
  run('npx cordova platform add android');
} else {
  console.log('platforms/android already present');
}

const pluginsDir = path.join(root, 'plugins');
if (!fs.existsSync(path.join(pluginsDir, 'cordova-plugin-camera'))) {
  run('npx cordova plugin add cordova-plugin-camera');
}
if (!fs.existsSync(path.join(pluginsDir, 'face-recognition-cordova'))) {
  run('npx cordova plugin add ./FacePlugin --nofetch');
} else {
  console.log('face-recognition-cordova already installed — re-preparing');
}

run('npx cordova prepare android');
console.log('\nAndroid setup complete. Run: npm run android');

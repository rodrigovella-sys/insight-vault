/*
 * Builds the static frontend (CSS/JS) when deploying as a single Node service.
 *
 * Why this exists:
 * - frontend/assets/ is gitignored (build output), so Render won't have app.css/app.js
 *   unless we generate them during deploy.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function run(cmd, args, options) {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const err = new Error(`Command failed: ${cmd} ${args.join(' ')}`);
    err.status = result.status;
    throw err;
  }
}

function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const frontendDir = path.join(repoRoot, 'frontend');
  const frontendPkg = path.join(frontendDir, 'package.json');

  if (!fs.existsSync(frontendPkg)) {
    console.log('[frontend] skip build (frontend/ not present)');
    return;
  }

  const npmCmd = 'npm';
  const useShell = process.platform === 'win32';

  console.log('[frontend] installing deps (including dev)');
  const lockPath = path.join(frontendDir, 'package-lock.json');
  const installArgs = fs.existsSync(lockPath) ? ['ci', '--include=dev'] : ['install', '--include=dev'];

  // Force-install devDependencies even if NODE_ENV=production.
  const env = {
    ...process.env,
    npm_config_production: 'false',
  };

  run(npmCmd, installArgs, { cwd: frontendDir, env, shell: useShell });

  console.log('[frontend] building assets');
  run(npmCmd, ['run', 'build'], { cwd: frontendDir, env, shell: useShell });

  const cssPath = path.join(frontendDir, 'assets', 'css', 'app.css');
  const jsPath = path.join(frontendDir, 'assets', 'js', 'app.js');

  if (!fs.existsSync(cssPath) || !fs.existsSync(jsPath)) {
    console.warn('[frontend] build finished but expected assets are missing:', {
      css: fs.existsSync(cssPath),
      js: fs.existsSync(jsPath),
    });
  } else {
    console.log('[frontend] ✓ assets ready');
  }
}

try {
  main();
} catch (err) {
  console.error('[frontend] build failed:', err);
  process.exit(1);
}

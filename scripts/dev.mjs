// Starts Vite and the Worker (wrangler dev) together, and stops both when either ends.
import {spawn, execSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';

// wrangler refuses to start when the assets directory is missing (a fresh clone has no dist yet).
mkdirSync('dist', {recursive: true});

const run = (name, cmd) => {
  const child = spawn(cmd, {stdio: 'inherit', shell: true});
  child.on('exit', (code) => {
    console.log(`\n[dev] ${name} stopped (${code ?? 'signal'}).`);
    stopAll();
  });
  return child;
};

const children = [run('vite', 'npx vite'), run('worker', 'npx wrangler dev --port 8787')];
let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const c of children) {
    try {
      // shell: true leaves a wrapper process; on Windows only taskkill /T reaches the real one.
      if (process.platform === 'win32') execSync(`taskkill /pid ${c.pid} /T /F`, {stdio: 'ignore'});
      else c.kill('SIGTERM');
    } catch {
      // Already gone.
    }
  }
  process.exit(0);
}
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

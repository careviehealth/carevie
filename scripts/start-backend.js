/**
 * Start the Flask backend from project root (cross-platform).
 * Uses backend/ as cwd so imports and .env work.
 */
const path = require('path');
const { spawn } = require('child_process');

const backendDir = path.join(__dirname, '..', 'backend');
const script = path.join(backendDir, 'app.py');

// Windows: "python"; Unix: "python3"
const cmd = process.platform === 'win32' ? 'python' : 'python3';
const cmdArgs = [script];

const child = spawn(cmd, cmdArgs, {
  cwd: backendDir,
  stdio: 'inherit',
});

child.on('error', (err) => {
  console.error('[start-backend] Failed to start Python:', err.message);
  console.error('Install Python and ensure it is in PATH (Windows: run "py" or add Python to PATH).');
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

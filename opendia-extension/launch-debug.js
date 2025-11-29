const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuration
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EXTENSION_PATH = path.resolve(__dirname, 'dist/chrome');
const USER_DATA_DIR = path.resolve(__dirname, '.chrome-debug-data');

// Ensure directories exist
if (!fs.existsSync(EXTENSION_PATH)) {
  console.error(`❌ Extension path not found: ${EXTENSION_PATH}`);
  console.error('Run "npm run build:chrome" first.');
  process.exit(1);
}

// Create user data dir if it doesn't exist
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

console.log('🚀 Launching Chrome Debug Mode...');
console.log(`📂 Extension: ${EXTENSION_PATH}`);
console.log(`👤 User Data: ${USER_DATA_DIR}`);

const args = [
  `--load-extension=${EXTENSION_PATH}`,
  `--user-data-dir=${USER_DATA_DIR}`,
  '--auto-open-devtools-for-tabs',
  '--no-first-run',
  '--no-default-browser-check',
  'about:blank'
];

console.log(`Command: "${CHROME_PATH}" ${args.join(' ')}`);

const chrome = spawn(CHROME_PATH, args, {
  stdio: 'inherit',
  detached: true
});

chrome.unref();

console.log('✅ Chrome launched!');

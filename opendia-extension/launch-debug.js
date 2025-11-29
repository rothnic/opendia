const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Configuration
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const EXTENSION_PATH = path.resolve(__dirname, 'dist/chrome');
const USER_DATA_DIR = path.resolve(__dirname, '.chrome-debug-data');
const MCP_SERVER_SCRIPT = path.resolve(__dirname, '../opendia-mcp/server.js');
const WS_PORT = 5100;
const HTTP_PORT = 5101;

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

console.log('🚀 Launching OpenDia Debug Environment...');
console.log(`📂 Extension: ${EXTENSION_PATH}`);
console.log(`👤 User Data: ${USER_DATA_DIR}`);
console.log(`📄 Manifest: ${path.join(EXTENSION_PATH, 'manifest.json')}`);

// Start MCP Server
console.log('🔌 Starting MCP Server...');
console.log(`   Ports: WS=${WS_PORT}, HTTP=${HTTP_PORT}`);

const mcpServer = spawn('node', [
  MCP_SERVER_SCRIPT,
  `--ws-port=${WS_PORT}`,
  `--http-port=${HTTP_PORT}`
], {
  stdio: 'inherit',
  cwd: path.dirname(MCP_SERVER_SCRIPT)
});

// Wait for MCP Server to be ready
function waitForServer(retries = 30) {
  return new Promise((resolve, reject) => {
    if (retries === 0) return reject(new Error('MCP Server failed to start'));

    const req = http.get(`http://localhost:${HTTP_PORT}/ports`, (res) => {
      if (res.statusCode === 200) {
        resolve();
      } else {
        setTimeout(() => waitForServer(retries - 1).then(resolve).catch(reject), 500);
      }
    });

    req.on('error', () => {
      setTimeout(() => waitForServer(retries - 1).then(resolve).catch(reject), 500);
    });
    req.end();
  });
}

let chrome;

waitForServer().then(() => {
  console.log('✅ MCP Server is ready!');
  launchChrome();
}).catch((err) => {
  console.error('❌ Failed to start MCP Server:', err);
  cleanup();
});

function launchChrome() {
  console.log('🌐 Launching Chrome...');

  const args = [
    `--load-extension=${EXTENSION_PATH}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--enable-logging',
    '--v=1',
    '--no-first-run',
    '--no-default-browser-check',
    'https://example.com'
  ];

  chrome = spawn(CHROME_PATH, args, {
    stdio: 'ignore',
    detached: false
  });

  chrome.on('exit', (code) => {
    console.log(`Chrome exited with code ${code}`);
    cleanup();
  });

  console.log('✅ Chrome launched!');
  console.log('Press Ctrl+C to stop everything.');
}

function cleanup() {
  console.log('\n🧹 Cleaning up...');
  if (mcpServer) {
    mcpServer.kill();
    console.log('🔌 MCP Server stopped');
  }
  if (chrome) {
    chrome.kill();
    console.log('🌐 Chrome stopped');
  }
  process.exit(0);
}

// Handle termination signals
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

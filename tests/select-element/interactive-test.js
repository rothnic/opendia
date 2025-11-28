/**
 * Interactive test for the select_element tool
 *
 * This test:
 * 1. Starts a local HTTP server to serve test files
 * 2. Launches Chrome with the OpenDia extension
 * 3. Starts the MCP server
 * 4. Opens a test page
 * 5. Calls select_element tool via HTTP POST to the MCP /sse endpoint
 * 6. WAITS for the user to manually select an element
 * 7. Prints the result
 *
 * Usage: npm run test:interactive
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Paths
const EXTENSION_PATH = join(__dirname, '../../opendia-extension/dist/chrome');
const MCP_SERVER_PATH = join(__dirname, '../../opendia-mcp');
const TEST_PAGE_PATH = join(__dirname, 'test-page.html');

// Ports
const HTTP_PORT = 9877; // serves test files
const MCP_HTTP_PORT = 5556; // MCP server HTTP/SSE port (server.js defaults to 5556)

// Timeouts
const EXTENSION_CONNECT_TIMEOUT = 20000; // wait for extension to register
const TOOL_CALL_TIMEOUT = 120000; // 2 minutes for user interaction

class TestRunner {
  constructor() {
    this.httpServer = null;
    this.mcpProcess = null;
    this.browser = null;
  }

  async startHttpServer() {
    return new Promise((resolve) => {
      this.httpServer = createServer((req, res) => {
        // Enable CORS for all requests
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        let filePath;
        let contentType;

        if (req.url === '/' || req.url === '/test-page.html') {
          filePath = TEST_PAGE_PATH;
          contentType = 'text/html';
        } else {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        try {
          const content = readFileSync(filePath);
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        } catch (err) {
          res.writeHead(500);
          res.end('Error reading file: ' + err.message);
        }
      });

      this.httpServer.listen(HTTP_PORT, () => {
        console.log(`✅ HTTP server started on http://localhost:${HTTP_PORT}`);
        resolve();
      });
    });
  }

  async startMcpServer() {
    return new Promise((resolve, reject) => {
      console.log('Starting MCP server...');

      this.mcpProcess = spawn('node', ['server.js'], {
        cwd: MCP_SERVER_PATH,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderrBuffer = '';
      let stdoutBuffer = '';

      const onReady = (source, data) => {
        const text = data.toString();
        if (source === 'stderr') stderrBuffer += text; else stdoutBuffer += text;
        console.log(`[MCP ${source}]`, text.trim());

        // server.js logs readiness messages to stderr (console.error)
        if (stderrBuffer.includes('HTTP/SSE server running') || stderrBuffer.includes('SSE endpoint:') || stderrBuffer.includes('HTTP/SSE server running on port')) {
          // Give it a moment to fully bind
          setTimeout(resolve, 300);
        }
      };

      this.mcpProcess.stderr.on('data', (data) => onReady('stderr', data));
      this.mcpProcess.stdout.on('data', (data) => onReady('stdout', data));

      this.mcpProcess.on('error', (err) => {
        console.error('[MCP ERROR]', err);
        reject(err);
      });

      // Fallback resolve after timeout
      setTimeout(() => {
        // If we didn't already resolve, try to proceed (useful in CI)
        resolve();
      }, 5000);
    });
  }

  async launchBrowser() {
    console.log('Launching browser with extension...');
    console.log('Extension path:', EXTENSION_PATH);

    if (!existsSync(EXTENSION_PATH)) {
      throw new Error(`Extension not found at ${EXTENSION_PATH}. Run 'npm run build:chrome' first.`);
    }

    // Create a temporary user data directory
    const userDataDir = join(__dirname, '.chrome-user-data-interactive');

    this.browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
      viewport: { width: 1280, height: 720 },
    });

    console.log('✅ Browser launched with extension');
    return this.browser;
  }

  async waitForExtensionRegistration() {
    const start = Date.now();
    const url = `http://localhost:${MCP_HTTP_PORT}/health`;

    while (Date.now() - start < EXTENSION_CONNECT_TIMEOUT) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          await new Promise(r => setTimeout(r, 250));
          continue;
        }
        const body = await res.json();
        console.log('[MCP HEALTH]', body);
        if (body.chromeExtensionConnected && body.availableTools && body.availableTools > 0) {
          return true;
        }
      } catch (err) {
        // ignore and retry
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Timeout waiting for browser extension to register with MCP server');
  }

  async callSelectElement() {
    const requestId = Date.now();
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: 'select_element',
        arguments: {}
      }
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TOOL_CALL_TIMEOUT);

    try {
      const res = await fetch(`http://localhost:${MCP_HTTP_PORT}/sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeout);
      const body = await res.json();
      if (body.error) {
        throw new Error(body.error.message || JSON.stringify(body.error));
      }
      return body.result;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Timeout waiting for select_element response');
      throw err;
    }
  }

  async cleanup() {
    console.log('\nCleaning up...');

    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (e) {
      console.warn('Error closing browser', e.message);
    }

    if (this.mcpProcess) {
      try {
        this.mcpProcess.kill();
      } catch (e) {
        console.warn('Error killing MCP process', e.message);
      }
    }

    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch (e) {
        console.warn('Error closing HTTP server', e.message);
      }
    }

    console.log('✅ Cleanup complete');
  }

  async run() {
    try {
      console.log('\n🧪 Starting INTERACTIVE select_element test\n');
      console.log('='.repeat(50));

      // Verify test files exist
      if (!existsSync(TEST_PAGE_PATH)) {
        throw new Error(`Test page not found: ${TEST_PAGE_PATH}`);
      }

      // Step 1: Start HTTP server
      await this.startHttpServer();

      // Step 2: Start MCP server
      await this.startMcpServer();

      // Step 3: Launch browser with extension
      await this.launchBrowser();

      // Give the extension a moment to connect to MCP server
      console.log('\nWaiting for extension to connect and register tools...');
      await this.waitForExtensionRegistration();
      console.log('✅ Extension registered');

      // Step 4: Open test page
      const page = this.browser.pages()[0] || await this.browser.newPage();
      await page.goto(`http://localhost:${HTTP_PORT}/test-page.html`);
      console.log('✅ Test page loaded');

      // Step 5: Call select_element tool and wait for user
      console.log('\nCalling select_element tool...');
      console.log('👉 PLEASE GO TO THE BROWSER WINDOW AND SELECT AN ELEMENT!');
      console.log('   (You have 60 seconds)');

      // Start the tool call (it returns a promise)
      const toolCallPromise = this.callSelectElement();

      // Wait for the overlay to appear (indicating tool is ready)
      console.log('Waiting for selection overlay...');
      await page.waitForSelector('#opendia-selection-overlay', { state: 'attached', timeout: 5000 });
      console.log('✅ Selection overlay appeared - READY FOR INTERACTION');

      // Await the tool result
      console.log('Waiting for your selection...');
      const result = await toolCallPromise;

      // Parse and display the result cleanly
      console.log('\n' + '='.repeat(70));
      console.log('🎉 SELECTION RECEIVED!');
      console.log('='.repeat(70));

      const content = result.content[0].text;
      const data = JSON.parse(content);

      console.log('\n📊 ELEMENT DATA (What the agent receives):');
      console.log('─'.repeat(70));
      console.log(`Tag:        ${data.tagName}`);
      console.log(`ID:         ${data.id || '(none)'}`);
      console.log(`Classes:    ${data.classes.length > 0 ? data.classes.join(', ') : '(none)'}`);
      console.log(`CSS Path:   ${data.path}`);
      console.log(`Text:       ${data.textContent.substring(0, 100)}${data.textContent.length > 100 ? '...' : ''}`);

      console.log('\n🏷️  ATTRIBUTES:');
      console.log('─'.repeat(70));
      Object.entries(data.attributes).forEach(([key, value]) => {
        const displayValue = value.length > 60 ? value.substring(0, 60) + '...' : value;
        console.log(`  ${key.padEnd(20)} = ${displayValue}`);
      });

      if (data.parent) {
        console.log('\n👨‍👦 PARENT ELEMENT:');
        console.log('─'.repeat(70));
        console.log(`  Tag:      ${data.parent.tagName}`);
        console.log(`  ID:       ${data.parent.id || '(none)'}`);
        console.log(`  Classes:  ${data.parent.classes.length > 0 ? data.parent.classes.join(', ') : '(none)'}`);
      }

      console.log('\n📝 HTML SNIPPET:');
      console.log('─'.repeat(70));
      const htmlLines = data.html.split('\n').slice(0, 5);
      htmlLines.forEach(line => console.log(`  ${line}`));
      if (data.html.split('\n').length > 5) {
        console.log('  ...');
      }

      console.log('\n' + '='.repeat(70));
      console.log('💡 The agent can use this data to:');
      console.log('   • Understand what element was selected');
      console.log('   • Build a selector to target it (via ID, class, or CSS path)');
      console.log('   • See the element\'s context (parent, attributes)');
      console.log('   • Read the element\'s content');
      console.log('='.repeat(70));

      // Keep browser open for a few seconds so user can see result in console if they want
      console.log('\nClosing in 10 seconds...');
      await new Promise(r => setTimeout(r, 10000));

    } catch (error) {
      console.error('\n❌ TEST FAILED:', error.message);
      process.exitCode = 1;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test
const runner = new TestRunner();
runner.run();

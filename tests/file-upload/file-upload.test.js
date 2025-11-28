/**
 * E2E test for the file_upload tool
 *
 * This test:
 * 1. Starts a local HTTP server to serve test files
 * 2. Launches Chrome with the OpenDia extension
 * 3. Starts the MCP server
 * 4. Opens a test page with a file input
 * 5. Calls file_upload tool via HTTP POST to the MCP /sse endpoint
 * 6. Verifies the file was injected successfully
 *
 * Usage: npm test
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
const TEST_PDF_PATH = join(__dirname, 'test-file.pdf');

// Ports
const HTTP_PORT = 9876; // serves test files
const MCP_HTTP_PORT = 5556; // MCP server HTTP/SSE port (server.js defaults to 5556)

// Timeouts
const EXTENSION_CONNECT_TIMEOUT = 20000; // wait for extension to register
const TOOL_CALL_TIMEOUT = 30000;

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
        } else if (req.url === '/test-file.pdf') {
          filePath = TEST_PDF_PATH;
          contentType = 'application/pdf';
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
        if (stderrBuffer.includes('HTTP/SSE server running') || stderrBuffer.includes('SSE endpoint:') || stderrBuffer.includes('HTTP/SSE server running on port') || stderrBuffer.includes('HTTP/SSE server running on port')) {
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
    const userDataDir = join(__dirname, '.chrome-user-data');

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
          // Optionally verify the file_upload tool exists by calling tools/list
          // We'll do an HTTP tools/list call to be sure
          try {
            const listRes = await fetch(`http://localhost:${MCP_HTTP_PORT}/sse`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/list', params: {} })
            });
            const listBody = await listRes.json();
            const tools = listBody.result?.tools || [];
            const hasFileUpload = tools.some(t => t.name === 'file_upload');
            console.log('[TOOLS LIST]', tools.map(t => t.name));
            if (hasFileUpload) return tools;
          } catch (e) {
            // ignore and continue polling
            console.warn('tools/list check failed', e.message);
          }
        }
      } catch (err) {
        // ignore and retry
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Timeout waiting for browser extension to register with MCP server');
  }

  async callFileUpload(fileUrl, fileName, fileSelector = 'input[type="file"]') {
    const requestId = Date.now();
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: 'file_upload',
        arguments: {
          file_url: fileUrl,
          file_name: fileName,
          file_selector: fileSelector,
        }
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
      // body has shape: { jsonrpc, id, result } where result is the tool call result (content/isError)
      if (body.error) {
        throw new Error(body.error.message || JSON.stringify(body.error));
      }
      return body.result;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Timeout waiting for file_upload response');
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
      console.log('\n🧪 Starting file_upload E2E test\n');
      console.log('='.repeat(50));

      // Verify test files exist
      if (!existsSync(TEST_PAGE_PATH)) {
        throw new Error(`Test page not found: ${TEST_PAGE_PATH}`);
      }
      if (!existsSync(TEST_PDF_PATH)) {
        console.log('Creating test PDF file...');
        // Create a minimal PDF
        const pdfContent = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF';
        require('fs').writeFileSync(TEST_PDF_PATH, pdfContent);
      }

      // Step 1: Start HTTP server
      await this.startHttpServer();

      // Step 2: Start MCP server
      await this.startMcpServer();

      // Step 3: Launch browser with extension
      await this.launchBrowser();

      // Give the extension a moment to connect to MCP server
      console.log('\nWaiting for extension to connect and register tools...');
      const tools = await this.waitForExtensionRegistration();
      console.log('✅ Extension registered tools:', tools.map(t => t.name));

      // Step 4: Open test page
      const page = this.browser.pages()[0] || await this.browser.newPage();
      await page.goto(`http://localhost:${HTTP_PORT}/test-page.html`);
      console.log('✅ Test page loaded');

      // Step 5: Call file_upload
      console.log('\nCalling file_upload tool...');
      const result = await this.callFileUpload(
        `http://localhost:${HTTP_PORT}/test-file.pdf`,
        'test-resume.pdf',
        '#file-input'
      );

      console.log('file_upload HTTP response result:', result);

      // Step 6: Verify file was uploaded
      await page.waitForTimeout(1000);
      const resultText = await page.$eval('#result', el => el.textContent);
      console.log('\nResult on page:', resultText);

      if (resultText && resultText.includes('SUCCESS')) {
        console.log('\n✅ TEST PASSED: File was successfully uploaded!');
      } else {
        console.log('\n❌ TEST FAILED: File was not uploaded');
        console.log('Expected #result to contain "SUCCESS", got:', resultText);
        process.exitCode = 1;
      }

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

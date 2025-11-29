/**
 * Test for comprehensive page_structure
 * Tests: unified structure, selector generation, pagination, and grouping
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = join(__dirname, '../../opendia-extension/dist/chrome');
const MCP_SERVER_PATH = join(__dirname, '../../opendia-mcp');
const TEST_REPEATED_PATH = join(__dirname, 'test-repeated.html');
const HTTP_PORT = 9881;
const MCP_HTTP_PORT = 5556;

class ComprehensiveTestRunner {
  constructor() {
    this.httpServer = null;
    this.mcpProcess = null;
    this.browser = null;
  }

  async startHttpServer() {
    return new Promise((resolve) => {
      this.httpServer = createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }
        const content = readFileSync(TEST_REPEATED_PATH);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      });
      this.httpServer.listen(HTTP_PORT, () => resolve());
    });
  }

  async startMcpServer() {
    return new Promise((resolve) => {
      this.mcpProcess = spawn('node', ['server.js'], {
        cwd: MCP_SERVER_PATH,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      let stderrBuffer = '';
      this.mcpProcess.stderr.on('data', (data) => {
        stderrBuffer += data.toString();
        if (stderrBuffer.includes('HTTP/SSE server running')) {
          setTimeout(resolve, 300);
        }
      });
      setTimeout(resolve, 5000);
    });
  }

  async launchBrowser() {
    const userDataDir = join(__dirname, '.chrome-user-data-comprehensive');
    this.browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
      viewport: { width: 1280, height: 720 },
    });
    return this.browser;
  }

  async waitForExtension() {
    const start = Date.now();
    while (Date.now() - start < 20000) {
      try {
        const res = await fetch(`http://localhost:${MCP_HTTP_PORT}/health`);
        if (res.ok) {
          const body = await res.json();
          if (body.chromeExtensionConnected) return true;
        }
      } catch (err) {}
      await new Promise(r => setTimeout(r, 500));
    }
    return false;
  }

  async callTool(args = {}) {
    const res = await fetch(`http://localhost:${MCP_HTTP_PORT}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'page_structure',
          arguments: args
        }
      })
    });
    const body = await res.json();
    if (body.error) throw new Error(body.error.message);
    return body.result;
  }

  async cleanup() {
    try {
      if (this.browser) await this.browser.close();
      if (this.mcpProcess) this.mcpProcess.kill();
      if (this.httpServer) this.httpServer.close();
    } catch (e) {}
  }

  async run() {
    try {
      console.log('\n🧪 Testing Comprehensive Page Structure\n');
      console.log('='.repeat(70));

      await this.startHttpServer();
      await this.startMcpServer();
      await this.launchBrowser();
      await this.waitForExtension();

      const page = this.browser.pages()[0] || await this.browser.newPage();
      await page.goto(`http://localhost:${HTTP_PORT}`);

      // Test 1: Comprehensive Analysis
      console.log('\n📊 TEST 1: Comprehensive Analysis');
      console.log('-'.repeat(70));
      const result = await this.callTool({});
      const raw = result.content[0].text;
      console.log('Raw output preview:\n');
      console.log(raw.split('\n').slice(0, 30).join('\n'));

      // Validation
      if (raw.includes('=== DETECTED REPEATED GROUPS')) console.log('\n✅ Detected repeated groups');
      if (raw.includes('Selector:')) console.log('✅ Generated selectors');
      if (raw.includes('Schema:')) console.log('✅ Generated schema');
      if (raw.includes('@root/')) console.log('✅ Generated unique IDs');

      // Test 2: Selector Verification
      console.log('\n\n🎯 TEST 2: Selector Verification');
      console.log('-'.repeat(70));
      // Extract selector from output (strictly single line)
      const selectorMatch = raw.match(/Selector: ([^\r\n]+)/);
      if (selectorMatch) {
        const selector = selectorMatch[1].trim();
        console.log(`Testing selector: "${selector}"`);

        if (selector.length > 100) {
          console.log('⚠️ Selector seems too long, skipping verification');
        } else {
          // Verify selector works in browser
          const count = await page.evaluate((sel) => document.querySelectorAll(sel).length, selector);
          console.log(`Found ${count} elements with selector`);
          if (count > 0) console.log('✅ Selector is valid and working');
          else console.log('❌ Selector failed to find elements');
        }
      }

      console.log('\n' + '='.repeat(70));
      console.log('✅ ALL TESTS COMPLETE');

    } catch (error) {
      console.error('\n❌ TEST FAILED:', error.message);
      console.error(error.stack);
      process.exitCode = 1;
    } finally {
      await this.cleanup();
    }
  }
}

const runner = new ComprehensiveTestRunner();
runner.run();

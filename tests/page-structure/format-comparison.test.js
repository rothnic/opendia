/**
 * Test script to compare compact vs JSON format efficiency
 *
 * This test:
 * 1. Calls page_structure with both formats
 * 2. Measures and compares response sizes
 * 3. Validates the compact format is readable
 * 4. Tests on multiple pages
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXTENSION_PATH = join(__dirname, '../../opendia-extension/dist/chrome');
const MCP_SERVER_PATH = join(__dirname, '../../opendia-mcp');
const TEST_REPEATED_PATH = join(__dirname, 'test-repeated.html');

const HTTP_PORT = 9879;
const MCP_HTTP_PORT = 5556;
const EXTENSION_CONNECT_TIMEOUT = 20000;
const TOOL_CALL_TIMEOUT = 30000;

class FormatTestRunner {
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

        try {
          const content = readFileSync(TEST_REPEATED_PATH);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
        } catch (err) {
          res.writeHead(500);
          res.end('Error');
        }
      });

      this.httpServer.listen(HTTP_PORT, () => {
        console.log(`✅ HTTP server started`);
        resolve();
      });
    });
  }

  async startMcpServer() {
    return new Promise((resolve) => {
      this.mcpProcess = spawn('node', ['server.js'], {
        cwd: MCP_SERVER_PATH,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stderrBuffer = '';
      const onReady = (source, data) => {
        const text = data.toString();
        if (source === 'stderr') stderrBuffer += text;
        if (stderrBuffer.includes('HTTP/SSE server running')) {
          setTimeout(resolve, 300);
        }
      };

      this.mcpProcess.stderr.on('data', (data) => onReady('stderr', data));
      this.mcpProcess.stdout.on('data', (data) => onReady('stdout', data));
      setTimeout(resolve, 5000);
    });
  }

  async launchBrowser() {
    if (!existsSync(EXTENSION_PATH)) {
      throw new Error(`Extension not found at ${EXTENSION_PATH}`);
    }

    const userDataDir = join(__dirname, '.chrome-user-data-format');
    this.browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
      ],
      viewport: { width: 1280, height: 720 },
    });

    return this.browser;
  }

  async waitForExtensionRegistration() {
    const start = Date.now();
    while (Date.now() - start < EXTENSION_CONNECT_TIMEOUT) {
      try {
        const res = await fetch(`http://localhost:${MCP_HTTP_PORT}/health`);
        if (res.ok) {
          const body = await res.json();
          if (body.chromeExtensionConnected && body.availableTools > 0) {
            return true;
          }
        }
      } catch (err) {}
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Timeout');
  }

  async callPageStructure(format = 'compact') {
    const payload = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'page_structure',
        arguments: { format }
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
      if (body.error) throw new Error(body.error.message);
      return body.result;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Timeout');
      throw err;
    }
  }

  async cleanup() {
    try {
      if (this.browser) await this.browser.close();
    } catch (e) {}
    if (this.mcpProcess) {
      try { this.mcpProcess.kill(); } catch (e) {}
    }
    if (this.httpServer) {
      try { this.httpServer.close(); } catch (e) {}
    }
  }

  async run() {
    try {
      console.log('\n🧪 Format Efficiency Comparison Test\n');
      console.log('='.repeat(70));

      await this.startHttpServer();
      await this.startMcpServer();
      await this.launchBrowser();
      await this.waitForExtensionRegistration();

      const page = this.browser.pages()[0] || await this.browser.newPage();
      await page.goto(`http://localhost:${HTTP_PORT}`);
      console.log('✅ Loaded test page\n');

      // Test 1: Compact format
      console.log('📊 TEST 1: Compact Format');
      console.log('-'.repeat(70));
      const compactResult = await this.callPageStructure('compact');
      const compactData = JSON.parse(compactResult.content[0].text);
      const compactSize = JSON.stringify(compactData).length;
      const compactTextSize = compactData.text.length;

      console.log(`Response size: ${compactSize.toLocaleString()} bytes`);
      console.log(`Text content size: ${compactTextSize.toLocaleString()} bytes`);
      console.log(`\nFirst 20 lines of compact output:`);
      const lines = compactData.text.split('\n');
      console.log(lines.slice(0, 20).join('\n'));
      console.log(`... (${lines.length - 20} more lines)\n`);

      // Test 2: JSON format
      console.log('📊 TEST 2: JSON Format');
      console.log('-'.repeat(70));
      const jsonResult = await this.callPageStructure('json');
      const jsonData = JSON.parse(jsonResult.content[0].text);
      const jsonSize = JSON.stringify(jsonData).length;

      console.log(`Response size: ${jsonSize.toLocaleString()} bytes`);
      console.log(`Outline size: ${JSON.stringify(jsonData.outline).length.toLocaleString()} bytes\n`);

      // Comparison
      console.log('📈 EFFICIENCY COMPARISON');
      console.log('='.repeat(70));
      const reduction = ((1 - compactSize / jsonSize) * 100).toFixed(1);
      console.log(`Compact format: ${compactSize.toLocaleString()} bytes`);
      console.log(`JSON format:    ${jsonSize.toLocaleString()} bytes`);
      console.log(`Size reduction: ${reduction}% smaller with compact format`);

      if (parseFloat(reduction) > 30) {
        console.log('\n✅ Compact format is significantly more efficient!');
      } else {
        console.log('\n⚠️  Compact format should provide better compression');
      }

      // Test 3: GitHub comparison
      console.log('\n📊 TEST 3: Real Website (GitHub)');
      console.log('-'.repeat(70));
      await page.goto('https://github.com');
      await page.waitForLoadState('load');
      await page.waitForTimeout(1000);

      const githubCompact = await this.callPageStructure('compact');
      const githubCompactData = JSON.parse(githubCompact.content[0].text);
      const githubCompactSize = JSON.stringify(githubCompactData).length;

      const githubJson = await this.callPageStructure('json');
      const githubJsonData = JSON.parse(githubJson.content[0].text);
      const githubJsonSize = JSON.stringify(githubJsonData).length;

      const githubReduction = ((1 - githubCompactSize / githubJsonSize) * 100).toFixed(1);

      console.log(`GitHub compact: ${githubCompactSize.toLocaleString()} bytes`);
      console.log(`GitHub JSON:    ${githubJsonSize.toLocaleString()} bytes`);
      console.log(`Reduction:      ${githubReduction}%`);

      console.log('\n' + '='.repeat(70));
      console.log('✅ ALL FORMAT TESTS COMPLETE');

    } catch (error) {
      console.error('\n❌ TEST FAILED:', error.message);
      process.exitCode = 1;
    } finally {
      await this.cleanup();
    }
  }
}

const runner = new FormatTestRunner();
runner.run();

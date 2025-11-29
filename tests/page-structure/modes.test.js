/**
 * Test for new page_structure modes
 * Tests: navigation, scraping, and toon modes
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
const HTTP_PORT = 9880;
const MCP_HTTP_PORT = 5556;

class ModesTestRunner {
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
    const userDataDir = join(__dirname, '.chrome-user-data-modes');
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

  async callTool(mode) {
    const res = await fetch(`http://localhost:${MCP_HTTP_PORT}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: 'page_structure',
          arguments: { mode }
        }
      })
    });
    const body = await res.json();
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
      console.log('\n🧪 Testing Page Structure Modes\n');
      console.log('='.repeat(70));

      await this.startHttpServer();
      await this.startMcpServer();
      await this.launchBrowser();
      await this.waitForExtension();

      const page = this.browser.pages()[0] || await this.browser.newPage();
      await page.goto(`http://localhost:${HTTP_PORT}`);

      // Test Navigation Mode
      console.log('\n📍 NAVIGATION MODE');
      console.log('-'.repeat(70));
      const navResult = await this.callTool('navigation');
      const navRaw = navResult.content[0].text;
      console.log('Raw response (first 500 chars):', navRaw.substring(0, 500));
      const navData = JSON.parse(navRaw);
      console.log(navData.text.split('\n').slice(0, 20).join('\n'));
      console.log(`\nTotal interactive: ${navData.totalInteractive}`);
      console.log(`In viewport: ${navData.inViewport}`);

      // Test Scraping Mode
      console.log('\n\n🗂️  SCRAPING MODE');
      console.log('-'.repeat(70));
      const scrapingResult = await this.callTool('scraping');
      const scrapingData = JSON.parse(scrapingResult.content[0].text);
      console.log(scrapingData.text.split('\n').slice(0, 15).join('\n'));
      console.log(`\nTotal groups: ${scrapingData.totalGroups}`);

      // Test TOON Mode
      console.log('\n\n📊 TOON MODE');
      console.log('-'.repeat(70));
      const toonResult = await this.callTool('toon');
      const toonData = JSON.parse(toonResult.content[0].text);
      console.log(toonData.text.split('\n').slice(0, 25).join('\n'));
      console.log(`\n... (${toonData.totalElements} total elements)`);

      console.log('\n' + '='.repeat(70));
      console.log('✅ ALL MODES TESTED');

    } catch (error) {
      console.error('\n❌ TEST FAILED:', error.message);
      console.error(error.stack);
      process.exitCode = 1;
    } finally {
      await this.cleanup();
    }
  }
}

const runner = new ModesTestRunner();
runner.run();

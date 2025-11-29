/**
 * E2E test for the page_structure tool
 *
 * This test:
 * 1. Tests with simple page structure
 * 2. Tests with repeated elements (should group them)
 * 3. Tests with a real complex webpage (GitHub)
 * 4. Validates the structure matches expectations
 * 5. Tests budget limits
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
const TEST_SIMPLE_PATH = join(__dirname, 'test-simple.html');
const TEST_REPEATED_PATH = join(__dirname, 'test-repeated.html');

// Ports
const HTTP_PORT = 9878; // serves test files
const MCP_HTTP_PORT = 5556; // MCP server HTTP/SSE port

// Timeouts
const EXTENSION_CONNECT_TIMEOUT = 20000;
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
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        let filePath;
        let contentType;

        if (req.url === '/simple' || req.url === '/test-simple.html') {
          filePath = TEST_SIMPLE_PATH;
          contentType = 'text/html';
        } else if (req.url === '/repeated' || req.url === '/test-repeated.html') {
          filePath = TEST_REPEATED_PATH;
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

      const onReady = (source, data) => {
        const text = data.toString();
        if (source === 'stderr') stderrBuffer += text;
        console.log(`[MCP ${source}]`, text.trim());

        if (stderrBuffer.includes('HTTP/SSE server running')) {
          setTimeout(resolve, 300);
        }
      };

      this.mcpProcess.stderr.on('data', (data) => onReady('stderr', data));
      this.mcpProcess.stdout.on('data', (data) => onReady('stdout', data));

      this.mcpProcess.on('error', (err) => {
        console.error('[MCP ERROR]', err);
        reject(err);
      });

      setTimeout(resolve, 5000);
    });
  }

  async launchBrowser() {
    console.log('Launching browser with extension...');

    if (!existsSync(EXTENSION_PATH)) {
      throw new Error(`Extension not found at ${EXTENSION_PATH}. Run 'npm run build:chrome' first.`);
    }

    const userDataDir = join(__dirname, '.chrome-user-data');

    this.browser = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--disable-default-apps',
      ],
      viewport: { width: 1280, height: 720 },
    });

    console.log('✅ Browser launched');
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
        if (body.chromeExtensionConnected && body.availableTools && body.availableTools > 0) {
          return true;
        }
      } catch (err) {
        // ignore
      }
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error('Timeout waiting for extension registration');
  }

  async callPageStructure(options = {}) {
    // Request JSON format explicitly for testing
    const args = { format: 'json', ...options };
    const requestId = Date.now();
    const payload = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: 'page_structure',
        arguments: args
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
      if (err.name === 'AbortError') throw new Error('Timeout');
      throw err;
    }
  }

  async cleanup() {
    console.log('\nCleaning up...');

    try {
      if (this.browser) await this.browser.close();
    } catch (e) {
      console.warn('Error closing browser', e.message);
    }

    if (this.mcpProcess) {
      try {
        this.mcpProcess.kill();
      } catch (e) {}
    }

    if (this.httpServer) {
      try {
        this.httpServer.close();
      } catch (e) {}
    }

    console.log('✅ Cleanup complete');
  }

  countNodes(node) {
    if (!node) return 0;
    if (node.kind === 'repeated_group') {
      return 1 + node.examples.reduce((sum, ex) => sum + this.countNodes(ex), 0);
    }
    return 1 + (node.children || []).reduce((sum, child) => sum + this.countNodes(child), 0);
  }

  findRepeatedGroups(node, groups = []) {
    if (!node) return groups;
    if (node.kind === 'repeated_group') {
      groups.push(node);
      node.examples.forEach(ex => this.findRepeatedGroups(ex, groups));
    } else {
      (node.children || []).forEach(child => this.findRepeatedGroups(child, groups));
    }
    return groups;
  }

  async run() {
    let failedTests = 0;

    try {
      console.log('\n🧪 Starting page_structure E2E tests\n');
      console.log('='.repeat(70));

      // Verify test files exist
      if (!existsSync(TEST_SIMPLE_PATH)) {
        throw new Error(`Test page not found: ${TEST_SIMPLE_PATH}`);
      }
      if (!existsSync(TEST_REPEATED_PATH)) {
        throw new Error(`Test page not found: ${TEST_REPEATED_PATH}`);
      }

      await this.startHttpServer();
      await this.startMcpServer();
      await this.launchBrowser();

      console.log('\nWaiting for extension...');
      await this.waitForExtensionRegistration();
      console.log('✅ Extension registered');

      const page = this.browser.pages()[0] || await this.browser.newPage();

      // TEST 1: Simple page structure
      console.log('\n' + '='.repeat(70));
      console.log('📝 TEST 1: Simple page structure');
      console.log('='.repeat(70));

      await page.goto(`http://localhost:${HTTP_PORT}/simple`);
      console.log('✅ Loaded simple test page');

      const result1 = await this.callPageStructure();
      const data1 = JSON.parse(result1.content[0].text);

      console.log('\nStructure stats:');
      console.log(`  URL: ${data1.stats.url}`);
      console.log(`  Total nodes: ${this.countNodes(data1.outline)}`);

      // Validate landmarks
      const hasHeader = JSON.stringify(data1.outline).includes('"tag":"header"');
      const hasNav = JSON.stringify(data1.outline).includes('"tag":"nav"');
      const hasMain = JSON.stringify(data1.outline).includes('"tag":"main"');
      const hasFooter = JSON.stringify(data1.outline).includes('"tag":"footer"');

      if (hasHeader && hasNav && hasMain && hasFooter) {
        console.log('✅ All landmarks detected (header, nav, main, footer)');
      } else {
        console.log('❌ Missing landmarks:');
        if (!hasHeader) console.log('  - header');
        if (!hasNav) console.log('  - nav');
        if (!hasMain) console.log('  - main');
        if (!hasFooter) console.log('  - footer');
        failedTests++;
      }

      // TEST 2: Repeated elements grouping
      console.log('\n' + '='.repeat(70));
      console.log('📝 TEST 2: Repeated elements grouping');
      console.log('='.repeat(70));

      await page.goto(`http://localhost:${HTTP_PORT}/repeated`);
      console.log('✅ Loaded repeated elements test page');

      const result2 = await this.callPageStructure();
      const data2 = JSON.parse(result2.content[0].text);

      const groups = this.findRepeatedGroups(data2.outline);
      console.log(`\n  Found ${groups.length} repeated group(s)`);

      if (groups.length > 0) {
        groups.forEach((group, idx) => {
          console.log(`\n  Group ${idx + 1}:`);
          console.log(`    Signature: ${group.signature}`);
          console.log(`    Total: ${group.total}`);
          console.log(`    Shown: ${group.shown}`);
          console.log(`    Omitted: ${group.omitted}`);
        });

        // We have 10 product cards, should be grouped
        const productGroup = groups.find(g => g.total === 10);
        if (productGroup) {
          console.log('\n✅ Product cards correctly grouped (10 total)');
          console.log(`   Showing ${productGroup.shown} examples, omitting ${productGroup.omitted}`);
        } else {
          console.log('\n❌ Expected to find group with 10 product cards');
          failedTests++;
        }
      } else {
        console.log('\n❌ No repeated groups found (expected at least 1)');
        failedTests++;
      }

      // TEST 3: Budget limits
      console.log('\n' + '='.repeat(70));
      console.log('📝 TEST 3: Budget limits');
      console.log('='.repeat(70));

      const result3 = await this.callPageStructure({ max_nodes: 50 });
      const data3 = JSON.parse(result3.content[0].text);
      const nodeCount = this.countNodes(data3.outline);

      console.log(`\n  Requested max_nodes: 50`);
      console.log(`  Actual nodes: ${nodeCount}`);

      if (nodeCount <= 55) { // Allow some margin
        console.log('✅ Budget limit respected');
      } else {
        console.log('❌ Budget limit exceeded');
        failedTests++;
      }

      // TEST 4: Real webpage (GitHub)
      console.log('\n' + '='.repeat(70));
      console.log('📝 TEST 4: Real complex webpage (GitHub)');
      console.log('='.repeat(70));

      await page.goto('https://github.com');
      await page.waitForLoadState('load'); // Wait for full load, not just DOMContentLoaded
      await page.waitForTimeout(2000); // Give time for dynamic content
      console.log('✅ Loaded GitHub homepage');

      const result4 = await this.callPageStructure({ max_nodes: 300 });
      const data4 = JSON.parse(result4.content[0].text);
      const githubNodes = this.countNodes(data4.outline);
      const githubGroups = this.findRepeatedGroups(data4.outline);

      console.log(`\n  Total nodes: ${githubNodes}`);
      console.log(`  Repeated groups: ${githubGroups.length}`);
      console.log(`  Has interactive elements: ${JSON.stringify(data4.outline).includes('"interactive":true')}`);
      console.log(`  Has landmarks: ${JSON.stringify(data4.outline).includes('"landmark":true')}`);

      // Just verify it returns valid data without crashing
      if (githubNodes > 5 && data4.outline.tag === 'body') {
        console.log('\n✅ Successfully analyzed complex real webpage (GitHub)');
      } else {
        console.log('\n❌ Failed to properly analyze GitHub - too few nodes or invalid structure');
        failedTests++;
      }

      // SUMMARY
      console.log('\n' + '='.repeat(70));
      console.log('📊 TEST SUMMARY');
      console.log('='.repeat(70));

      if (failedTests === 0) {
        console.log('\n✅ ALL TESTS PASSED!');
      } else {
        console.log(`\n❌ ${failedTests} TEST(S) FAILED`);
        process.exitCode = 1;
      }

    } catch (error) {
      console.error('\n❌ TEST FAILED:', error.message);
      console.error(error.stack);
      process.exitCode = 1;
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test
const runner = new TestRunner();
runner.run();

const fs = require('fs');
const path = require('path');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

// Read the content script
const contentScriptPath = path.join(__dirname, 'opendia-extension/src/content/content.js');
let contentScript = fs.readFileSync(contentScriptPath, 'utf8');

// Mock browser API
const browserMock = {
  runtime: {
    onMessage: {
      addListener: () => {}
    }
  }
};

// Setup JSDOM
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
  <header>
    <nav>
      <ul>
        <li><a href="#">Home</a></li>
        <li><a href="#">Products</a></li>
        <li><a href="#">About</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <div class="hero">
      <h1>Welcome to Our Store</h1>
      <p>Best deals online</p>
    </div>

    <div class="product-grid">
      <h2>Featured Products</h2>
      <div class="card">
        <img src="p1.jpg" />
        <h3 class="title">Product 1</h3>
        <button>Buy</button>
      </div>
      <div class="card">
        <img src="p2.jpg" />
        <h3 class="title">Product 2</h3>
        <button>Buy</button>
      </div>
      <div class="card">
        <img src="p3.jpg" />
        <h3 class="title">Product 3</h3>
        <button>Buy</button>
      </div>
      <div class="card">
        <img src="p4.jpg" />
        <h3 class="title">Product 4</h3>
        <button>Buy</button>
      </div>
    </div>
  </main>
  <footer>
    <p>&copy; 2023 Company</p>
  </footer>
</body>
</html>
`);

global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.browser = browserMock;
global.chrome = browserMock;
global.IntersectionObserver = class {
  observe() {}
  disconnect() {}
};

// Mock getBoundingClientRect since JSDOM doesn't do layout
global.HTMLElement.prototype.getBoundingClientRect = function() {
  // Default size
  let width = 100;
  let height = 50;
  let y = 100;

  // Custom sizes based on tag/class
  const tag = this.tagName.toLowerCase();
  const cls = this.className || '';

  if (tag === 'header') { width = 1000; height = 80; y = 0; }
  if (tag === 'footer') { width = 1000; height = 100; y = 900; }
  if (tag === 'main') { width = 1000; height = 800; y = 80; }
  if (cls.includes('hero')) { width = 1000; height = 300; }
  if (cls.includes('card')) { width = 200; height = 300; }
  if (tag === 'img') { width = 180; height = 180; }
  if (tag === 'a') { width = 50; height = 20; }

  return {
    width, height, top: y, left: 0, bottom: y + height, right: width, x: 0, y
  };
};

// Remove the injection guard wrapper at the top
contentScript = contentScript.replace(/^[\s\S]*?else \{/, '');

// Remove the initialization and closing brace at the end
contentScript = contentScript.replace(/\/\/ Initialize the automation system[\s\S]*$/, '');

// Expose the class to global scope
contentScript += '\nglobal.BrowserAutomation = BrowserAutomation;';

// Evaluate the script to define the class
console.log("Script start:", contentScript.substring(0, 200));
eval(contentScript);

// Now instantiate and test
console.log("🧪 Testing Region Detection Logic...");

try {
  const automation = new BrowserAutomation();
  const result = automation.detectRegionsStructure({});

  console.log("\n✅ Detection Result:");
  console.log(JSON.stringify(result, null, 2));

  // Assertions
  const regions = result.regions;
  const header = regions.find(r => r.kind === 'header');
  const main = regions.filter(r => r.id.startsWith('R'));

  if (!header) throw new Error("Header not found");
  if (main.length === 0) throw new Error("Main sections not found");

  const gridSection = main.find(r => r.card_grids && r.card_grids.length > 0);
  if (!gridSection) throw new Error("Card grid not detected");

  console.log("\n✅ TEST PASSED: All regions detected correctly!");

} catch (e) {
  console.error("\n❌ TEST FAILED:", e);
  process.exit(1);
}

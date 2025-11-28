/**
 * CSP Bypass Test Suite
 * 
 * Tests different approaches for executing scripts in pages with strict CSP.
 * Target: LinkedIn job pages (known strict CSP)
 * 
 * Usage:
 *   node tests/csp-bypass/test-csp-approaches.js
 * 
 * Or with specific LinkedIn URL:
 *   node tests/csp-bypass/test-csp-approaches.js "https://www.linkedin.com/jobs/view/1234567890"
 */

const TEST_SCRIPTS = {
  // Simple script that doesn't require eval
  simple: 'document.title',
  
  // Script that returns an object
  object: '({ title: document.title, url: window.location.href })',
  
  // Script with DOM query
  domQuery: "Array.from(document.querySelectorAll('h1, h2')).map(h => h.textContent).slice(0, 5)",
  
  // Script that uses JSON
  jsonParse: "JSON.parse('{\"test\": true}')",
  
  // Complex script with multiple statements
  complex: `
    (() => {
      const buttons = document.querySelectorAll('button');
      const links = document.querySelectorAll('a');
      return {
        buttonCount: buttons.length,
        linkCount: links.length,
        title: document.title,
        url: window.location.href
      };
    })()
  `,
  
  // Script that accesses page-specific data (LinkedIn job info)
  linkedinJob: `
    (() => {
      // Try various LinkedIn job page selectors
      const title = document.querySelector('.job-details-jobs-unified-top-card__job-title, .top-card-layout__title, h1')?.textContent?.trim();
      const company = document.querySelector('.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link, a[data-tracking-control-name="public_jobs_topcard-org-name"]')?.textContent?.trim();
      const location = document.querySelector('.job-details-jobs-unified-top-card__bullet, .topcard__flavor--bullet')?.textContent?.trim();
      const description = document.querySelector('.jobs-description-content__text, .description__text')?.textContent?.trim()?.substring(0, 500);
      
      return {
        title: title || 'Not found',
        company: company || 'Not found',
        location: location || 'Not found',
        descriptionPreview: description || 'Not found',
        pageTitle: document.title,
        url: window.location.href
      };
    })()
  `
};

/**
 * Approach 1: world: 'MAIN' with eval()
 * Current implementation - eval runs in page context
 */
const approach1_mainWorldEval = {
  name: 'MAIN world + eval()',
  description: 'Execute eval() in the page\'s main JavaScript world',
  code: `
    // Chrome MV3 - inject function that evaluates script in page context
    results = await browser.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: scriptCode => {
        return eval(scriptCode);
      },
      args: [script],
      world: 'MAIN'
    });
  `,
  pros: [
    'Full access to page JavaScript context',
    'Can execute any valid JavaScript',
    'Access to page global variables'
  ],
  cons: [
    'Blocked by strict CSP that disallows eval',
    'Some pages have script-src without unsafe-eval'
  ]
};

/**
 * Approach 2: world: 'ISOLATED' with DOM-only access
 * No eval, just DOM manipulation
 */
const approach2_isolatedWorld = {
  name: 'ISOLATED world (no eval)',
  description: 'Execute predefined functions in isolated world, DOM access only',
  code: `
    // Chrome MV3 - use isolated world with predefined extraction functions
    results = await browser.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (extractorName) => {
        const extractors = {
          getTitle: () => document.title,
          getUrl: () => window.location.href,
          getHeadings: () => Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent),
          getLinks: () => Array.from(document.querySelectorAll('a[href]')).slice(0, 20).map(a => ({
            text: a.textContent?.trim(),
            href: a.href
          })),
          getButtons: () => Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.textContent?.trim(),
            disabled: b.disabled
          })),
          getPageInfo: () => ({
            title: document.title,
            url: window.location.href,
            bodyTextLength: document.body?.textContent?.length || 0
          })
        };
        return extractors[extractorName]?.() || null;
      },
      args: ['getPageInfo'],
      world: 'ISOLATED'
    });
  `,
  pros: [
    'Not blocked by CSP (no eval)',
    'Safe and sandboxed',
    'Access to DOM'
  ],
  cons: [
    'Cannot execute arbitrary scripts',
    'Must define all extractors in advance',
    'No access to page JavaScript variables'
  ]
};

/**
 * Approach 3: Script element injection via content script
 * Inject a <script> tag into the page DOM
 */
const approach3_scriptElementInjection = {
  name: 'Script element injection',
  description: 'Create and inject a <script> element into the page DOM',
  code: `
    // First inject a content script that creates the script element
    results = await browser.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (scriptCode, resultId) => {
        return new Promise((resolve, reject) => {
          // Create result container
          const resultContainer = document.createElement('div');
          resultContainer.id = resultId;
          resultContainer.style.display = 'none';
          document.body.appendChild(resultContainer);
          
          // Create script element
          const script = document.createElement('script');
          script.textContent = \`
            try {
              const result = (\${scriptCode});
              document.getElementById('\${resultId}').textContent = JSON.stringify(result);
            } catch (e) {
              document.getElementById('\${resultId}').textContent = JSON.stringify({error: e.message});
            }
          \`;
          
          // Inject and wait for execution
          document.head.appendChild(script);
          
          // Small delay for sync execution
          setTimeout(() => {
            const result = document.getElementById(resultId)?.textContent;
            document.getElementById(resultId)?.remove();
            script.remove();
            
            try {
              resolve(JSON.parse(result || 'null'));
            } catch (e) {
              resolve({ parseError: e.message, raw: result });
            }
          }, 50);
        });
      },
      args: [script, 'opendia-result-' + Date.now()],
      world: 'MAIN'  // Need MAIN world to inject script elements
    });
  `,
  pros: [
    'Script runs in page context',
    'Full JavaScript access'
  ],
  cons: [
    'Still blocked by strict CSP script-src',
    'More complex implementation',
    'Async result retrieval'
  ]
};

/**
 * Approach 4: Blob URL script injection
 * Create a blob URL and inject as script src
 */
const approach4_blobUrlInjection = {
  name: 'Blob URL injection',
  description: 'Create a blob URL and inject as script src',
  code: `
    results = await browser.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (scriptCode, resultId) => {
        return new Promise((resolve, reject) => {
          // Create result container
          const resultContainer = document.createElement('div');
          resultContainer.id = resultId;
          resultContainer.style.display = 'none';
          document.body.appendChild(resultContainer);
          
          // Create blob with script content
          const wrappedScript = \`
            try {
              const result = (\${scriptCode});
              document.getElementById('\${resultId}').textContent = JSON.stringify(result);
            } catch (e) {
              document.getElementById('\${resultId}').textContent = JSON.stringify({error: e.message});
            }
          \`;
          
          const blob = new Blob([wrappedScript], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          
          // Create script element with blob URL
          const script = document.createElement('script');
          script.src = blobUrl;
          
          script.onload = () => {
            URL.revokeObjectURL(blobUrl);
            const result = document.getElementById(resultId)?.textContent;
            document.getElementById(resultId)?.remove();
            script.remove();
            
            try {
              resolve(JSON.parse(result || 'null'));
            } catch (e) {
              resolve({ parseError: e.message, raw: result });
            }
          };
          
          script.onerror = (e) => {
            URL.revokeObjectURL(blobUrl);
            document.getElementById(resultId)?.remove();
            script.remove();
            reject(new Error('Blob script injection blocked by CSP'));
          };
          
          document.head.appendChild(script);
        });
      },
      args: [script, 'opendia-result-' + Date.now()],
      world: 'MAIN'
    });
  `,
  pros: [
    'Script runs in page context',
    'Different CSP directive (blob:)'
  ],
  cons: [
    'Blocked by CSP without blob: in script-src',
    'Complex implementation'
  ]
};

/**
 * Approach 5: Function serialization (no eval)
 * Pass pre-compiled functions, not strings
 */
const approach5_functionSerialization = {
  name: 'Function serialization',
  description: 'Pass serialized functions with specific capabilities',
  code: `
    // Define extraction functions as actual functions, not strings
    function extractJobInfo() {
      const title = document.querySelector('.job-details-jobs-unified-top-card__job-title, .top-card-layout__title, h1')?.textContent?.trim();
      const company = document.querySelector('.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link')?.textContent?.trim();
      const location = document.querySelector('.job-details-jobs-unified-top-card__bullet, .topcard__flavor--bullet')?.textContent?.trim();
      const description = document.querySelector('.jobs-description-content__text, .description__text')?.textContent?.trim()?.substring(0, 500);
      
      return {
        title: title || 'Not found',
        company: company || 'Not found',
        location: location || 'Not found',
        descriptionPreview: description || 'Not found',
        pageTitle: document.title,
        url: window.location.href
      };
    }
    
    results = await browser.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: extractJobInfo,
      world: 'MAIN'  // Run in MAIN world to access page context
    });
  `,
  pros: [
    'No eval required',
    'Not blocked by script-src CSP',
    'Type-safe, pre-defined functions'
  ],
  cons: [
    'Cannot execute arbitrary user scripts',
    'Must define all functions in advance',
    'Less flexible'
  ]
};

/**
 * Approach 6: Hybrid - Function with dynamic selectors
 * Pass selectors as arguments to pre-defined functions
 */
const approach6_hybridSelectors = {
  name: 'Hybrid with dynamic selectors',
  description: 'Pre-defined functions with dynamic selector arguments',
  code: `
    function querySelectorsToText(selectors) {
      const results = {};
      for (const [key, selector] of Object.entries(selectors)) {
        const elements = document.querySelectorAll(selector);
        results[key] = Array.from(elements).map(el => el.textContent?.trim()).filter(Boolean);
      }
      return results;
    }
    
    results = await browser.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: querySelectorsToText,
      args: [{
        titles: 'h1, h2, .job-title',
        companies: '.company-name, .org-name',
        descriptions: '.description, .job-description'
      }],
      world: 'MAIN'
    });
  `,
  pros: [
    'No eval required',
    'Dynamic selector capabilities',
    'Not blocked by CSP'
  ],
  cons: [
    'Limited to predefined operations',
    'Cannot run arbitrary JavaScript'
  ]
};

// Export approaches for testing
const APPROACHES = [
  approach1_mainWorldEval,
  approach2_isolatedWorld,
  approach3_scriptElementInjection,
  approach4_blobUrlInjection,
  approach5_functionSerialization,
  approach6_hybridSelectors
];

export {
  TEST_SCRIPTS,
  APPROACHES,
  approach1_mainWorldEval,
  approach2_isolatedWorld,
  approach3_scriptElementInjection,
  approach4_blobUrlInjection,
  approach5_functionSerialization,
  approach6_hybridSelectors
};

// Print summary when run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  console.log('\n📋 CSP Bypass Approaches Summary\n');
  console.log('=' .repeat(60));
  
  APPROACHES.forEach((approach, index) => {
    console.log(`\n${index + 1}. ${approach.name}`);
    console.log('-'.repeat(40));
    console.log(`   ${approach.description}`);
    console.log('\n   ✅ Pros:');
    approach.pros.forEach(pro => console.log(`      • ${pro}`));
    console.log('\n   ❌ Cons:');
    approach.cons.forEach(con => console.log(`      • ${con}`));
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('\n🎯 Test Scripts Available:');
  Object.keys(TEST_SCRIPTS).forEach(key => {
    console.log(`   • ${key}`);
  });
  
  console.log('\n📝 To run tests, use the MCP server with a LinkedIn job page open.\n');
}

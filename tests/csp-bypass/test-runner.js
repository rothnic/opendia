/**
 * CSP Bypass Test Runner
 * 
 * This script is designed to be run from the extension's background script
 * to test all CSP bypass approaches against a LinkedIn job page.
 * 
 * Integration: Add this as a hidden MCP tool or run via browser console.
 */

// Test scripts to run
const TEST_SCRIPTS = {
  simple: 'document.title',
  object: '({ title: document.title, url: window.location.href })',
  domQuery: "Array.from(document.querySelectorAll('h1, h2')).map(h => h.textContent).slice(0, 5)",
  jsonParse: "JSON.parse('{\"test\": true}')",
  complex: `(() => {
    const buttons = document.querySelectorAll('button');
    const links = document.querySelectorAll('a');
    return {
      buttonCount: buttons.length,
      linkCount: links.length,
      title: document.title
    };
  })()`
};

// LinkedIn-specific selectors for approach 6
const LINKEDIN_SELECTORS = {
  titles: ['h1', '.job-details-jobs-unified-top-card__job-title', '.top-card-layout__title'],
  companies: ['.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link'],
  locations: ['.job-details-jobs-unified-top-card__bullet', '.topcard__flavor--bullet'],
  descriptions: ['.jobs-description-content__text', '.description__text', '#job-details']
};

/**
 * Run all CSP bypass approaches and collect results
 */
async function runAllTests(browser, tabId) {
  const results = {
    tabId,
    timestamp: new Date().toISOString(),
    testScript: TEST_SCRIPTS.simple,
    approaches: {}
  };
  
  // Dynamic import for ES module compatibility
  const implementations = await import('./csp-implementations.js');
  
  console.log('🧪 Starting CSP bypass tests...\n');
  
  // Test 1: MAIN world + eval
  console.log('Testing Approach 1: MAIN world + eval()...');
  results.approaches['approach1_mainWorldEval'] = 
    await implementations.approach1_mainWorldEval(browser, tabId, TEST_SCRIPTS.simple);
  
  // Test 2: ISOLATED world (no eval)
  console.log('Testing Approach 2: ISOLATED world (no eval)...');
  results.approaches['approach2_isolatedWorld'] = 
    await implementations.approach2_isolatedWorld(browser, tabId, 'getPageInfo');
  
  // Test 3: Script element injection
  console.log('Testing Approach 3: Script element injection...');
  results.approaches['approach3_scriptElement'] = 
    await implementations.approach3_scriptElementInjection(browser, tabId, TEST_SCRIPTS.simple);
  
  // Test 4: Blob URL injection
  console.log('Testing Approach 4: Blob URL injection...');
  results.approaches['approach4_blobUrl'] = 
    await implementations.approach4_blobUrlInjection(browser, tabId, TEST_SCRIPTS.simple);
  
  // Test 5: Function serialization (LinkedIn-specific)
  console.log('Testing Approach 5: Function serialization (LinkedIn)...');
  results.approaches['approach5_linkedInExtractor'] = 
    await implementations.approach5_linkedInJobExtractor(browser, tabId);
  
  // Test 6: Dynamic selectors
  console.log('Testing Approach 6: Dynamic selectors...');
  results.approaches['approach6_dynamicSelectors'] = 
    await implementations.approach6_dynamicSelectors(browser, tabId, LINKEDIN_SELECTORS);
  
  // Test 7: Function constructor
  console.log('Testing Approach 7: Function constructor...');
  results.approaches['approach7_functionConstructor'] = 
    await implementations.approach7_functionConstructor(browser, tabId, TEST_SCRIPTS.simple);
  
  // Test 8: Worker execution
  console.log('Testing Approach 8: Worker execution...');
  results.approaches['approach8_worker'] = 
    await implementations.approach8_workerExecution(browser, tabId, "'Hello from worker'");
  
  // Summary
  results.summary = {
    total: Object.keys(results.approaches).length,
    successful: Object.values(results.approaches).filter(r => r.success).length,
    failed: Object.values(results.approaches).filter(r => !r.success).length,
    cspBlocked: Object.values(results.approaches).filter(r => r.cspBlocked).length
  };
  
  console.log('\n📊 Test Summary:');
  console.log(`   Total: ${results.summary.total}`);
  console.log(`   ✅ Successful: ${results.summary.successful}`);
  console.log(`   ❌ Failed: ${results.summary.failed}`);
  console.log(`   🚫 CSP Blocked: ${results.summary.cspBlocked}`);
  
  return results;
}

/**
 * Print detailed results
 */
function printResults(results) {
  console.log('\n' + '='.repeat(60));
  console.log('CSP Bypass Test Results');
  console.log('='.repeat(60));
  console.log(`Tab ID: ${results.tabId}`);
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`Test Script: ${results.testScript}`);
  console.log('-'.repeat(60));
  
  for (const [name, result] of Object.entries(results.approaches)) {
    const status = result.success ? '✅' : '❌';
    const csp = result.cspBlocked ? ' [CSP BLOCKED]' : '';
    
    console.log(`\n${status} ${result.approach}${csp}`);
    
    if (result.success) {
      console.log(`   Result: ${JSON.stringify(result.result).substring(0, 100)}...`);
    } else {
      console.log(`   Error: ${result.error}`);
    }
    
    if (result.note) {
      console.log(`   Note: ${result.note}`);
    }
    
    if (result.limitation) {
      console.log(`   ⚠️ Limitation: ${result.limitation}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
}

/**
 * Export for use in background script
 */
export {
  runAllTests,
  printResults,
  TEST_SCRIPTS,
  LINKEDIN_SELECTORS
};

// If running directly (for documentation purposes)
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    CSP Bypass Test Runner                             ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  This test runner is designed to be integrated into the OpenDia      ║
║  extension's background script to test CSP bypass approaches.        ║
║                                                                       ║
║  HOW TO USE:                                                          ║
║                                                                       ║
║  1. Add a test MCP tool to background.js that calls runAllTests()    ║
║  2. Navigate to a LinkedIn job page in your browser                  ║
║  3. Call the test tool from an MCP client                            ║
║  4. Review results to see which approaches work                      ║
║                                                                       ║
║  APPROACHES TESTED:                                                   ║
║                                                                       ║
║  1. MAIN world + eval()        - Current implementation              ║
║  2. ISOLATED world (no eval)   - Predefined extractors               ║
║  3. Script element injection   - DOM <script> element                ║
║  4. Blob URL injection         - Blob URL as script src              ║
║  5. Function serialization     - Pre-compiled functions              ║
║  6. Dynamic selectors          - Flexible selector arguments         ║
║  7. Function constructor       - new Function() instead of eval      ║
║  8. Worker execution           - Web Worker (no DOM access)          ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════════╝
  `);
}

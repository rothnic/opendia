/**
 * CSP Bypass Implementation Tests
 * 
 * This file contains implementations of different CSP bypass approaches
 * that can be tested against LinkedIn job pages.
 * 
 * Each approach is implemented as a standalone function that can be called
 * from the background script.
 */

/**
 * Approach 1: MAIN world with eval (current implementation)
 * This is what we currently use in page_execute_script
 */
async function approach1_mainWorldEval(browser, tabId, script) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: (scriptCode) => {
        // eslint-disable-next-line no-eval
        return eval(scriptCode);
      },
      args: [script],
      world: 'MAIN'
    });
    
    return {
      success: true,
      approach: 'MAIN world + eval()',
      result: results[0]?.result,
      note: 'Uses eval() in page context'
    };
  } catch (error) {
    return {
      success: false,
      approach: 'MAIN world + eval()',
      error: error.message,
      cspBlocked: error.message.includes('Content Security Policy') || 
                  error.message.includes('unsafe-eval') ||
                  error.message.includes('EvalError')
    };
  }
}

/**
 * Approach 2: ISOLATED world with predefined extractors
 * No eval, just DOM access through predefined functions
 */
async function approach2_isolatedWorld(browser, tabId, extractorName) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: (extractorKey) => {
        const extractors = {
          // Basic page info
          getTitle: () => document.title,
          getUrl: () => window.location.href,
          
          // Element queries
          getHeadings: () => Array.from(document.querySelectorAll('h1, h2, h3'))
            .map(h => h.textContent?.trim()).filter(Boolean).slice(0, 10),
          
          getLinks: () => Array.from(document.querySelectorAll('a[href]'))
            .slice(0, 20).map(a => ({
              text: a.textContent?.trim()?.substring(0, 50),
              href: a.href
            })),
          
          getButtons: () => Array.from(document.querySelectorAll('button'))
            .slice(0, 20).map(b => ({
              text: b.textContent?.trim()?.substring(0, 50),
              disabled: b.disabled,
              ariaLabel: b.getAttribute('aria-label')
            })),
          
          // Full page info
          getPageInfo: () => ({
            title: document.title,
            url: window.location.href,
            bodyTextLength: document.body?.textContent?.length || 0,
            headingCount: document.querySelectorAll('h1, h2, h3').length,
            linkCount: document.querySelectorAll('a').length,
            buttonCount: document.querySelectorAll('button').length
          }),
          
          // LinkedIn-specific job extraction
          getLinkedInJob: () => {
            // Multiple selector variations for different LinkedIn page versions
            const selectors = {
              title: [
                '.job-details-jobs-unified-top-card__job-title',
                '.top-card-layout__title',
                '.jobs-unified-top-card__job-title',
                'h1.t-24',
                'h1'
              ],
              company: [
                '.job-details-jobs-unified-top-card__company-name',
                '.topcard__org-name-link',
                '.jobs-unified-top-card__company-name a',
                'a[data-tracking-control-name*="company"]'
              ],
              location: [
                '.job-details-jobs-unified-top-card__bullet',
                '.topcard__flavor--bullet',
                '.jobs-unified-top-card__bullet'
              ],
              description: [
                '.jobs-description-content__text',
                '.description__text',
                '.jobs-box__html-content',
                '#job-details'
              ]
            };
            
            const findFirst = (selectorList) => {
              for (const selector of selectorList) {
                const el = document.querySelector(selector);
                if (el?.textContent?.trim()) {
                  return el.textContent.trim();
                }
              }
              return null;
            };
            
            return {
              title: findFirst(selectors.title),
              company: findFirst(selectors.company),
              location: findFirst(selectors.location),
              descriptionPreview: findFirst(selectors.description)?.substring(0, 500),
              pageTitle: document.title,
              url: window.location.href,
              extractedAt: new Date().toISOString()
            };
          },
          
          // Get HTML source (truncated)
          getHtmlSource: () => ({
            html: document.documentElement.outerHTML.substring(0, 10000),
            fullLength: document.documentElement.outerHTML.length,
            truncated: document.documentElement.outerHTML.length > 10000
          }),
          
          // Get all text content
          getBodyText: () => ({
            text: document.body?.innerText?.substring(0, 5000),
            fullLength: document.body?.innerText?.length || 0
          })
        };
        
        const extractor = extractors[extractorKey];
        if (!extractor) {
          return {
            error: `Unknown extractor: ${extractorKey}`,
            available: Object.keys(extractors)
          };
        }
        
        return extractor();
      },
      args: [extractorName],
      world: 'ISOLATED'
    });
    
    return {
      success: true,
      approach: 'ISOLATED world (no eval)',
      result: results[0]?.result,
      note: 'Uses predefined extractors, not blocked by CSP'
    };
  } catch (error) {
    return {
      success: false,
      approach: 'ISOLATED world (no eval)',
      error: error.message
    };
  }
}

/**
 * Approach 3: Script element injection
 * Create a <script> element in the page DOM
 */
async function approach3_scriptElementInjection(browser, tabId, script) {
  try {
    const resultId = 'opendia-result-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const results = await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: (scriptCode, containerId) => {
        return new Promise((resolve) => {
          // Create hidden result container
          const container = document.createElement('div');
          container.id = containerId;
          container.style.display = 'none';
          document.body.appendChild(container);
          
          // Create script element
          const scriptEl = document.createElement('script');
          scriptEl.textContent = `
            try {
              const __opendia_result = (${scriptCode});
              document.getElementById('${containerId}').setAttribute('data-result', JSON.stringify(__opendia_result));
              document.getElementById('${containerId}').setAttribute('data-success', 'true');
            } catch (e) {
              document.getElementById('${containerId}').setAttribute('data-error', e.message);
              document.getElementById('${containerId}').setAttribute('data-success', 'false');
            }
          `;
          
          // Add error handler for CSP blocks
          scriptEl.onerror = () => {
            container.setAttribute('data-error', 'Script blocked by CSP');
            container.setAttribute('data-success', 'false');
          };
          
          // Inject script
          document.head.appendChild(scriptEl);
          
          // Wait for execution
          setTimeout(() => {
            const success = container.getAttribute('data-success') === 'true';
            const result = container.getAttribute('data-result');
            const error = container.getAttribute('data-error');
            
            // Cleanup
            container.remove();
            scriptEl.remove();
            
            if (success && result) {
              try {
                resolve({ success: true, result: JSON.parse(result) });
              } catch (e) {
                resolve({ success: true, result: result });
              }
            } else {
              resolve({ success: false, error: error || 'Unknown error' });
            }
          }, 100);
        });
      },
      args: [script, resultId],
      world: 'MAIN'
    });
    
    const innerResult = results[0]?.result;
    
    return {
      success: innerResult?.success || false,
      approach: 'Script element injection',
      result: innerResult?.result,
      error: innerResult?.error,
      cspBlocked: innerResult?.error?.includes('CSP') || false,
      note: 'Creates <script> element in DOM'
    };
  } catch (error) {
    return {
      success: false,
      approach: 'Script element injection',
      error: error.message,
      cspBlocked: error.message.includes('Content Security Policy')
    };
  }
}

/**
 * Approach 4: Blob URL injection
 * Create a blob URL and inject as script src
 */
async function approach4_blobUrlInjection(browser, tabId, script) {
  try {
    const resultId = 'opendia-blob-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const results = await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: (scriptCode, containerId) => {
        return new Promise((resolve) => {
          // Create hidden result container
          const container = document.createElement('div');
          container.id = containerId;
          container.style.display = 'none';
          document.body.appendChild(container);
          
          // Create blob with script content
          const wrappedScript = `
            try {
              const __opendia_result = (${scriptCode});
              document.getElementById('${containerId}').setAttribute('data-result', JSON.stringify(__opendia_result));
              document.getElementById('${containerId}').setAttribute('data-success', 'true');
            } catch (e) {
              document.getElementById('${containerId}').setAttribute('data-error', e.message);
              document.getElementById('${containerId}').setAttribute('data-success', 'false');
            }
          `;
          
          const blob = new Blob([wrappedScript], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          
          // Create script element with blob URL
          const scriptEl = document.createElement('script');
          scriptEl.src = blobUrl;
          
          scriptEl.onload = () => {
            URL.revokeObjectURL(blobUrl);
            
            setTimeout(() => {
              const success = container.getAttribute('data-success') === 'true';
              const result = container.getAttribute('data-result');
              const error = container.getAttribute('data-error');
              
              container.remove();
              scriptEl.remove();
              
              if (success && result) {
                try {
                  resolve({ success: true, result: JSON.parse(result) });
                } catch (e) {
                  resolve({ success: true, result: result });
                }
              } else {
                resolve({ success: false, error: error || 'Unknown error' });
              }
            }, 50);
          };
          
          scriptEl.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            container.remove();
            scriptEl.remove();
            resolve({ success: false, error: 'Blob script blocked by CSP' });
          };
          
          document.head.appendChild(scriptEl);
        });
      },
      args: [script, resultId],
      world: 'MAIN'
    });
    
    const innerResult = results[0]?.result;
    
    return {
      success: innerResult?.success || false,
      approach: 'Blob URL injection',
      result: innerResult?.result,
      error: innerResult?.error,
      cspBlocked: innerResult?.error?.includes('CSP') || innerResult?.error?.includes('blob') || false,
      note: 'Creates blob URL as script src'
    };
  } catch (error) {
    return {
      success: false,
      approach: 'Blob URL injection',
      error: error.message,
      cspBlocked: error.message.includes('Content Security Policy')
    };
  }
}

/**
 * Approach 5: Function serialization (LinkedIn-specific)
 * Pass pre-defined functions, not strings
 */
async function approach5_linkedInJobExtractor(browser, tabId) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // LinkedIn job page selectors - multiple variations for different page versions
        const selectors = {
          title: [
            '.job-details-jobs-unified-top-card__job-title',
            '.top-card-layout__title', 
            '.jobs-unified-top-card__job-title',
            'h1.t-24',
            'h1'
          ],
          company: [
            '.job-details-jobs-unified-top-card__company-name',
            '.topcard__org-name-link',
            '.jobs-unified-top-card__company-name a',
            'a[data-tracking-control-name*="company"]'
          ],
          location: [
            '.job-details-jobs-unified-top-card__bullet',
            '.topcard__flavor--bullet', 
            '.jobs-unified-top-card__bullet'
          ],
          description: [
            '.jobs-description-content__text',
            '.description__text',
            '.jobs-box__html-content',
            '#job-details'
          ],
          salary: [
            '.job-details-jobs-unified-top-card__job-insight',
            '.compensation__salary',
            '.salary-main-rail__text'
          ],
          employmentType: [
            '.job-details-jobs-unified-top-card__job-insight span',
            '.job-criteria__item--type'
          ]
        };
        
        const findFirst = (selectorList) => {
          for (const selector of selectorList) {
            const el = document.querySelector(selector);
            if (el?.textContent?.trim()) {
              return el.textContent.trim();
            }
          }
          return null;
        };
        
        const findAll = (selectorList) => {
          const results = [];
          for (const selector of selectorList) {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              const text = el.textContent?.trim();
              if (text && !results.includes(text)) {
                results.push(text);
              }
            });
          }
          return results;
        };
        
        // Extract job data
        const jobData = {
          title: findFirst(selectors.title),
          company: findFirst(selectors.company),
          location: findFirst(selectors.location),
          description: findFirst(selectors.description),
          salary: findFirst(selectors.salary),
          employmentType: findFirst(selectors.employmentType),
          insights: findAll(['.job-details-jobs-unified-top-card__job-insight']),
          pageTitle: document.title,
          url: window.location.href,
          extractedAt: new Date().toISOString()
        };
        
        // Truncate description if too long
        if (jobData.description && jobData.description.length > 2000) {
          jobData.description = jobData.description.substring(0, 2000) + '...';
        }
        
        return jobData;
      },
      world: 'MAIN'
    });
    
    return {
      success: true,
      approach: 'Function serialization (LinkedIn)',
      result: results[0]?.result,
      note: 'Pre-defined function, not blocked by CSP'
    };
  } catch (error) {
    return {
      success: false,
      approach: 'Function serialization (LinkedIn)',
      error: error.message
    };
  }
}

/**
 * Approach 6: Hybrid with dynamic selectors
 * Pre-defined operations with dynamic arguments
 */
async function approach6_dynamicSelectors(browser, tabId, selectorsMap) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: (selectors) => {
        const results = {};
        
        for (const [key, selectorConfig] of Object.entries(selectors)) {
          const selectorList = Array.isArray(selectorConfig) ? selectorConfig : [selectorConfig];
          
          for (const selector of selectorList) {
            try {
              const elements = document.querySelectorAll(selector);
              if (elements.length > 0) {
                results[key] = Array.from(elements)
                  .slice(0, 10)
                  .map(el => el.textContent?.trim())
                  .filter(Boolean);
                break;
              }
            } catch (e) {
              // Invalid selector, continue
            }
          }
          
          if (!results[key]) {
            results[key] = [];
          }
        }
        
        return {
          results,
          pageTitle: document.title,
          url: window.location.href,
          extractedAt: new Date().toISOString()
        };
      },
      args: [selectorsMap],
      world: 'MAIN'
    });
    
    return {
      success: true,
      approach: 'Hybrid with dynamic selectors',
      result: results[0]?.result,
      note: 'Dynamic selectors, not blocked by CSP'
    };
  } catch (error) {
    return {
      success: false,
      approach: 'Hybrid with dynamic selectors',
      error: error.message
    };
  }
}

/**
 * NEW Approach 7: New Function() constructor in MAIN world
 * This is different from eval() and might have different CSP treatment
 */
async function approach7_functionConstructor(browser, tabId, script) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: (scriptCode) => {
        try {
          // Use Function constructor instead of eval
          const fn = new Function('return ' + scriptCode);
          return { success: true, result: fn() };
        } catch (e) {
          return { success: false, error: e.message };
        }
      },
      args: [script],
      world: 'MAIN'
    });
    
    const innerResult = results[0]?.result;
    
    return {
      success: innerResult?.success || false,
      approach: 'Function constructor',
      result: innerResult?.result,
      error: innerResult?.error,
      cspBlocked: innerResult?.error?.includes('Content Security Policy') || 
                  innerResult?.error?.includes('unsafe-eval'),
      note: 'Uses new Function() instead of eval()'
    };
  } catch (error) {
    return {
      success: false,
      approach: 'Function constructor',
      error: error.message,
      cspBlocked: error.message.includes('Content Security Policy')
    };
  }
}

/**
 * NEW Approach 8: Worker-based execution
 * Create a web worker to execute script (workers have different CSP context)
 */
async function approach8_workerExecution(browser, tabId, script) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId: tabId },
      func: (scriptCode) => {
        return new Promise((resolve) => {
          try {
            // Create worker from blob
            const workerCode = `
              self.onmessage = function(e) {
                try {
                  // Workers can't access DOM, so this is limited
                  const result = eval(e.data);
                  self.postMessage({ success: true, result: result });
                } catch (error) {
                  self.postMessage({ success: false, error: error.message });
                }
              };
            `;
            
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            const worker = new Worker(workerUrl);
            
            worker.onmessage = (e) => {
              URL.revokeObjectURL(workerUrl);
              worker.terminate();
              resolve(e.data);
            };
            
            worker.onerror = (e) => {
              URL.revokeObjectURL(workerUrl);
              worker.terminate();
              resolve({ success: false, error: 'Worker error: ' + e.message });
            };
            
            // Send script to worker
            worker.postMessage(scriptCode);
            
            // Timeout after 5 seconds
            setTimeout(() => {
              worker.terminate();
              resolve({ success: false, error: 'Worker timeout' });
            }, 5000);
            
          } catch (e) {
            resolve({ success: false, error: 'Worker creation failed: ' + e.message });
          }
        });
      },
      args: [script],
      world: 'MAIN'
    });
    
    const innerResult = results[0]?.result;
    
    return {
      success: innerResult?.success || false,
      approach: 'Worker execution',
      result: innerResult?.result,
      error: innerResult?.error,
      note: 'Uses Web Worker (no DOM access)',
      limitation: 'Workers cannot access DOM'
    };
  } catch (error) {
    return {
      success: false,
      approach: 'Worker execution',
      error: error.message
    };
  }
}

// Export all approaches
export {
  approach1_mainWorldEval,
  approach2_isolatedWorld,
  approach3_scriptElementInjection,
  approach4_blobUrlInjection,
  approach5_linkedInJobExtractor,
  approach6_dynamicSelectors,
  approach7_functionConstructor,
  approach8_workerExecution
};

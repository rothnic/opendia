// Import WebExtension polyfill at the top
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Browser detection
const browserInfo = {
  isFirefox: typeof browser !== 'undefined' && browser.runtime.getManifest().applications?.gecko,
  isChrome: typeof chrome !== 'undefined' && !browser.runtime.getManifest().applications?.gecko,
  isServiceWorker: typeof importScripts === 'function',
  manifestVersion: browser.runtime.getManifest().manifest_version
};

console.log('🌐 Browser detected:', browserInfo);

// MCP Server connection configuration
let MCP_SERVER_URL = 'ws://localhost:5555'; // Default, will be auto-discovered
let lastKnownPorts = { websocket: 5555, http: 5556 }; // Cache for port discovery

// Safety Mode configuration
let safetyModeEnabled = false;
const WRITE_EDIT_TOOLS = ['element_click', 'element_fill'];

// Load safety mode state on startup
browser.storage.local.get(['safetyMode'], result => {
  safetyModeEnabled = result.safetyMode || false;
});

// Cross-browser WebSocket connection manager
class ConnectionManager {
  constructor() {
    this.mcpSocket = null;
    this.reconnectInterval = null;
    this.reconnectAttempts = 0;
    this.heartbeatInterval = null;
    this.keepaliveInterval = null;
    this.isServiceWorker = browserInfo.isServiceWorker;
    this.isFirefox = browserInfo.isFirefox;
    this.keepaliveTimeout = 4 * 60 * 60 * 1000; // 4 hours default
    this.connectionStartTime = null;
  }

  async connect() {
    // Always maintain persistent connection (even in Chrome MV3)
    if (!this.mcpSocket || this.mcpSocket.readyState !== WebSocket.OPEN) {
      console.log('🔗 Creating persistent connection to MCP server');
      await this.createConnection();
    } else {
      console.log('✅ Using existing connection');
    }
  }

  async createConnection() {
    try {
      // Try port discovery if using default URL or if connection failed
      if (MCP_SERVER_URL === 'ws://localhost:5555' || this.reconnectAttempts > 2) {
        await this.discoverServerPorts();
        this.reconnectAttempts = 0; // Reset attempts after discovery
      }

      console.log('🔗 Connecting to MCP server at', MCP_SERVER_URL);
      this.mcpSocket = new WebSocket(MCP_SERVER_URL);

      this.mcpSocket.onopen = () => {
        console.log('✅ Connected to MCP server');
        this.clearReconnectInterval();
        this.reconnectAttempts = 0; // Reset attempts on successful connection
        this.connectionStartTime = Date.now(); // Track connection start time

        const tools = getAvailableTools();
        console.log(
          `🔧 Registering ${tools.length} tools:`,
          tools.map(t => t.name)
        );

        // Register available browser functions
        this.mcpSocket.send(
          JSON.stringify({
            type: 'register',
            tools: tools
          })
        );

        // Always setup heartbeat and keepalive (even for Chrome MV3)
        this.setupHeartbeat();
        this.setupKeepalive();
      };

      this.mcpSocket.onmessage = async event => {
        const message = JSON.parse(event.data);
        await handleMCPRequest(message);
      };

      this.mcpSocket.onclose = event => {
        console.log(
          `❌ Disconnected from MCP server (code: ${event.code}, reason: ${event.reason})`
        );
        this.clearHeartbeat();
        this.clearKeepalive();
        this.reconnectAttempts++;

        // Check if this was a normal closure (1000 = normal, 1001 = going away)
        if (event.code !== 1000 && event.code !== 1001) {
          console.log('🔄 Abnormal WebSocket closure, attempting reconnection...');
          this.scheduleReconnect();
        } else {
          console.log('🔄 Normal WebSocket closure (manual disconnect or timeout)');
        }
      };
      this.mcpSocket.onerror = error => {
        console.log('⚠️ MCP WebSocket error:', error);
        this.reconnectAttempts++;
      };
    } catch (error) {
      console.error('Connection failed:', error);
      if (!this.isServiceWorker) {
        this.scheduleReconnect();
      }
    }
  }

  async discoverServerPorts() {
    // Try common HTTP ports to find the server
    const commonPorts = [5556, 5557, 5558, 3001, 6001, 6002, 6003];

    for (const httpPort of commonPorts) {
      try {
        const response = await fetch(`http://localhost:${httpPort}/ports`);
        if (response.ok) {
          const portInfo = await response.json();
          console.log('🔍 Discovered server ports:', portInfo);
          lastKnownPorts = {
            websocket: portInfo.websocket,
            http: portInfo.http
          };
          MCP_SERVER_URL = portInfo.websocketUrl;
          return portInfo;
        }
      } catch (error) {
        // Port not available or not OpenDia server, continue searching
      }
    }

    console.log('⚠️ Port discovery failed, using defaults');
    return null;
  }

  setupHeartbeat() {
    // Maintain heartbeat to keep connection alive
    this.clearHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.mcpSocket?.readyState === WebSocket.OPEN) {
        this.mcpSocket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      } else if (this.mcpSocket?.readyState === WebSocket.CLOSED) {
        console.log('🔄 WebSocket closed, attempting reconnection...');
        this.connect();
      }
    }, 15000); // Ping every 15 seconds
  }

  clearHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  setupKeepalive() {
    // Chrome MV3: Keep service worker alive with periodic alarms
    this.clearKeepalive();

    if (this.isServiceWorker && browser.alarms) {
      // Create an alarm to wake up service worker periodically
      browser.alarms.create('keepalive', { periodInMinutes: 0.5 }); // Every 30 seconds
      console.log('⏰ Keepalive alarm created for Chrome MV3');
    }

    // Check if we've exceeded keepalive timeout
    this.keepaliveInterval = setInterval(() => {
      const elapsed = Date.now() - this.connectionStartTime;
      if (elapsed > this.keepaliveTimeout) {
        console.log(
          `⏱️ Keepalive timeout reached (${this.keepaliveTimeout / 1000 / 60} minutes), disconnecting...`
        );
        this.disconnect();
      }
    }, 60000); // Check every minute
  }

  clearKeepalive() {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    if (this.isServiceWorker && browser.alarms) {
      browser.alarms.clear('keepalive');
    }
  }

  disconnect() {
    console.log('🔌 Manually disconnecting from MCP server');
    this.clearHeartbeat();
    this.clearKeepalive();
    this.clearReconnectInterval();

    if (this.mcpSocket) {
      this.mcpSocket.close(1000, 'Manual disconnect');
      this.mcpSocket = null;
    }
  }

  scheduleReconnect() {
    this.clearReconnectInterval();

    // Exponential backoff for reconnection attempts
    const backoffTime = Math.min(5000 * 2 ** this.reconnectAttempts, 30000);
    console.log(
      `🔄 Scheduling reconnection in ${backoffTime}ms (attempt ${this.reconnectAttempts})`
    );

    this.reconnectInterval = setInterval(() => {
      if (this.reconnectAttempts < 10) {
        this.connect();
      } else {
        console.log('❌ Maximum reconnection attempts reached');
        this.clearReconnectInterval();
      }
    }, backoffTime);
  }

  clearReconnectInterval() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
      this.reconnectInterval = null;
    }
  }

  async ensureConnection() {
    if (this.isServiceWorker) {
      // Chrome: Always create fresh connection
      await this.connect();
    } else {
      // Firefox: Use existing or create new
      if (!this.mcpSocket || this.mcpSocket.readyState !== WebSocket.OPEN) {
        await this.connect();
      }
    }
    return this.mcpSocket;
  }

  send(message) {
    if (this.mcpSocket && this.mcpSocket.readyState === WebSocket.OPEN) {
      this.mcpSocket.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
    }
  }

  getStatus() {
    return {
      connected: this.mcpSocket && this.mcpSocket.readyState === WebSocket.OPEN,
      browserInfo: browserInfo,
      connectionType: this.isServiceWorker ? 'temporary' : 'persistent'
    };
  }
}

// Create global connection manager
const connectionManager = new ConnectionManager();

// Content script management for background tabs
async function ensureContentScriptReady(tabId, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Test if content script is responsive
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Content script ping timeout'));
        }, 2000);

        browser.tabs.sendMessage(tabId, { action: 'ping' }, response => {
          clearTimeout(timeout);
          if (browser.runtime.lastError) {
            reject(new Error(browser.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      if (response && response.success) {
        console.log(`✅ Content script ready in tab ${tabId}`);
        return true;
      }
    } catch (error) {
      console.log(
        `⚠️ Content script not responsive in tab ${tabId}, attempt ${attempt}/${retries}`
      );

      if (attempt === retries) {
        // Last attempt - try to inject content script
        try {
          const tab = await browser.tabs.get(tabId);

          // Check if tab URL is injectable (not chrome://, chrome-extension://, etc.)
          if (!isInjectableUrl(tab.url)) {
            throw new Error(`Cannot inject content script into ${tab.url} - restricted URL`);
          }

          console.log(`🔄 Injecting content script into tab ${tabId}`);

          // Use appropriate API based on browser
          if (browser.scripting) {
            // Chrome MV3
            await browser.scripting.executeScript({
              target: { tabId: tabId },
              files: ['src/content/content.js']
            });
          } else {
            // Firefox MV2 - check if already injected first
            try {
              const result = await browser.tabs.executeScript(tabId, {
                code: 'typeof window.OpenDiaContentScriptLoaded !== "undefined"'
              });

              if (result && result[0]) {
                console.log(`🔄 Content script already present in tab ${tabId}`);
                return true;
              }
            } catch (e) {
              // Continue with injection if check fails
            }

            await browser.tabs.executeScript(tabId, {
              file: 'src/content/content.js'
            });
          }

          // Wait a moment for script to initialize
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Test again
          const testResponse = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout after injection')), 3000);
            browser.tabs.sendMessage(tabId, { action: 'ping' }, response => {
              clearTimeout(timeout);
              if (browser.runtime.lastError) {
                reject(new Error(browser.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });

          if (testResponse && testResponse.success) {
            console.log(`✅ Content script successfully injected into tab ${tabId}`);
            return true;
          }
        } catch (injectionError) {
          throw new Error(
            `Failed to inject content script into tab ${tabId}: ${injectionError.message}`
          );
        }
      }

      // Wait before retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  throw new Error(`Content script not available in tab ${tabId} after ${retries} attempts`);
}

// Check if URL allows content script injection
function isInjectableUrl(url) {
  if (!url) return false;

  const restrictedProtocols = [
    'chrome:',
    'chrome-extension:',
    'chrome-devtools:',
    'edge:',
    'moz-extension:',
    'about:'
  ];
  const restrictedDomains = ['chrome.google.com', 'addons.mozilla.org'];

  // Check protocol
  if (restrictedProtocols.some(protocol => url.startsWith(protocol))) {
    return false;
  }

  // Check special browser pages
  if (
    url.startsWith('https://chrome.google.com/webstore') ||
    url.includes('chrome://') ||
    restrictedDomains.some(domain => url.includes(domain))
  ) {
    return false;
  }

  return true;
}

// Get content script readiness status for a tab
async function getTabContentScriptStatus(tabId) {
  try {
    const tab = await browser.tabs.get(tabId);

    if (!isInjectableUrl(tab.url)) {
      return { ready: false, reason: 'restricted_url', url: tab.url };
    }

    const response = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => resolve(null), 3000); // Increase to 3 seconds
      browser.tabs.sendMessage(tabId, { action: 'ping' }, response => {
        clearTimeout(timeout);
        resolve(response);
      });
    });

    if (response && response.success) {
      return { ready: true, reason: 'active', url: tab.url };
    } else {
      return { ready: false, reason: 'not_loaded', url: tab.url };
    }
  } catch (error) {
    return { ready: false, reason: 'tab_error', error: error.message };
  }
}

// Define available browser automation tools for MCP
function getAvailableTools() {
  return [
    /*
    🎯 BACKGROUND TAB WORKFLOW GUIDE:

    1. DISCOVER TABS: Use tab_list with check_content_script=false to see all tabs and their IDs
    2. TARGET SPECIFIC TABS: Add tab_id parameter to any tool to work on background tabs
    3. MULTI-TAB OPERATIONS: Process multiple tabs without switching between them

    Example Multi-Tab Workflow:
    - tab_list({check_content_script: false}) → Get tab IDs quickly
    - page_analyze({intent_hint: "article", tab_id: 12345}) → Analyze background research tab
    - page_extract_content({content_type: "article", tab_id: 12345}) → Extract content without switching
    - get_selected_text({tab_id: 67890}) → Get quotes from another background tab

    Perfect for: Research workflows, content analysis, form processing, social media management
    */

    // Page Analysis Tools
    {
      name: 'page_analyze',
      description:
        '🔍 BACKGROUND TAB READY: Analyze any tab without switching to it! Two-phase intelligent page analysis with token efficiency optimization. Use tab_id parameter to analyze background tabs while staying on current page.',
      inputSchema: {
        type: 'object',
        examples: [
          { intent_hint: 'analyze', phase: 'discover' }, // Current tab quick analysis
          { intent_hint: 'login', tab_id: 12345 }, // Background tab login form analysis
          { intent_hint: 'post_create', tab_id: 67890, phase: 'detailed' } // Background tab detailed analysis
        ],
        properties: {
          intent_hint: {
            type: 'string',
            description:
              'User intent: login, signup, search, post_create, comment, menu, submit, etc.'
          },
          phase: {
            type: 'string',
            enum: ['discover', 'detailed'],
            default: 'discover',
            description:
              "Analysis phase: 'discover' for quick scan (<100 tokens), 'detailed' for full analysis"
          },
          focus_areas: {
            type: 'array',
            items: { type: 'string' },
            description: 'Areas to analyze in detail: buttons, forms, navigation, search_elements'
          },
          max_results: {
            type: 'number',
            default: 5,
            maximum: 15,
            description: 'Maximum number of elements to return'
          },
          element_ids: {
            type: 'array',
            items: { type: 'string' },
            description: "Expand specific quick match IDs from discover phase (e.g. ['q1', 'q2'])"
          },
          tab_id: {
            type: 'number',
            description:
              '🎯 TARGET ANY TAB: Specify tab ID to analyze background tabs without switching! Get tab IDs from tab_list. If omitted, analyzes current active tab.'
          }
        },
        required: ['intent_hint']
      }
    },
    {
      name: 'page_extract_content',
      description:
        '📄 BACKGROUND TAB READY: Extract content from any tab without switching! Perfect for analyzing multiple research tabs, articles, or pages simultaneously. Use tab_id to target specific background tabs.',
      inputSchema: {
        type: 'object',
        examples: [
          { content_type: 'article' }, // Extract from current tab
          { content_type: 'article', tab_id: 12345 }, // Extract from background research tab
          { content_type: 'posts', tab_id: 67890, max_items: 10 } // Extract social media posts from background tab
        ],
        properties: {
          content_type: {
            type: 'string',
            enum: ['article', 'search_results', 'posts'],
            description: 'Type of content to extract'
          },
          max_items: {
            type: 'number',
            description: 'Maximum number of items to extract (for lists/collections)',
            default: 20
          },
          summarize: {
            type: 'boolean',
            default: true,
            description: 'Return summary instead of full content to save tokens'
          },
          tab_id: {
            type: 'number',
            description:
              '🎯 TARGET ANY TAB: Extract content from specific background tab without switching! Use tab_list to get tab IDs. Perfect for processing multiple research tabs.'
          }
        },
        required: ['content_type']
      }
    },

    // Element Interaction Tools
    {
      name: 'element_click',
      description:
        '🖱️ BACKGROUND TAB READY: Click elements in any tab without switching! Perform actions on background tabs while staying on current page. Use tab_id to target specific tabs.',
      inputSchema: {
        type: 'object',
        properties: {
          element_id: {
            type: 'string',
            description: 'Unique element identifier from page_analyze'
          },
          click_type: {
            type: 'string',
            enum: ['left', 'right', 'double'],
            default: 'left'
          },
          wait_after: {
            type: 'number',
            description: 'Milliseconds to wait after click',
            default: 500
          },
          tab_id: {
            type: 'number',
            description:
              '🎯 TARGET ANY TAB: Click elements in background tabs without switching! Get tab IDs from tab_list to interact with multiple tabs efficiently.'
          }
        },
        required: ['element_id']
      }
    },
    {
      name: 'element_fill',
      description:
        '✏️ BACKGROUND TAB READY: Fill forms in any tab without switching! Enhanced focus and event simulation for modern web apps. Use tab_id to fill forms in background tabs.',
      inputSchema: {
        type: 'object',
        properties: {
          element_id: {
            type: 'string',
            description: 'Unique element identifier from page_analyze'
          },
          value: {
            type: 'string',
            description: 'Text value to input'
          },
          clear_first: {
            type: 'boolean',
            description: 'Clear existing content before filling',
            default: true
          },
          force_focus: {
            type: 'boolean',
            description: 'Use enhanced focus sequence with click simulation for modern apps',
            default: true
          },
          tab_id: {
            type: 'number',
            description:
              '🎯 TARGET ANY TAB: Fill forms in background tabs without switching! Perfect for batch form filling across multiple tabs. Get tab IDs from tab_list.'
          }
        },
        required: ['element_id', 'value']
      }
    },

    // Navigation Tools
    {
      name: 'page_navigate',
      description:
        'Navigate CURRENT tab to a new URL. Use tab_create instead if you want to open a NEW tab with a URL.',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to navigate to'
          },
          wait_for: {
            type: 'string',
            description: 'CSS selector to wait for after navigation (ensures page is ready)'
          },
          timeout: {
            type: 'number',
            description: 'Maximum wait time in milliseconds',
            default: 10000
          }
        },
        required: ['url']
      }
    },
    {
      name: 'page_wait_for',
      description: 'Wait for specific element or condition on current page',
      inputSchema: {
        type: 'object',
        properties: {
          condition_type: {
            type: 'string',
            enum: ['element_visible', 'text_present'],
            description: 'Type of condition to wait for'
          },
          selector: {
            type: 'string',
            description: 'CSS selector for element-based conditions'
          },
          text: {
            type: 'string',
            description: "Text to wait for (when condition_type is 'text_present')"
          },
          timeout: {
            type: 'number',
            description: 'Maximum wait time in milliseconds',
            default: 5000
          }
        },
        required: ['condition_type']
      }
    },

    // Tab Management Tools
    {
      name: 'tab_create',
      description:
        "Creates tabs. CRITICAL: For multiple identical tabs, ALWAYS use 'count' parameter! Examples: {url: 'https://x.com', count: 5} creates 5 Twitter tabs. {url: 'https://github.com', count: 10} creates 10 GitHub tabs. Single tab: {url: 'https://example.com'}. Multiple different URLs: {urls: ['url1', 'url2']}.",
      inputSchema: {
        type: 'object',
        examples: [
          { url: 'https://x.com', count: 5 }, // CORRECT: Creates 5 identical Twitter tabs in one batch
          { url: 'https://github.com', count: 10 }, // CORRECT: Creates 10 GitHub tabs
          {
            urls: ['https://x.com/post1', 'https://x.com/post2', 'https://google.com']
          }, // CORRECT: Different URLs in batch
          { url: 'https://example.com' } // Single tab only
        ],
        properties: {
          url: {
            type: 'string',
            description:
              "Single URL to open. Can be used with 'count' to create multiple identical tabs"
          },
          urls: {
            type: 'array',
            items: { type: 'string' },
            description:
              "PREFERRED FOR MULTIPLE URLS: Array of URLs to open ALL AT ONCE in a single batch operation. Pass ALL URLs here instead of making multiple calls! Example: ['https://x.com/post1', 'https://x.com/post2', 'https://google.com']",
            maxItems: 100
          },
          count: {
            type: 'number',
            default: 1,
            minimum: 1,
            maximum: 50,
            description:
              "REQUIRED FOR MULTIPLE IDENTICAL TABS: Set this to N to create N copies of the same URL. For '5 Twitter tabs' use count=5 with url='https://x.com'. DO NOT make 5 separate calls!"
          },
          active: {
            type: 'boolean',
            default: true,
            description: 'Whether to activate the last created tab (single tab only)'
          },
          wait_for: {
            type: 'string',
            description: 'CSS selector to wait for after tab creation (single tab only)'
          },
          timeout: {
            type: 'number',
            default: 10000,
            description: 'Maximum wait time per tab in milliseconds'
          },
          batch_settings: {
            type: 'object',
            description: 'Performance control settings for batch operations',
            properties: {
              chunk_size: {
                type: 'number',
                default: 5,
                minimum: 1,
                maximum: 10,
                description: 'Number of tabs to create per batch'
              },
              delay_between_chunks: {
                type: 'number',
                default: 1000,
                minimum: 100,
                maximum: 5000,
                description: 'Delay between batches in milliseconds'
              },
              delay_between_tabs: {
                type: 'number',
                default: 200,
                minimum: 50,
                maximum: 1000,
                description: 'Delay between individual tabs in milliseconds'
              }
            }
          }
        }
      }
    },
    {
      name: 'tab_close',
      description: 'Close specific tab(s) by ID or close current tab',
      inputSchema: {
        type: 'object',
        properties: {
          tab_id: {
            type: 'number',
            description: 'Specific tab ID to close (optional, closes current tab if not provided)'
          },
          tab_ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of tab IDs to close multiple tabs'
          }
        }
      }
    },
    {
      name: 'tab_list',
      description:
        '📋 TAB DISCOVERY: Get list of all open tabs with IDs for background tab targeting! Shows content script readiness status and tab details. Essential for multi-tab workflows - use tab IDs with other tools to work on background tabs.',
      inputSchema: {
        type: 'object',
        examples: [
          { check_content_script: false }, // RECOMMENDED: Default false to avoid timeouts
          { current_window_only: false, check_content_script: false } // Get all tabs across windows
        ],
        properties: {
          current_window_only: {
            type: 'boolean',
            default: true,
            description: 'Only return tabs from the current window'
          },
          include_details: {
            type: 'boolean',
            default: true,
            description: 'Include additional tab details (title, favicon, etc.)'
          },
          check_content_script: {
            type: 'boolean',
            default: false,
            description:
              '🔍 ESSENTIAL FOR BACKGROUND TABS: Check which tabs are ready for background operations! Set to true when planning multi-tab workflows to see which tabs can be targeted.'
          }
        }
      }
    },
    {
      name: 'tab_switch',
      description: 'Switch to a specific tab by ID',
      inputSchema: {
        type: 'object',
        properties: {
          tab_id: {
            type: 'number',
            description: 'Tab ID to switch to'
          }
        },
        required: ['tab_id']
      }
    },

    // Element State Tools
    {
      name: 'element_get_state',
      description:
        'Get detailed state information for a specific element (disabled, clickable, etc.)',
      inputSchema: {
        type: 'object',
        properties: {
          element_id: {
            type: 'string',
            description: 'Element ID from page_analyze'
          }
        },
        required: ['element_id']
      }
    },
    // Workspace and Reference Management Tools
    {
      name: 'get_bookmarks',
      description: 'Get all bookmarks or search for specific bookmarks',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for bookmarks (optional)'
          }
        }
      }
    },
    {
      name: 'add_bookmark',
      description: 'Add a new bookmark',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Title of the bookmark'
          },
          url: {
            type: 'string',
            description: 'URL of the bookmark'
          },
          parentId: {
            type: 'string',
            description: 'ID of the parent folder (optional)'
          }
        },
        required: ['title', 'url']
      }
    },
    {
      name: 'get_history',
      description:
        'Search browser history with comprehensive filters for finding previous work by date/keywords',
      inputSchema: {
        type: 'object',
        properties: {
          keywords: {
            type: 'string',
            description: 'Search keywords to match in page titles and URLs'
          },
          start_date: {
            type: 'string',
            format: 'date-time',
            description: 'Start date for history search (ISO 8601 format)'
          },
          end_date: {
            type: 'string',
            format: 'date-time',
            description: 'End date for history search (ISO 8601 format)'
          },
          domains: {
            type: 'array',
            items: { type: 'string' },
            description: "Filter by specific domains (e.g., ['github.com', 'stackoverflow.com'])"
          },
          min_visit_count: {
            type: 'number',
            default: 1,
            description: 'Minimum visit count threshold'
          },
          max_results: {
            type: 'number',
            default: 50,
            maximum: 500,
            description: 'Maximum number of results to return'
          },
          sort_by: {
            type: 'string',
            enum: ['visit_time', 'visit_count', 'title'],
            default: 'visit_time',
            description: 'Sort results by visit time, visit count, or title'
          },
          sort_order: {
            type: 'string',
            enum: ['desc', 'asc'],
            default: 'desc',
            description: 'Sort order (descending or ascending)'
          }
        }
      }
    },
    {
      name: 'get_selected_text',
      description:
        '📝 BACKGROUND TAB READY: Get selected text from any tab without switching! Perfect for collecting quotes, citations, or highlighted content from multiple research tabs simultaneously.',
      inputSchema: {
        type: 'object',
        properties: {
          include_metadata: {
            type: 'boolean',
            default: true,
            description: 'Include metadata about the selection (element info, position, etc.)'
          },
          max_length: {
            type: 'number',
            default: 10000,
            description: 'Maximum length of text to return'
          },
          tab_id: {
            type: 'number',
            description:
              '🎯 TARGET ANY TAB: Get selected text from background tabs without switching! Perfect for collecting quotes or snippets from multiple research tabs.'
          }
        }
      }
    },
    {
      name: 'page_scroll',
      description:
        '📜 BACKGROUND TAB READY: Scroll any tab without switching! Critical for long pages. Navigate through content in background tabs while staying on current page. Use tab_id to target specific tabs.',
      inputSchema: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right', 'top', 'bottom'],
            default: 'down',
            description: 'Direction to scroll'
          },
          amount: {
            type: 'string',
            enum: ['small', 'medium', 'large', 'page', 'custom'],
            default: 'medium',
            description: 'Amount to scroll'
          },
          pixels: {
            type: 'number',
            description: "Custom pixel amount (when amount is 'custom')"
          },
          smooth: {
            type: 'boolean',
            default: true,
            description: 'Use smooth scrolling animation'
          },
          element_id: {
            type: 'string',
            description: 'Scroll to specific element (overrides direction/amount)'
          },
          wait_after: {
            type: 'number',
            default: 500,
            description: 'Milliseconds to wait after scrolling'
          },
          tab_id: {
            type: 'number',
            description:
              '🎯 TARGET ANY TAB: Scroll content in background tabs without switching! Perfect for navigating long documents or pages in multiple tabs simultaneously.'
          }
        }
      }
    },
    {
      name: 'get_page_links',
      description: 'Get all hyperlinks on the current page with filtering options',
      inputSchema: {
        type: 'object',
        properties: {
          link_type: {
            type: 'string',
            enum: ['all', 'internal', 'external'],
            default: 'all',
            description: 'Filter by internal/external links'
          },
          domains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Filter by specific domains (optional)'
          },
          max_results: {
            type: 'number',
            default: 50,
            maximum: 200,
            description: 'Maximum links to return'
          }
        }
      }
    },
    {
      name: 'page_style',
      description:
        "🎨 Transform page appearance with themes, colors, fonts, and fun effects! Apply preset themes like 'dark_hacker', 'retro_80s', or create custom styles. Perfect for making boring pages fun or improving readability.",
      inputSchema: {
        type: 'object',
        examples: [
          { mode: 'preset', theme: 'dark_hacker' },
          {
            mode: 'custom',
            background: '#000',
            text_color: '#00ff00',
            font: 'monospace'
          },
          {
            mode: 'ai_mood',
            mood: 'cozy coffee shop vibes',
            intensity: 'strong'
          },
          { mode: 'effect', effect: 'matrix_rain', duration: 30 }
        ],
        properties: {
          mode: {
            type: 'string',
            enum: ['preset', 'custom', 'ai_mood', 'effect', 'reset'],
            description: 'Styling mode to use'
          },
          theme: {
            type: 'string',
            enum: [
              'dark_hacker',
              'retro_80s',
              'rainbow_party',
              'minimalist_zen',
              'high_contrast',
              'cyberpunk',
              'pastel_dream',
              'newspaper'
            ],
            description: 'Preset theme name (when mode=preset)'
          },
          background: {
            type: 'string',
            description: 'Background color/gradient'
          },
          text_color: {
            type: 'string',
            description: 'Text color'
          },
          font: {
            type: 'string',
            description: 'Font family'
          },
          font_size: {
            type: 'string',
            description: "Font size (e.g., '1.2em', '16px')"
          },
          mood: {
            type: 'string',
            description: 'Describe desired mood/feeling (when mode=ai_mood)'
          },
          intensity: {
            type: 'string',
            enum: ['subtle', 'medium', 'strong'],
            default: 'medium'
          },
          effect: {
            type: 'string',
            enum: [
              'matrix_rain',
              'floating_particles',
              'cursor_trail',
              'neon_glow',
              'typing_effect'
            ]
          },
          duration: {
            type: 'number',
            description: 'Effect duration in seconds',
            default: 10
          },
          remember: {
            type: 'boolean',
            description: 'Remember this style for this website',
            default: false
          }
        },
        required: ['mode']
      }
    },
    {
      name: 'page_execute_script',
      description:
        '🔧 EXECUTE JAVASCRIPT: Run custom JavaScript code in a browser tab context to inspect the page, extract content, or retrieve specific data. Returns the result of the script execution. Perfect for dynamic content extraction, HTML inspection, and page state analysis.',
      inputSchema: {
        type: 'object',
        examples: [
          { script: 'document.title', description: 'Get page title' },
          {
            script: 'document.body.innerText.substring(0, 500)',
            description: 'Get first 500 chars of body text'
          },
          {
            script: "Array.from(document.querySelectorAll('h1')).map(h => h.textContent)",
            description: 'Get all h1 headings'
          },
          {
            script:
              '({ url: window.location.href, title: document.title, html: document.documentElement.outerHTML })',
            description: 'Get page info with HTML source'
          }
        ],
        properties: {
          script: {
            type: 'string',
            description:
              'JavaScript code to execute in the page context. Should return a value (use return statement or expression). Can access DOM, window, document, and all page variables. Complex objects will be JSON-serialized.'
          },
          tab_id: {
            type: 'number',
            description:
              '🎯 TARGET ANY TAB: Execute script in specific background tab without switching! Use tab_list to get tab IDs. If omitted, executes in current active tab.'
          },
          timeout: {
            type: 'number',
            default: 5000,
            description: 'Maximum execution time in milliseconds'
          },
          include_context: {
            type: 'boolean',
            default: true,
            description: 'Include browser context (URL, title, tab info) in the response'
          }
        },
        required: ['script']
      }
    },
    {
      name: 'test_csp_bypass',
      description:
        '🧪 TEST CSP BYPASS: Run tests to evaluate different approaches for executing scripts on pages with strict Content Security Policy (like LinkedIn). Returns comparison of all approaches showing which work and which are blocked.',
      inputSchema: {
        type: 'object',
        properties: {
          tab_id: {
            type: 'number',
            description: 'Tab ID to test against (should be a page with strict CSP like LinkedIn job page)'
          },
          test_script: {
            type: 'string',
            default: 'document.title',
            description: 'Simple test script to try executing'
          },
          approaches: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific approaches to test. If omitted, tests all approaches.'
          }
        }
      }
    },
    {
      name: 'file_upload',
      description:
        '📁 Upload a file to a file input element. Fetches file from URL (bypasses CORS) and injects into file input using DataTransfer API. Perfect for form automation.',
      inputSchema: {
        type: 'object',
        properties: {
          file_url: {
            type: 'string',
            description: 'URL to fetch the file from (can be localhost, bypasses CORS)'
          },
          file_name: {
            type: 'string',
            description: 'Name for the file (e.g., "resume.pdf")'
          },
          file_selector: {
            type: 'string',
            description: 'CSS selector for the file input element (default: input[type="file"])',
            default: 'input[type="file"]'
          },
          mime_type: {
            type: 'string',
            description: 'MIME type (auto-detected from URL if not provided)'
          },
          tab_id: {
            type: 'number',
            description: 'Target tab ID (defaults to active tab)'
          }
        },
        required: ['file_url', 'file_name']
      }
    },
    {
      name: 'select_element',
      description:
        '🎯 INTERACTIVE SELECTION: Allows the user to select an element on the page by highlighting it (similar to DevTools). Returns the HTML of the selected element (truncated if too long) and a summary of its attributes and parent. Useful when you need the user to point out a specific element.',
      inputSchema: {
        type: 'object',
        properties: {
          tab_id: {
            type: 'number',
            description: 'Target tab ID (defaults to active tab)'
          }
        }
      }
    },
    {
      name: 'page_structure',
      description:
        '🏗️ BUILD PAGE OUTLINE: Creates a hierarchical structural outline of the current page with intelligent grouping of repeated elements. Returns a tree with bounding boxes, interactive elements, landmarks, and text previews. Perfect for understanding complex page layouts. Default format is compact text (much more efficient than JSON).',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['compact', 'json'],
            default: 'compact',
            description: 'Output format: "compact" (efficient text tree) or "json" (full nested structure)'
          },
          max_depth: {
            type: 'number',
            default: 8,
            description: 'Maximum depth to traverse the DOM tree'
          },
          max_nodes: {
            type: 'number',
            default: 400,
            description: 'Maximum number of nodes to include in the outline'
          },
          max_children_per_group: {
            type: 'number',
            default: 6,
            description: 'Maximum siblings before grouping them'
          },
          examples_per_group: {
            type: 'number',
            default: 3,
            description: 'Number of example nodes to show for grouped elements'
          },
          tab_id: {
            type: 'number',
            description: 'Target tab ID (defaults to active tab)'
          }
        }
      }
    }
  ];
}

// Handle MCP requests with enhanced automation tools
async function handleMCPRequest(message) {
  const { id, method, params } = message;

  try {
    // Ensure connection for Chrome service workers
    await connectionManager.ensureConnection();

    // Safety Mode check: Block write/edit tools if safety mode is enabled
    if (safetyModeEnabled && WRITE_EDIT_TOOLS.includes(method)) {
      const targetInfo = params.tab_id ? `tab ${params.tab_id}` : 'the current page';
      throw new Error(
        `🛡️ Safety Mode is enabled. This tool (${method}) is blocked to prevent modifications to ${targetInfo}. To disable Safety Mode, open the OpenDia extension popup and toggle off "Safety Mode".`
      );
    }

    let result;

    switch (method) {
      // New automation tools with background tab support
      case 'page_analyze':
        result = await sendToContentScript('analyze', params, params.tab_id);
        break;
      case 'page_extract_content':
        result = await sendToContentScript('extract_content', params, params.tab_id);
        break;
      case 'element_click':
        result = await sendToContentScript('element_click', params, params.tab_id);
        break;
      case 'element_fill':
        result = await sendToContentScript('element_fill', params, params.tab_id);
        break;
      case 'page_navigate':
        result = await navigateToUrl(params.url, params.wait_for, params.timeout);
        break;
      case 'page_wait_for':
        result = await sendToContentScript('wait_for', params, params.tab_id);
        break;

      // Tab management tools
      case 'tab_create':
        result = await createTab(params);
        break;
      case 'tab_close':
        result = await closeTabs(params);
        break;
      case 'tab_list':
        result = await listTabs(params);
        break;
      case 'tab_switch':
        result = await switchToTab(params.tab_id);
        break;

      // Element state tools
      case 'element_get_state':
        result = await sendToContentScript('get_element_state', params, params.tab_id);
        break;
      // Workspace and Reference Management Tools
      case 'get_bookmarks':
        result = await getBookmarks(params);
        break;
      case 'add_bookmark':
        result = await addBookmark(params);
        break;
      case 'get_history':
        result = await getHistory(params);
        break;
      case 'get_selected_text':
        result = await getSelectedText(params);
        break;
      case 'page_scroll':
        result = await sendToContentScript('page_scroll', params, params.tab_id);
        break;
      case 'get_page_links':
        result = await sendToContentScript('get_page_links', params, params.tab_id);
        break;
      case 'page_style':
        result = await sendToContentScript('page_style', params, params.tab_id);
        break;
      case 'page_execute_script':
        result = await executeScriptInTab(params);
        break;
      case 'test_csp_bypass':
        result = await testCspBypassApproaches(params);
        break;
      case 'file_upload':
        result = await uploadFileToInput(params);
        break;
      case 'select_element':
        result = await sendToContentScript('select_element', params, params.tab_id);
        break;
      case 'page_structure':
        result = await sendToContentScript('page_structure', params, params.tab_id);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }

    // Send success response
    connectionManager.send({
      id,
      result
    });
  } catch (error) {
    // Send error response
    connectionManager.send({
      id,
      error: {
        message: error.message,
        code: -32603
      }
    });
  }
}

// Enhanced content script communication with background tab support
async function sendToContentScript(action, data, targetTabId = null) {
  let targetTab;

  if (targetTabId) {
    // Use specific tab
    try {
      targetTab = await browser.tabs.get(targetTabId);
    } catch (error) {
      throw new Error(`Tab ${targetTabId} not found or inaccessible`);
    }
  } else {
    // Fallback to active tab (maintains compatibility)
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!activeTab) {
      throw new Error('No active tab found');
    }
    targetTab = activeTab;
  }

  // Ensure content script is available in the target tab
  await ensureContentScriptReady(targetTab.id);

  return new Promise((resolve, reject) => {
    browser.tabs.sendMessage(targetTab.id, { action, data }, response => {
      if (browser.runtime.lastError) {
        reject(new Error(`Tab ${targetTab.id}: ${browser.runtime.lastError.message}`));
      } else if (response && response.success) {
        resolve(response.data);
      } else {
        reject(new Error(`Tab ${targetTab.id}: ${response?.error || 'Unknown error'}`));
      }
    });
  });
}

async function navigateToUrl(url, waitFor, timeout = 10000) {
  const [activeTab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  await browser.tabs.update(activeTab.id, { url });

  // If waitFor is specified, wait for the element to appear
  if (waitFor) {
    try {
      await waitForElement(activeTab.id, waitFor, timeout);
    } catch (error) {
      return {
        success: true,
        tabId: activeTab.id,
        warning: `Navigation completed but wait condition failed: ${error.message}`
      };
    }
  }

  return { success: true, tabId: activeTab.id, url: url };
}

async function waitForElement(tabId, selector, timeout = 5000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await browser.tabs.sendMessage(tabId, {
        action: 'wait_for',
        data: {
          condition_type: 'element_visible',
          selector: selector,
          timeout: 1000
        }
      });

      if (result.success) {
        return true;
      }
    } catch (error) {
      // Content script might not be ready yet, continue waiting
    }

    // Wait 500ms before next check
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Timeout waiting for element: ${selector}`);
}

// Enhanced Tab Management Functions with Batch Support
async function createTab(params) {
  const {
    url,
    urls,
    count = 1,
    active = true,
    wait_for,
    timeout = 10000,
    batch_settings = {}
  } = params;

  // Smart hint: If creating single tab but description suggests multiple, provide guidance
  if (count === 1 && !urls) {
    console.log(
      `💡 Single tab creation. For multiple identical tabs, use count parameter: {"url": "${url}", "count": N}`
    );
  }

  // Validate parameters
  const validation = validateTabCreateParams(params);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  console.log(`🎯 Tab creation request:`, {
    url,
    urls,
    count,
    batch_settings,
    hasBatchSettings: !!batch_settings
  });

  // Determine operation type
  if (urls && urls.length > 0) {
    // Batch creation with multiple URLs
    console.log(`🚀 Using batch mode with ${urls.length} URLs`);
    return await createTabsBatch(urls, active, wait_for, timeout, batch_settings);
  } else if (url && count > 1) {
    // Batch creation with same URL repeated
    console.log(`🔄 Using repeat mode: ${count} copies of ${url}`);
    const urlArray = Array(count).fill(url);
    return await createTabsBatch(urlArray, active, wait_for, timeout, batch_settings);
  } else {
    // Single tab creation (legacy behavior)
    console.log(`📱 Using single tab mode for: ${url || 'about:blank'}`);
    return await createSingleTab(url, active, wait_for, timeout);
  }
}

// Parameter validation
function validateTabCreateParams(params) {
  const { url, urls, count = 1 } = params;

  // Check for conflicting parameters
  if (url && urls) {
    return {
      valid: false,
      error: "Cannot specify both 'url' and 'urls' parameters"
    };
  }

  if (urls && count > 1) {
    return { valid: false, error: "Cannot use 'count' with 'urls' array" };
  }

  // Allow empty URL for about:blank tabs
  if (!url && !urls && count > 1) {
    return {
      valid: false,
      error: "Must specify 'url' when using 'count' parameter"
    };
  }

  // Validate URLs array
  if (urls) {
    if (!Array.isArray(urls) || urls.length === 0) {
      return { valid: false, error: "'urls' must be a non-empty array" };
    }

    if (urls.length > 100) {
      return {
        valid: false,
        error: 'Maximum 100 URLs allowed in batch operation'
      };
    }

    // Validate each URL
    for (let i = 0; i < urls.length; i++) {
      if (typeof urls[i] !== 'string' || !urls[i].trim()) {
        return {
          valid: false,
          error: `Invalid URL at index ${i}: must be a non-empty string`
        };
      }
    }
  }

  // Validate count
  if (count < 1 || count > 50) {
    return { valid: false, error: 'Count must be between 1 and 50' };
  }

  return { valid: true };
}

// Single tab creation (original behavior)
async function createSingleTab(url, active, wait_for, timeout) {
  const createProperties = { active };
  if (url) {
    createProperties.url = url;
  }

  console.log(`🔍 Creating single tab with properties:`, createProperties);
  const newTab = await browser.tabs.create(createProperties);
  console.log(`📝 Tab created:`, {
    id: newTab.id,
    url: newTab.url,
    pendingUrl: newTab.pendingUrl
  });

  // Wait a moment for the URL to load
  if (url) {
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if tab loaded correctly
    try {
      const updatedTab = await browser.tabs.get(newTab.id);
      console.log(`🔄 Tab after load check:`, {
        id: updatedTab.id,
        url: updatedTab.url,
        status: updatedTab.status
      });

      // If URL was provided and wait_for is specified, wait for the element
      if (wait_for) {
        try {
          await waitForElement(newTab.id, wait_for, timeout);
        } catch (error) {
          return {
            success: true,
            tab_id: newTab.id,
            url: updatedTab.url,
            actual_url: updatedTab.url,
            requested_url: url,
            warning: `Tab created but wait condition failed: ${error.message}`
          };
        }
      }

      return {
        success: true,
        tab_id: newTab.id,
        url: updatedTab.url || updatedTab.pendingUrl || url,
        actual_url: updatedTab.url || updatedTab.pendingUrl,
        requested_url: url,
        active: updatedTab.active,
        status: updatedTab.status,
        title: updatedTab.title || 'New Tab',
        note:
          updatedTab.url === 'about:blank' && updatedTab.pendingUrl
            ? 'Tab is still loading'
            : undefined
      };
    } catch (error) {
      console.error(`❌ Error checking tab status:`, error);
      return {
        success: true,
        tab_id: newTab.id,
        url: newTab.url || 'about:blank',
        actual_url: newTab.url,
        requested_url: url,
        active: newTab.active,
        title: newTab.title || 'New Tab',
        warning: `Tab created but status check failed: ${error.message}`
      };
    }
  }

  return {
    success: true,
    tab_id: newTab.id,
    url: newTab.url || 'about:blank',
    active: newTab.active,
    title: newTab.title || 'New Tab'
  };
}

// Batch tab creation with performance throttling
async function createTabsBatch(urls, active, wait_for, timeout, batch_settings = {}) {
  console.log('🔍 createTabsBatch called with:', {
    urls: urls.length,
    batch_settings
  });

  const {
    chunk_size = 5,
    delay_between_chunks = 1000,
    delay_between_tabs = 200
  } = batch_settings || {};

  const startTime = Date.now();
  const totalTabs = urls.length;
  const createdTabs = [];
  const errors = [];

  // Performance warnings
  const warnings = [];
  if (totalTabs > 20) {
    warnings.push(`Creating ${totalTabs} tabs may impact browser performance`);
  }
  if (totalTabs > 45) {
    warnings.push(
      `Large batch (${totalTabs} tabs) may hit Chrome's tab limits or cause memory issues`
    );
  }

  console.log(`🚀 Starting batch tab creation: ${totalTabs} tabs in chunks of ${chunk_size}`);

  // Process in chunks
  for (let chunkStart = 0; chunkStart < urls.length; chunkStart += chunk_size) {
    const chunkEnd = Math.min(chunkStart + chunk_size, urls.length);
    const chunk = urls.slice(chunkStart, chunkEnd);
    const chunkIndex = Math.floor(chunkStart / chunk_size) + 1;
    const totalChunks = Math.ceil(urls.length / chunk_size);

    // Reduced logging for better performance
    if (totalTabs > 10) {
      console.log(`📦 Chunk ${chunkIndex}/${totalChunks}`);
    }

    // Create tabs in current chunk with delays
    for (let i = 0; i < chunk.length; i++) {
      const url = chunk[i];
      const globalIndex = chunkStart + i;
      const isLastTab = globalIndex === totalTabs - 1;

      try {
        // Only activate the very last tab if active=true
        const shouldActivate = active && isLastTab;

        const tab = await browser.tabs.create({
          url: url,
          active: shouldActivate
        });

        // Wait a moment and check actual URL
        await new Promise(resolve => setTimeout(resolve, 300));
        const updatedTab = await browser.tabs.get(tab.id);

        createdTabs.push({
          tab_id: tab.id,
          url: updatedTab.url || url,
          requested_url: url,
          index: globalIndex,
          active: updatedTab.active,
          title: updatedTab.title || `Tab ${globalIndex + 1}`
        });

        // Only log for small batches to avoid context overflow
        if (totalTabs <= 5) {
          console.log(`✅ Created tab ${globalIndex + 1}/${totalTabs}: ${url} (ID: ${tab.id})`);
        }

        // Wait between individual tabs (except last in chunk)
        if (i < chunk.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delay_between_tabs));
        }
      } catch (error) {
        console.error(`❌ Failed to create tab ${globalIndex + 1}: ${error.message}`);
        errors.push({
          index: globalIndex,
          url: url,
          error: error.message
        });
      }
    }

    // Wait between chunks (except after last chunk)
    if (chunkEnd < urls.length) {
      if (totalTabs <= 10) {
        console.log(`⏳ Waiting ${delay_between_chunks}ms before next chunk...`);
      }
      await new Promise(resolve => setTimeout(resolve, delay_between_chunks));
    }
  }

  const executionTime = Date.now() - startTime;
  const successCount = createdTabs.length;
  const errorCount = errors.length;

  console.log(
    `🏁 Batch creation complete: ${successCount}/${totalTabs} successful in ${executionTime}ms`
  );

  // Prepare result - simplified to avoid context overflow
  const result = {
    success: errorCount === 0,
    batch_operation: true,
    summary: {
      total_requested: totalTabs,
      successful: successCount,
      failed: errorCount,
      execution_time_ms: executionTime
    },
    // Only include full tab details for small batches
    created_tabs:
      totalTabs <= 10
        ? createdTabs
        : createdTabs.map(tab => ({
            tab_id: tab.tab_id,
            url: tab.url
          }))
  };

  // Add warnings if any
  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  // Add errors if any
  if (errors.length > 0) {
    result.errors = errors;
    result.partial_success = successCount > 0;
  }

  // Add active tab info
  const activeTabs = createdTabs.filter(tab => tab.active);
  if (activeTabs.length > 0) {
    result.active_tab = activeTabs[0];
  }

  return result;
}

// Utility function to generate URLs for testing/demo purposes
function generateTestUrls(baseUrl, count) {
  const urls = [];
  for (let i = 1; i <= count; i++) {
    urls.push(`${baseUrl}?tab=${i}`);
  }
  return urls;
}

// Batch operation helper functions
function estimateBatchTime(urlCount, batchSettings = {}) {
  const {
    chunk_size = 5,
    delay_between_chunks = 1000,
    delay_between_tabs = 200
  } = batchSettings || {};

  const totalChunks = Math.ceil(urlCount / chunk_size);
  const timePerChunk = (chunk_size - 1) * delay_between_tabs; // delays within chunk
  const timeForChunks = totalChunks * timePerChunk;
  const timeBetweenChunks = (totalChunks - 1) * delay_between_chunks;

  return timeForChunks + timeBetweenChunks; // in milliseconds
}

async function closeTabs(params) {
  const { tab_id, tab_ids } = params;

  let tabsToClose = [];

  if (tab_ids && Array.isArray(tab_ids)) {
    // Close multiple tabs
    tabsToClose = tab_ids;
  } else if (tab_id) {
    // Close specific tab
    tabsToClose = [tab_id];
  } else {
    // Close current tab
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true
    });
    if (activeTab) {
      tabsToClose = [activeTab.id];
    }
  }

  if (tabsToClose.length === 0) {
    throw new Error('No tabs specified to close');
  }

  // Close tabs
  await browser.tabs.remove(tabsToClose);

  return {
    success: true,
    closed_tabs: tabsToClose,
    count: tabsToClose.length
  };
}

async function listTabs(params) {
  const {
    current_window_only = true,
    include_details = true,
    check_content_script = false
  } = params;

  const queryOptions = {};
  if (current_window_only) {
    queryOptions.currentWindow = true;
  }

  const tabs = await browser.tabs.query(queryOptions);

  // Check content script status if requested
  const contentScriptStatuses = new Map();
  if (check_content_script) {
    const statusPromises = tabs.map(async tab => {
      try {
        const status = await getTabContentScriptStatus(tab.id);
        return [tab.id, status];
      } catch (error) {
        return [tab.id, { ready: false, reason: 'error', error: error.message }];
      }
    });

    const results = await Promise.all(statusPromises);
    results.forEach(([tabId, status]) => {
      contentScriptStatuses.set(tabId, status);
    });
  }

  const tabList = tabs.map(tab => {
    const basicInfo = {
      id: tab.id,
      url: tab.url,
      active: tab.active,
      title: tab.title
    };

    // Add content script status if checked
    if (check_content_script) {
      const scriptStatus = contentScriptStatuses.get(tab.id);
      basicInfo.content_script = {
        ready: scriptStatus?.ready || false,
        reason: scriptStatus?.reason || 'unknown',
        injectable: isInjectableUrl(tab.url)
      };
    }

    if (include_details) {
      return {
        ...basicInfo,
        index: tab.index,
        pinned: tab.pinned,
        status: tab.status,
        favIconUrl: tab.favIconUrl,
        windowId: tab.windowId,
        incognito: tab.incognito
      };
    }

    return basicInfo;
  });

  // Calculate summary statistics
  const summary = {
    total_tabs: tabList.length,
    active_tab: tabs.find(tab => tab.active)?.id || null
  };

  if (check_content_script) {
    const readyTabs = tabList.filter(tab => tab.content_script?.ready).length;
    const injectableTabs = tabList.filter(tab => tab.content_script?.injectable).length;

    summary.content_script_stats = {
      ready_count: readyTabs,
      injectable_count: injectableTabs,
      restricted_count: tabList.length - injectableTabs
    };
  }

  return {
    success: true,
    tabs: tabList,
    count: tabList.length,
    summary
  };
}

async function switchToTab(tabId) {
  // First, get tab info to ensure it exists
  const tab = await browser.tabs.get(tabId);

  if (!tab) {
    throw new Error(`Tab with ID ${tabId} not found`);
  }

  // Switch to the tab
  await browser.tabs.update(tabId, { active: true });

  // Also focus the window containing the tab
  await browser.windows.update(tab.windowId, { focused: true });

  return {
    success: true,
    tab_id: tabId,
    url: tab.url,
    title: tab.title,
    window_id: tab.windowId
  };
}

// Workspace and Reference Management Functions
async function getBookmarks(params) {
  const { query } = params;

  let bookmarks;
  if (query) {
    bookmarks = await browser.bookmarks.search(query);
  } else {
    bookmarks = await browser.bookmarks.getTree();
  }

  return {
    success: true,
    bookmarks,
    count: bookmarks.length
  };
}

async function addBookmark(params) {
  const { title, url, parentId } = params;

  const bookmark = await browser.bookmarks.create({
    title,
    url,
    parentId
  });

  return {
    success: true,
    bookmark
  };
}

// History Management Function
async function getHistory(params) {
  const {
    keywords = '',
    start_date,
    end_date,
    domains = [],
    min_visit_count = 1,
    max_results = 50,
    sort_by = 'visit_time',
    sort_order = 'desc'
  } = params;

  try {
    // Browser History API search configuration
    const searchQuery = {
      text: keywords,
      maxResults: Math.min(max_results * 3, 1000) // Over-fetch for filtering
    };

    // Add date range if specified
    if (start_date) {
      searchQuery.startTime = new Date(start_date).getTime();
    }
    if (end_date) {
      searchQuery.endTime = new Date(end_date).getTime();
    }

    // Execute history search
    const historyItems = await browser.history.search(searchQuery);

    // Apply advanced filters
    const filteredItems = historyItems.filter(item => {
      // Domain filter
      if (domains.length > 0) {
        try {
          const itemDomain = new URL(item.url).hostname;
          if (!domains.some(domain => itemDomain.includes(domain))) {
            return false;
          }
        } catch (e) {
          // Skip items with invalid URLs
          return false;
        }
      }

      // Visit count filter
      if (item.visitCount < min_visit_count) {
        return false;
      }

      return true;
    });

    // Sort results
    filteredItems.sort((a, b) => {
      let aVal, bVal;
      switch (sort_by) {
        case 'visit_count':
          aVal = a.visitCount;
          bVal = b.visitCount;
          break;
        case 'title':
          aVal = (a.title || '').toLowerCase();
          bVal = (b.title || '').toLowerCase();
          break;
        default: // visit_time
          aVal = a.lastVisitTime;
          bVal = b.lastVisitTime;
      }

      if (sort_order === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    // Limit results
    const results = filteredItems.slice(0, max_results);

    // Format response with comprehensive metadata
    return {
      success: true,
      history_items: results.map(item => {
        let domain;
        try {
          domain = new URL(item.url).hostname;
        } catch (e) {
          domain = 'invalid-url';
        }

        return {
          id: item.id,
          url: item.url,
          title: item.title || 'Untitled',
          last_visit_time: new Date(item.lastVisitTime).toISOString(),
          visit_count: item.visitCount,
          domain: domain,
          typed_count: item.typedCount || 0
        };
      }),
      metadata: {
        total_found: filteredItems.length,
        returned_count: results.length,
        search_params: {
          keywords: keywords || null,
          date_range:
            start_date && end_date
              ? `${start_date} to ${end_date}`
              : start_date
                ? `from ${start_date}`
                : end_date
                  ? `until ${end_date}`
                  : null,
          domains: domains.length > 0 ? domains : null,
          min_visit_count,
          sort_by,
          sort_order
        },
        execution_time: new Date().toISOString(),
        over_fetched: historyItems.length,
        filters_applied: {
          domain_filter: domains.length > 0,
          visit_count_filter: min_visit_count > 1,
          date_filter: !!(start_date || end_date),
          keyword_filter: !!keywords
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `History search failed: ${error.message}`,
      history_items: [],
      metadata: {
        total_found: 0,
        returned_count: 0,
        search_params: params,
        execution_time: new Date().toISOString()
      }
    };
  }
}

// Selected Text Management Function
async function getSelectedText(params) {
  const { include_metadata = true, max_length = 10000, tab_id } = params;

  try {
    let targetTab;

    if (tab_id) {
      // Use specific tab
      try {
        targetTab = await browser.tabs.get(tab_id);
      } catch (error) {
        return {
          success: false,
          error: `Tab ${tab_id} not found or inaccessible`,
          selected_text: '',
          metadata: {
            execution_time: new Date().toISOString()
          }
        };
      }
    } else {
      // Get the active tab
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!activeTab) {
        return {
          success: false,
          error: 'No active tab found',
          selected_text: '',
          metadata: {
            execution_time: new Date().toISOString()
          }
        };
      }
      targetTab = activeTab;
    }

    // Execute script to get selected text - handle browser differences
    let results;
    if (browser.scripting) {
      // Chrome MV3
      results = await browser.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: getSelectionFunction
      });
    } else {
      // Firefox MV2
      results = await browser.tabs.executeScript(targetTab.id, {
        code: `(${getSelectionFunction.toString()})()`
      });
    }

    const result = results[0]?.result || results[0];

    if (!result) {
      return {
        success: false,
        error: 'Failed to execute selection script',
        selected_text: '',
        metadata: {
          execution_time: new Date().toISOString()
        }
      };
    }

    if (!result.hasSelection) {
      return {
        success: true,
        selected_text: '',
        has_selection: false,
        message: 'No text is currently selected on the page',
        metadata: {
          execution_time: new Date().toISOString(),
          tab_info: {
            id: targetTab.id,
            url: targetTab.url,
            title: targetTab.title
          }
        }
      };
    }

    // Truncate text if it exceeds max_length
    let selectedText = result.text;
    let truncated = false;
    if (selectedText.length > max_length) {
      selectedText = selectedText.substring(0, max_length);
      truncated = true;
    }

    const response = {
      success: true,
      selected_text: selectedText,
      has_selection: true,
      character_count: result.text.length,
      truncated: truncated,
      metadata: {
        execution_time: new Date().toISOString(),
        tab_info: {
          id: targetTab.id,
          url: targetTab.url,
          title: targetTab.title
        }
      }
    };

    // Include detailed metadata if requested
    if (include_metadata && result.metadata) {
      response.selection_metadata = result.metadata;
    }

    return response;
  } catch (error) {
    return {
      success: false,
      error: `Failed to get selected text: ${error.message}`,
      selected_text: '',
      has_selection: false,
      metadata: {
        execution_time: new Date().toISOString(),
        error_details: error.stack
      }
    };
  }
}

// Function to execute in page context
function getSelectionFunction() {
  const selection = window.getSelection();
  const selectedText = selection.toString();

  if (!selectedText) {
    return {
      text: '',
      hasSelection: false,
      metadata: null
    };
  }

  // Get metadata about the selection
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Get parent element info
  const commonAncestor = range.commonAncestorContainer;
  const parentElement =
    commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentElement : commonAncestor;

  const metadata = {
    length: selectedText.length,
    word_count: selectedText
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 0).length,
    line_count: selectedText.split('\n').length,
    position: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    },
    parent_element: {
      tag_name: parentElement.tagName?.toLowerCase(),
      class_name: parentElement.className,
      id: parentElement.id,
      text_content_length: parentElement.textContent?.length || 0
    },
    page_info: {
      url: window.location.href,
      title: document.title,
      domain: window.location.hostname
    },
    selection_info: {
      anchor_offset: selection.anchorOffset,
      focus_offset: selection.focusOffset,
      range_count: selection.rangeCount,
      is_collapsed: selection.isCollapsed
    }
  };

  return {
    text: selectedText,
    hasSelection: true,
    metadata: metadata
  };
}

// Execute custom JavaScript in tab context
async function executeScriptInTab(params) {
  const { script, tab_id, timeout = 5000, include_context = true } = params;

  try {
    let targetTab;

    if (tab_id) {
      // Use specific tab
      try {
        targetTab = await browser.tabs.get(tab_id);
      } catch (error) {
        throw new Error(`Tab ${tab_id} not found or inaccessible`);
      }
    } else {
      // Get the active tab
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!activeTab) {
        throw new Error('No active tab found');
      }
      targetTab = activeTab;
    }

    // Validate script is not empty
    if (!script || script.trim().length === 0) {
      throw new Error('Script cannot be empty');
    }

    // Execute the script with timeout protection
    const executePromise = (async () => {
      let results;

      if (browser.scripting) {
        // Chrome MV3 - inject function that evaluates script in page context
        // The page's CSP allows eval, not the extension's CSP
        results = await browser.scripting.executeScript({
          target: { tabId: targetTab.id },
          func: scriptCode => {
            // This runs in the page context, where eval is allowed
            // eslint-disable-next-line no-eval
            return eval(scriptCode);
          },
          args: [script],
          world: 'MAIN' // Execute in page's main world, not isolated world
        });
      } else {
        // Firefox MV2 - execute as code string
        results = await browser.tabs.executeScript(targetTab.id, {
          code: `(function() { return (${script}); })()`
        });
      }

      return results;
    })();

    // Add timeout protection
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Script execution timeout after ${timeout}ms`)), timeout)
    );

    const results = await Promise.race([executePromise, timeoutPromise]);

    // Debug logging
    console.log('🔍 Script execution results:', {
      resultsLength: results?.length,
      firstResult: results?.[0],
      hasResultProperty: results?.[0]?.hasOwnProperty('result'),
      resultValue: results?.[0]?.result
    });

    // Extract the result - Chrome MV3 returns array of InjectionResult objects
    // Firefox MV2 returns array with direct values
    let scriptResult;
    if (results && results.length > 0) {
      // Chrome MV3: results[0] is InjectionResult with 'result' property
      // Firefox MV2: results[0] is the actual value
      scriptResult = results[0]?.result !== undefined ? results[0].result : results[0];
    } else {
      scriptResult = null;
    }

    console.log('✅ Extracted script result:', scriptResult);

    // Build response
    const response = {
      success: true,
      result: scriptResult,
      execution_time: Date.now()
    };

    // Include browser context if requested
    if (include_context) {
      response.context = {
        tab_id: targetTab.id,
        url: targetTab.url,
        title: targetTab.title,
        tab_status: targetTab.status,
        active: targetTab.active
      };
    }

    return response;
  } catch (error) {
    // Return error with context
    throw new Error(`Script execution failed: ${error.message}`);
  }
}

/**
 * Fetch a file from URL and upload it to a file input element
 * Background scripts have no CORS restrictions, so we can fetch from any URL
 */
async function uploadFileToInput(params) {
  const {
    file_url,
    file_name,
    file_selector = 'input[type="file"]',
    mime_type,
    tab_id
  } = params;

  // Step 1: Fetch the file in background script (no CORS restrictions)
  console.log(`📁 Fetching file from: ${file_url}`);

  let response;
  try {
    response = await fetch(file_url);
    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    throw new Error(`Failed to fetch file: ${error.message}`);
  }

  // Get file bytes and content type
  const arrayBuffer = await response.arrayBuffer();
  const contentType = mime_type || response.headers.get('Content-Type') || 'application/octet-stream';
  const fileBytes = Array.from(new Uint8Array(arrayBuffer));

  console.log(`📁 Fetched ${fileBytes.length} bytes, type: ${contentType}`);

  // Step 2: Get target tab
  let targetTab;
  if (tab_id) {
    try {
      targetTab = await browser.tabs.get(tab_id);
    } catch (error) {
      throw new Error(`Tab ${tab_id} not found`);
    }
  } else {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!activeTab) throw new Error('No active tab found');
    targetTab = activeTab;
  }

  // Step 3: Inject the file into the page's file input
  const results = await browser.scripting.executeScript({
    target: { tabId: targetTab.id },
    func: (bytes, fileName, mimeType, selector) => {
      // Reconstruct the file from bytes
      const uint8Array = new Uint8Array(bytes);
      const blob = new Blob([uint8Array], { type: mimeType });
      const file = new File([blob], fileName, { type: mimeType });

      // Find the file input
      const input = document.querySelector(selector);
      if (!input) {
        return { success: false, error: `No element found for selector: ${selector}` };
      }

      // Use DataTransfer to set the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;

      // Dispatch change event (try both jQuery and native)
      if (window.jQuery) {
        window.jQuery(input).trigger('change');
      } else {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }

      return {
        success: true,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        inputSelector: selector
      };
    },
    args: [fileBytes, file_name, contentType, file_selector],
    world: 'MAIN'
  });

  const injectionResult = results[0]?.result;

  if (!injectionResult?.success) {
    throw new Error(injectionResult?.error || 'File injection failed');
  }

  return {
    success: true,
    message: `File "${file_name}" uploaded successfully`,
    details: {
      file_name: injectionResult.fileName,
      file_size: injectionResult.fileSize,
      mime_type: injectionResult.mimeType,
      selector_used: injectionResult.inputSelector,
      tab_id: targetTab.id,
      tab_url: targetTab.url
    }
  };
}

/**
 * Test CSP bypass approaches
 * Tests different methods for executing scripts on pages with strict CSP
 */
async function testCspBypassApproaches(params) {
  const { tab_id, test_script = 'document.title' } = params;

  let targetTab;
  if (tab_id) {
    try {
      targetTab = await browser.tabs.get(tab_id);
    } catch (error) {
      throw new Error(`Tab ${tab_id} not found or inaccessible`);
    }
  } else {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!activeTab) {
      throw new Error('No active tab found');
    }
    targetTab = activeTab;
  }

  const results = {
    tab_id: targetTab.id,
    url: targetTab.url,
    title: targetTab.title,
    test_script: test_script,
    timestamp: new Date().toISOString(),
    approaches: {}
  };

  // Approach 1: MAIN world + eval (current implementation)
  results.approaches.approach1_mainWorldEval = await testApproach1(targetTab.id, test_script);

  // Approach 2: ISOLATED world with predefined extractors
  results.approaches.approach2_isolatedWorld = await testApproach2(targetTab.id);

  // Approach 3: Script element injection
  results.approaches.approach3_scriptElement = await testApproach3(targetTab.id, test_script);

  // Approach 4: Blob URL injection
  results.approaches.approach4_blobUrl = await testApproach4(targetTab.id, test_script);

  // Approach 5: Function serialization (LinkedIn-specific)
  results.approaches.approach5_functionSerialization = await testApproach5(targetTab.id);

  // Approach 6: Dynamic selectors
  results.approaches.approach6_dynamicSelectors = await testApproach6(targetTab.id);

  // Approach 7: Function constructor
  results.approaches.approach7_functionConstructor = await testApproach7(targetTab.id, test_script);

  // Summary
  const approaches = Object.values(results.approaches);
  results.summary = {
    total: approaches.length,
    successful: approaches.filter(r => r.success).length,
    failed: approaches.filter(r => !r.success).length,
    csp_blocked: approaches.filter(r => r.csp_blocked).length,
    recommended: approaches
      .filter(r => r.success)
      .sort((a, b) => (b.flexibility || 0) - (a.flexibility || 0))
      .map(r => r.name)[0] || 'None'
  };

  return results;
}

// Test approach implementations
async function testApproach1(tabId, script) {
  const name = 'MAIN world + eval()';
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (scriptCode) => {
        // eslint-disable-next-line no-eval
        return eval(scriptCode);
      },
      args: [script],
      world: 'MAIN'
    });
    return {
      name,
      success: true,
      result: results[0]?.result,
      flexibility: 10,
      note: 'Full script execution, may be blocked by strict CSP'
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message,
      csp_blocked: error.message.includes('Content Security Policy') ||
                   error.message.includes('unsafe-eval'),
      flexibility: 10
    };
  }
}

async function testApproach2(tabId) {
  const name = 'ISOLATED world (no eval)';
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        return {
          title: document.title,
          url: window.location.href,
          headingCount: document.querySelectorAll('h1, h2, h3').length,
          linkCount: document.querySelectorAll('a').length,
          buttonCount: document.querySelectorAll('button').length
        };
      },
      world: 'ISOLATED'
    });
    return {
      name,
      success: true,
      result: results[0]?.result,
      flexibility: 3,
      note: 'Predefined extractors only, not blocked by CSP'
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message,
      flexibility: 3
    };
  }
}

async function testApproach3(tabId, script) {
  const name = 'Script element injection';
  const resultId = 'opendia-test-' + Date.now();

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (scriptCode, containerId) => {
        return new Promise((resolve) => {
          const container = document.createElement('div');
          container.id = containerId;
          container.style.display = 'none';
          document.body.appendChild(container);

          const scriptEl = document.createElement('script');
          scriptEl.textContent = `
            try {
              const __result = (${scriptCode});
              document.getElementById('${containerId}').setAttribute('data-result', JSON.stringify(__result));
              document.getElementById('${containerId}').setAttribute('data-success', 'true');
            } catch (e) {
              document.getElementById('${containerId}').setAttribute('data-error', e.message);
            }
          `;

          document.head.appendChild(scriptEl);

          setTimeout(() => {
            const success = container.getAttribute('data-success') === 'true';
            const result = container.getAttribute('data-result');
            const error = container.getAttribute('data-error');
            container.remove();
            scriptEl.remove();

            resolve({
              success,
              result: success ? JSON.parse(result) : null,
              error: error || null
            });
          }, 100);
        });
      },
      args: [script, resultId],
      world: 'MAIN'
    });

    const inner = results[0]?.result;
    return {
      name,
      success: inner?.success || false,
      result: inner?.result,
      error: inner?.error,
      csp_blocked: inner?.error?.includes('CSP') || false,
      flexibility: 8,
      note: 'Creates <script> element, may be blocked by script-src CSP'
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message,
      csp_blocked: error.message.includes('Content Security Policy'),
      flexibility: 8
    };
  }
}

async function testApproach4(tabId, script) {
  const name = 'Blob URL injection';
  const resultId = 'opendia-blob-' + Date.now();

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (scriptCode, containerId) => {
        return new Promise((resolve) => {
          const container = document.createElement('div');
          container.id = containerId;
          container.style.display = 'none';
          document.body.appendChild(container);

          const wrappedScript = `
            try {
              const __result = (${scriptCode});
              document.getElementById('${containerId}').setAttribute('data-result', JSON.stringify(__result));
              document.getElementById('${containerId}').setAttribute('data-success', 'true');
            } catch (e) {
              document.getElementById('${containerId}').setAttribute('data-error', e.message);
            }
          `;

          const blob = new Blob([wrappedScript], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);

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
              resolve({ success, result: success ? JSON.parse(result) : null, error });
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

    const inner = results[0]?.result;
    return {
      name,
      success: inner?.success || false,
      result: inner?.result,
      error: inner?.error,
      csp_blocked: inner?.error?.includes('CSP') || inner?.error?.includes('blob') || false,
      flexibility: 8,
      note: 'Creates blob URL script, may be blocked by blob: CSP directive'
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message,
      csp_blocked: error.message.includes('Content Security Policy'),
      flexibility: 8
    };
  }
}

async function testApproach5(tabId) {
  const name = 'Function serialization (LinkedIn)';
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selectors = {
          title: ['.job-details-jobs-unified-top-card__job-title', '.top-card-layout__title', 'h1'],
          company: ['.job-details-jobs-unified-top-card__company-name', '.topcard__org-name-link'],
          location: ['.job-details-jobs-unified-top-card__bullet', '.topcard__flavor--bullet'],
          description: ['.jobs-description-content__text', '.description__text', '#job-details']
        };

        const findFirst = (selectorList) => {
          for (const sel of selectorList) {
            const el = document.querySelector(sel);
            if (el?.textContent?.trim()) return el.textContent.trim();
          }
          return null;
        };

        return {
          title: findFirst(selectors.title),
          company: findFirst(selectors.company),
          location: findFirst(selectors.location),
          descriptionPreview: findFirst(selectors.description)?.substring(0, 200),
          pageTitle: document.title,
          url: window.location.href
        };
      },
      world: 'MAIN'
    });
    return {
      name,
      success: true,
      result: results[0]?.result,
      flexibility: 5,
      note: 'Pre-defined function, not blocked by CSP, LinkedIn-specific'
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message,
      flexibility: 5
    };
  }
}

async function testApproach6(tabId) {
  const name = 'Dynamic selectors';
  const selectors = {
    headings: 'h1, h2, h3',
    buttons: 'button',
    links: 'a[href]'
  };

  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: (selectorMap) => {
        const output = {};
        for (const [key, selector] of Object.entries(selectorMap)) {
          const elements = document.querySelectorAll(selector);
          output[key] = Array.from(elements).slice(0, 5).map(el => el.textContent?.trim()).filter(Boolean);
        }
        return output;
      },
      args: [selectors],
      world: 'MAIN'
    });
    return {
      name,
      success: true,
      result: results[0]?.result,
      flexibility: 6,
      note: 'Dynamic selectors as args, not blocked by CSP'
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message,
      flexibility: 6
    };
  }
}

async function testApproach7(tabId, script) {
  const name = 'Function constructor';
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
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

    const inner = results[0]?.result;
    return {
      name,
      success: inner?.success || false,
      result: inner?.result,
      error: inner?.error,
      csp_blocked: inner?.error?.includes('Content Security Policy') ||
                   inner?.error?.includes('unsafe-eval'),
      flexibility: 10,
      note: 'Uses new Function() instead of eval(), similar CSP restrictions'
    };
  } catch (error) {
    return {
      name,
      success: false,
      error: error.message,
      csp_blocked: error.message.includes('Content Security Policy'),
      flexibility: 10
    };
  }
}

// Initialize connection when extension loads (with delay for server startup)
setTimeout(() => {
  connectionManager.connect();
}, 1000);

// Handle messages from popup
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getStatus') {
    sendResponse(connectionManager.getStatus());
  } else if (request.action === 'getToolCount') {
    const tools = getAvailableTools();
    sendResponse({
      toolCount: tools.length,
      tools: tools.map(t => t.name)
    });
  } else if (request.action === 'reconnect') {
    connectionManager.connect();
    sendResponse({ success: true });
  } else if (request.action === 'getPorts') {
    sendResponse({
      current: lastKnownPorts,
      websocketUrl: MCP_SERVER_URL
    });
  } else if (request.action === 'setSafetyMode') {
    safetyModeEnabled = request.enabled;
    console.log(`🛡️ Safety Mode ${safetyModeEnabled ? 'ENABLED' : 'DISABLED'}`);
    sendResponse({ success: true });
  } else if (request.action === 'test') {
    connectionManager.send({ type: 'test', timestamp: Date.now() });
    sendResponse({ success: true });
  } else if (request.action === 'disconnect') {
    connectionManager.disconnect();
    sendResponse({ success: true });
  } else if (request.action === 'setKeepaliveTimeout') {
    connectionManager.keepaliveTimeout = request.timeout || 4 * 60 * 60 * 1000;
    sendResponse({
      success: true,
      timeout: connectionManager.keepaliveTimeout,
      timeoutMinutes: connectionManager.keepaliveTimeout / 1000 / 60
    });
  }
  return true; // Keep the message channel open
});

// Keepalive alarm listener for Chrome MV3
if (browserInfo.isServiceWorker && browser.alarms) {
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'keepalive') {
      // This wakes up the service worker and keeps it alive
      console.log('⏰ Keepalive alarm triggered, service worker active');

      // Ensure connection is still alive
      if (connectionManager.mcpSocket?.readyState === WebSocket.OPEN) {
        // Send a ping to verify connection
        connectionManager.mcpSocket.send(
          JSON.stringify({
            type: 'ping',
            timestamp: Date.now()
          })
        );
      } else if (connectionManager.mcpSocket?.readyState === WebSocket.CLOSED) {
        console.log('🔄 Connection lost, reconnecting...');
        connectionManager.connect();
      }
    }
  });

  console.log('⏰ Chrome MV3 keepalive alarm listener registered');
} else if (browserInfo.isServiceWorker) {
  console.warn('⚠️ alarms API not available, keepalive may not work properly');
}

// Initialize connection on extension load
console.log('🚀 OpenDia extension starting...');
connectionManager.connect();

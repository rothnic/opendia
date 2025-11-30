// Enhanced Browser Automation Content Script with Anti-Detection
// Import WebExtension polyfill for cross-browser compatibility
if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
  globalThis.browser = chrome;
}

// Prevent multiple injections - especially important for Firefox
if (typeof window.OpenDiaContentScriptLoaded !== 'undefined') {
  console.log("OpenDia content script already loaded, skipping re-injection");
} else {
  window.OpenDiaContentScriptLoaded = true;

console.log("OpenDia enhanced content script loaded");

// Enhanced Pattern Database with Twitter-First Priority
const ENHANCED_PATTERNS = {
  // Authentication patterns
  auth: {
    login: {
      input: [
        "[type='email']",
        "[name*='username' i]",
        "[placeholder*='email' i]",
        "[name*='login' i]",
      ],
      password: ["[type='password']", "[name*='password' i]"],
      submit: [
        "[type='submit']",
        "button[form]",
        ".login-btn",
        "[aria-label*='login' i]",
      ],
      confidence: 0.9,
    },
    signup: {
      input: [
        "[name*='register' i]",
        "[placeholder*='signup' i]",
        "[name*='email' i]",
      ],
      submit: ["[href*='signup']", ".signup-btn", "[aria-label*='register' i]"],
      confidence: 0.85,
    },
  },

  // Content creation patterns - Twitter FIRST
  content: {
    post_create: {
      textarea: [
        "[data-testid='tweetTextarea_0']", // Twitter FIRST (most specific)
        "[aria-label='Post text']", // Twitter specific
        "[contenteditable='true']", // Generic last
        "textarea[placeholder*='post' i]",
        "[data-text='true']",
      ],
      submit: [
        "[data-testid='tweetButtonInline']", // Twitter inline
        "[data-testid='tweetButton']", // Twitter main
        ".post-btn",
        ".publish-btn",
        "[aria-label*='post' i]",
      ],
      confidence: 0.95,
    },
    comment: {
      textarea: [
        "textarea[placeholder*='comment' i]",
        "[role='textbox']",
        "[placeholder*='reply' i]",
      ],
      submit: [
        ".comment-btn",
        "[aria-label*='comment' i]",
        "[aria-label*='reply' i]",
      ],
      confidence: 0.8,
    },
  },

  // Search patterns
  search: {
    global: {
      input: [
        "[data-testid='SearchBox_Search_Input']", // Twitter search first
        "[type='search']",
        "[role='searchbox']",
        "[placeholder*='search' i]",
        "[name*='search' i]",
      ],
      submit: [
        "[aria-label*='search' i]",
        ".search-btn",
        "button[type='submit']",
      ],
      confidence: 0.85,
    },
  },

  // Navigation patterns
  nav: {
    menu: {
      toggle: [
        "[aria-label*='menu' i]",
        ".menu-btn",
        ".hamburger",
        "[data-toggle='menu']",
      ],
      items: ["nav a", ".nav-item", "[role='menuitem']"],
      confidence: 0.8,
    },
  },

  // Form patterns
  form: {
    submit: {
      button: [
        "[type='submit']",
        "button[form]",
        ".submit-btn",
        "[aria-label*='submit' i]",
      ],
      confidence: 0.85,
    },
    reset: {
      button: ["[type='reset']", ".reset-btn", "[aria-label*='reset' i]"],
      confidence: 0.8,
    },
  },
};

// Anti-Detection Platform Configuration
const ANTI_DETECTION_PLATFORMS = {
  "twitter.com": {
    selectors: {
      textarea: "[data-testid='tweetTextarea_0']",
      submit: "[data-testid='tweetButtonInline'], [data-testid='tweetButton']",
    },
    bypassMethod: "twitter_direct",
  },
  "x.com": {
    selectors: {
      textarea: "[data-testid='tweetTextarea_0']",
      submit: "[data-testid='tweetButtonInline'], [data-testid='tweetButton']",
    },
    bypassMethod: "twitter_direct",
  },
  // Add other platforms that need special handling
  "linkedin.com": {
    selectors: {
      textarea: "[contenteditable='true'][role='textbox']",
      submit: "[data-control-name='share.post']",
    },
    bypassMethod: "linkedin_direct",
  },
  "facebook.com": {
    selectors: {
      textarea: "[contenteditable='true'][data-text='true']",
      submit: "[data-testid='react-composer-post-button']",
    },
    bypassMethod: "facebook_direct",
  },
};

// Legacy pattern database for backward compatibility
const PATTERN_DATABASE = {
  twitter: {
    domains: ["twitter.com", "x.com"],
    patterns: {
      post_tweet: {
        textarea:
          "[data-testid='tweetTextarea_0'], [contenteditable='true'][data-text='true']",
        submit:
          "[data-testid='tweetButtonInline'], [data-testid='tweetButton']",
        confidence: 0.95,
      },
      search: {
        input:
          "[data-testid='SearchBox_Search_Input'], input[placeholder*='search' i]",
        submit: "[data-testid='SearchBox_Search_Button']",
        confidence: 0.9,
      },
    },
  },
  github: {
    domains: ["github.com"],
    patterns: {
      search: {
        input: "input[placeholder*='Search' i].form-control",
        submit: "button[type='submit']",
        confidence: 0.85,
      },
    },
  },
  universal: {
    search: {
      selectors: [
        "input[type='search']",
        "input[placeholder*='search' i]",
        "[role='searchbox']",
        "input[name*='search' i]",
      ],
      confidence: 0.6,
    },
    submit: {
      selectors: [
        "button[type='submit']:not([disabled])",
        "input[type='submit']:not([disabled])",
        "[role='button'][aria-label*='submit' i]",
      ],
      confidence: 0.65,
    },
  },
};


class BrowserAutomation {
  constructor() {
    this.elementRegistry = new Map();
    this.quickRegistry = new Map(); // For phase 1 quick matches
    this.idCounter = 0;
    this.quickIdCounter = 0;
    this.setupMessageListener();
    this.setupViewportAnalyzer();
  }

  setupViewportAnalyzer() {
    this.visibilityMap = new Map();
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          this.visibilityMap.set(entry.target, {
            visible: entry.isIntersecting,
            ratio: entry.intersectionRatio,
          });
        });
      },
      { threshold: [0, 0.1, 0.5, 1.0] }
    );
  }

  setupMessageListener() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message)
        .then(sendResponse)
        .catch((error) => {
          sendResponse({
            success: false,
            error: error.message,
            stack: error.stack,
          });
        });
      return true; // Keep message channel open for async response
    });
  }

  async handleMessage(message) {
    const { action, data } = message;
    const startTime = performance.now();

    try {
      let result;
      switch (action) {
        case "analyze":
          result = await this.analyzePage(data);
          break;
        case "extract_content":
          result = await this.extractContent(data);
          break;
        case "element_click":
          result = await this.clickElement(data);
          break;
        case "element_fill":
          // 🎯 CRITICAL: Anti-Detection Bypass Implementation
          result = await this.fillElementWithAntiDetection(data);
          break;
        case "wait_for":
          result = await this.waitForCondition(data);
          break;
        case "get_element_state":
          const element = this.getElementById(data.element_id);
          if (!element) {
            throw new Error(`Element not found: ${data.element_id}`);
          }
          result = {
            element_id: data.element_id,
            element_name: this.getElementName(element),
            state: this.getElementState(element),
            current_value: this.getElementValue(element),
          };
          break;
        case "get_page_links":
          result = await this.getPageLinks(data);
          break;
        case "page_scroll":
          result = await this.scrollPage(data);
          break;
        case "page_style":
          result = await this.handlePageStyle(data);
          break;
        case "select_element":
          result = await this.selectElement(data);
          break;
        case "page_structure":
          result = await this.getPageStructure(data);
          break;
        case "page_structure_extract":
          result = await this.extractFromElement(data);
          break;
        case "ping":
          // Health check for background tab content script readiness
          result = { status: "ready", timestamp: Date.now(), url: window.location.href };
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      const executionTime = performance.now() - startTime;
      const dataSize = new Blob([JSON.stringify(result)]).size;

      return {
        success: true,
        data: result,
        execution_time: Math.round(executionTime),
        data_size: dataSize,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        execution_time: Math.round(performance.now() - startTime),
      };
    }
  }

  // 🎯 ANTI-DETECTION BYPASS METHOD
  async fillElementWithAntiDetection({
    element_id,
    value,
    clear_first = true,
    force_focus = true,
  }) {
    const element = this.getElementById(element_id);
    if (!element) {
      throw new Error(`Element not found: ${element_id}`);
    }

    const hostname = window.location.hostname;
    const platformConfig = this.detectAntiDetectionPlatform(hostname);

    if (platformConfig && this.shouldUseBypass(element, platformConfig)) {
      console.log(
        `🎯 Using ${platformConfig.bypassMethod} bypass for ${hostname}`
      );
      return await this.executeDirectBypass(
        element,
        value,
        platformConfig,
        element_id
      );
    } else {
      // Use normal fillElement for non-detection platforms
      console.log("🔧 Using standard fill method");
      return await this.fillElementStandard({
        element_id,
        value,
        clear_first,
        force_focus,
      });
    }
  }

  detectAntiDetectionPlatform(hostname) {
    // Check exact matches first
    if (ANTI_DETECTION_PLATFORMS[hostname]) {
      return ANTI_DETECTION_PLATFORMS[hostname];
    }

    // Check subdomain matches
    for (const [domain, config] of Object.entries(ANTI_DETECTION_PLATFORMS)) {
      if (hostname.includes(domain) || hostname.endsWith(`.${domain}`)) {
        return config;
      }
    }

    return null;
  }

  shouldUseBypass(element, platformConfig) {
    // Check if element matches platform-specific selectors
    try {
      const isTextarea =
        document.querySelector(platformConfig.selectors.textarea) === element;
      if (isTextarea) return true;

      // Also check if element matches any textarea selector pattern
      const textareaSelectors = platformConfig.selectors.textarea.split(", ");
      return textareaSelectors.some((selector) => {
        try {
          return element.matches(selector);
        } catch {
          return false;
        }
      });
    } catch (error) {
      console.warn("Bypass detection failed:", error);
      return false;
    }
  }

  async executeDirectBypass(element, value, platformConfig, element_id) {
    try {
      console.log(`🐦 Executing ${platformConfig.bypassMethod} bypass`);

      switch (platformConfig.bypassMethod) {
        case "twitter_direct":
          return await this.twitterDirectBypass(element, value, element_id);
        case "linkedin_direct":
          return await this.linkedinDirectBypass(element, value, element_id);
        case "facebook_direct":
          return await this.facebookDirectBypass(element, value, element_id);
        default:
          // Generic direct bypass
          return await this.genericDirectBypass(element, value, element_id);
      }
    } catch (error) {
      console.error(
        "Direct bypass failed, falling back to standard method:",
        error
      );
      return await this.fillElementStandard({
        element_id,
        value,
        clear_first: true,
        force_focus: true,
      });
    }
  }

  async twitterDirectBypass(element, value, element_id) {
    // THE WORKING FORMULA FOR TWITTER:
    // 1. Focus 2. Click 3. execCommand
    console.log("🐦 Twitter direct bypass - focus+click+execCommand");

    // Ensure element is in view
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 200));

    // The magic sequence that bypasses Twitter detection
    element.focus();
    element.click();
    const execResult = document.execCommand("insertText", false, value);

    // Wait for React state to update
    await new Promise((r) => setTimeout(r, 500));

    // Verify success
    const currentText = element.textContent || element.value || "";
    const success = currentText.includes(value);

    return {
      success: success,
      element_id: element_id,
      value: value,
      actual_value: currentText,
      method: "twitter_direct_bypass",
      execCommand_result: execResult,
      element_name: this.getElementName(element),
    };
  }

  async linkedinDirectBypass(element, value, element_id) {
    console.log("💼 LinkedIn direct bypass");

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 200));

    // LinkedIn-specific sequence
    element.focus();
    element.click();

    // Clear existing content first for LinkedIn
    if (element.textContent) {
      document.execCommand("selectAll");
      document.execCommand("delete");
    }

    const execResult = document.execCommand("insertText", false, value);

    // LinkedIn needs more time for state updates
    await new Promise((r) => setTimeout(r, 800));

    const currentText = element.textContent || element.value || "";
    const success = currentText.includes(value);

    return {
      success: success,
      element_id: element_id,
      value: value,
      actual_value: currentText,
      method: "linkedin_direct_bypass",
      execCommand_result: execResult,
      element_name: this.getElementName(element),
    };
  }

  async facebookDirectBypass(element, value, element_id) {
    console.log("📘 Facebook direct bypass");

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 200));

    // Facebook-specific sequence
    element.focus();
    element.click();

    // Facebook may need selection clearing
    if (element.textContent) {
      document.execCommand("selectAll");
      document.execCommand("delete");
    }

    const execResult = document.execCommand("insertText", false, value);

    // Trigger Facebook-specific events
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 600));

    const currentText = element.textContent || element.value || "";
    const success = currentText.includes(value);

    return {
      success: success,
      element_id: element_id,
      value: value,
      actual_value: currentText,
      method: "facebook_direct_bypass",
      execCommand_result: execResult,
      element_name: this.getElementName(element),
    };
  }

  async genericDirectBypass(element, value, element_id) {
    console.log("🔧 Generic direct bypass");

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((r) => setTimeout(r, 200));

    // Generic direct sequence
    element.focus();
    element.click();
    const execResult = document.execCommand("insertText", false, value);

    await new Promise((r) => setTimeout(r, 500));

    const currentText = element.textContent || element.value || "";
    const success = currentText.includes(value);

    return {
      success: success,
      element_id: element_id,
      value: value,
      actual_value: currentText,
      method: "generic_direct_bypass",
      execCommand_result: execResult,
      element_name: this.getElementName(element),
    };
  }

  // Standard fill method (unchanged for compatibility)
  async fillElementStandard({
    element_id,
    value,
    clear_first = true,
    force_focus = true,
  }) {
    const element = this.getElementById(element_id);
    if (!element) {
      throw new Error(`Element not found: ${element_id}`);
    }

    // Enhanced focus sequence for modern web apps
    if (force_focus) {
      await this.ensureProperFocus(element);
    } else {
      element.focus();
    }

    // Clear existing content if requested
    if (clear_first) {
      await this.clearElementContent(element);
    }

    // Fill the value with proper event sequence
    await this.fillWithEvents(element, value);

    // Validate the fill was successful
    const actualValue = this.getElementValue(element);
    const success = actualValue.includes(value);

    return {
      success,
      element_id,
      value,
      actual_value: actualValue,
      element_name: this.getElementName(element),
      method: "standard_fill",
      focus_applied: force_focus,
    };
  }

  async analyzePage({
    intent_hint,
    phase = "discover",
    focus_areas,
    element_ids,
    max_results = 5,
  }) {
    const startTime = performance.now();

    // Two-phase approach
    if (phase === "discover") {
      return await this.quickDiscovery({ intent_hint, max_results });
    } else if (phase === "detailed") {
      return await this.detailedAnalysis({
        intent_hint,
        focus_areas,
        element_ids,
        max_results,
      });
    }

    // Legacy single-phase approach for backward compatibility
    return await this.legacyAnalysis({
      intent_hint,
      focus_area: focus_areas?.[0],
      max_results,
    });
  }

  async quickDiscovery({ intent_hint, max_results = 5 }) {
    const startTime = performance.now();

    // Detect page type and get basic metrics
    const pageType = this.detectPageType();
    const viewportElements = this.countViewportElements();

    // Use default max results limit
    max_results = Math.min(max_results, 5);

    // Try to find obvious matches using enhanced patterns
    let quickMatches = [];
    let usedMethod = "quick_discovery";

    try {
      // Check for anti-detection bypass first
      const hostname = window.location.hostname;
      const platformConfig = this.detectAntiDetectionPlatform(hostname);

      if (
        platformConfig &&
        (intent_hint.includes("post") || intent_hint.includes("tweet"))
      ) {
        const bypassResult = await this.tryAntiDetectionPatterns(
          intent_hint,
          platformConfig
        );
        if (bypassResult.confidence > 0.9) {
          quickMatches = bypassResult.elements
            .slice(0, 3)
            .map((el) => this.compressElement(el, true));
          usedMethod = "anti_detection_bypass";
        }
      }

      // Fallback to enhanced patterns
      if (
        quickMatches.length === 0 &&
        (bestMethod === "enhanced_pattern_match" ||
          bestMethod === "pattern_database")
      ) {
        const patternResult = await this.tryEnhancedPatterns(intent_hint);
        if (patternResult.confidence > 0.7) {
          quickMatches = patternResult.elements
            .slice(0, 3)
            .map((el) => this.compressElement(el, true));
          usedMethod = "enhanced_patterns";
        }
      }
    } catch (error) {
      console.warn("Enhanced patterns failed:", error);
    }

    // If no pattern matches, do a quick viewport scan
    if (quickMatches.length === 0) {
      quickMatches = await this.quickViewportScan(intent_hint, 3);
      usedMethod = "viewport_scan";
    }

    const intentMatch = this.scoreIntentMatch(intent_hint, quickMatches);
    const suggestedAreas = this.suggestPhase2Areas(quickMatches, intent_hint);
    const executionTime = Math.round(performance.now() - startTime);

    const result = {
      summary: {
        page_type: pageType,
        intent_match: intentMatch,
        element_count: viewportElements,
        viewport_elements: quickMatches.length,
        suggested_phase2: suggestedAreas,
        anti_detection_platform: this.detectAntiDetectionPlatform(
          window.location.hostname
        )
          ? window.location.hostname
          : null,
      },
      quick_matches: quickMatches,
      token_estimate: this.estimatePhase2Tokens(quickMatches),
      method: usedMethod,
      execution_time: executionTime,
      intent_hint: intent_hint, // Add this for server.js compatibility
      elements: quickMatches, // Add this for backward compatibility
    };


    return result;
  }

  async tryAntiDetectionPatterns(intent_hint, platformConfig) {
    const elements = [];

    // Try to find platform-specific elements
    try {
      const textareaElement = document.querySelector(
        platformConfig.selectors.textarea
      );
      if (textareaElement && this.isLikelyVisible(textareaElement)) {
        const elementId = this.registerElement(textareaElement);
        elements.push({
          id: elementId,
          type: "textarea",
          selector: platformConfig.selectors.textarea,
          name: this.getElementName(textareaElement),
          confidence: 0.95, // High confidence for anti-detection platforms
          element: textareaElement,
        });
      }

      const submitElement = document.querySelector(
        platformConfig.selectors.submit
      );
      if (submitElement && this.isLikelyVisible(submitElement)) {
        const elementId = this.registerElement(submitElement);
        elements.push({
          id: elementId,
          type: "button",
          selector: platformConfig.selectors.submit,
          name: this.getElementName(submitElement),
          confidence: 0.95,
          element: submitElement,
        });
      }
    } catch (error) {
      console.warn("Anti-detection pattern matching failed:", error);
    }

    return {
      elements,
      confidence: elements.length > 0 ? 0.95 : 0,
      method: "anti_detection_patterns",
      platform: window.location.hostname,
    };
  }

  async detailedAnalysis({
    intent_hint,
    focus_areas,
    element_ids,
    max_results = 10,
  }) {
    const startTime = performance.now();
    const pageType = this.detectPageType();

    // Use default max results limit
    max_results = Math.min(max_results, 7); // Allow slightly more for detailed analysis

    let elements = [];
    let method = "detailed_analysis";

    // Expand specific quick matches if provided
    if (element_ids?.length) {
      elements = await this.expandQuickMatches(element_ids);
      method = "expanded_matches";
    }

    // Analyze specific focus areas
    if (focus_areas?.length) {
      const areaElements = await this.analyzeFocusAreas(
        focus_areas,
        intent_hint
      );
      elements = [...elements, ...areaElements];
      method = elements.length > 0 ? "focus_area_analysis" : method;
    }

    // If no specific analysis requested, do full enhanced analysis
    if (elements.length === 0) {
      elements = await this.fullEnhancedAnalysis(intent_hint, max_results);
      method = "full_enhanced_analysis";
    }

    // Deduplicate and enhance with metadata
    elements = this.deduplicateElements(elements);
    elements = await this.enhanceElementMetadata(elements);

    // Apply compact fingerprinting
    elements = elements
      .slice(0, max_results)
      .map((el) => this.compressElement(el, false));

    const executionTime = Math.round(performance.now() - startTime);
    const result = {
      elements,
      interaction_ready: elements.every((el) => el.conf > 50),
      method,
      execution_time: executionTime,
      intent_hint: intent_hint, // Add this for server.js compatibility
    };


    return result;
  }

  async legacyAnalysis({ intent_hint, focus_area, max_results = 5 }) {
    const startTime = performance.now();
    let result;

    try {
      // Try enhanced patterns first
      result = await this.tryEnhancedPatterns(intent_hint);
      if (result.confidence > 0.8) {
        return this.formatAnalysisResult(
          result,
          "enhanced_patterns",
          startTime
        );
      }
    } catch (error) {
      console.warn("Enhanced patterns failed, trying legacy patterns:", error);
      try {
        // Fallback to legacy pattern database
        result = await this.tryPatternDatabase(intent_hint);
        if (result.confidence > 0.8) {
          return this.formatAnalysisResult(
            result,
            "pattern_database",
            startTime
          );
        }
      } catch (legacyError) {
        console.warn("Legacy pattern database failed:", legacyError);
      }
    }

    // Final fallback to semantic analysis
    result = await this.trySemanticAnalysis(intent_hint, focus_area);
    return this.formatAnalysisResult(result, "semantic_analysis", startTime);
  }

  async tryEnhancedPatterns(intent_hint) {
    const [category, action] = this.parseIntent(intent_hint);
    const pattern = ENHANCED_PATTERNS[category]?.[action];

    if (!pattern) {
      return this.tryUniversalPatterns(intent_hint);
    }

    const elements = this.findPatternElements(pattern);
    return {
      elements: elements.slice(0, 3),
      confidence: pattern.confidence,
      method: "enhanced_pattern_match",
      category,
      action,
    };
  }

  parseIntent(intent) {
    const intentLower = intent.toLowerCase();

    // Check for authentication patterns
    if (
      intentLower.includes("login") ||
      intentLower.includes("sign in") ||
      intentLower.includes("log in")
    ) {
      return ["auth", "login"];
    }
    if (
      intentLower.includes("signup") ||
      intentLower.includes("sign up") ||
      intentLower.includes("register") ||
      intentLower.includes("create account")
    ) {
      return ["auth", "signup"];
    }

    // Check for content creation patterns
    if (
      intentLower.includes("tweet") ||
      intentLower.includes("post") ||
      intentLower.includes("compose") ||
      intentLower.includes("create") ||
      intentLower.includes("write") ||
      intentLower.includes("publish")
    ) {
      return ["content", "post_create"];
    }
    if (intentLower.includes("comment") || intentLower.includes("reply")) {
      return ["content", "comment"];
    }

    // Check for search patterns
    if (
      intentLower.includes("search") ||
      intentLower.includes("find") ||
      intentLower.includes("look for")
    ) {
      return ["search", "global"];
    }

    // Check for navigation patterns
    if (
      intentLower.includes("menu") ||
      intentLower.includes("navigation") ||
      intentLower.includes("nav")
    ) {
      return ["nav", "menu"];
    }

    // Check for form patterns
    if (
      intentLower.includes("submit") ||
      intentLower.includes("send") ||
      intentLower.includes("save")
    ) {
      return ["form", "submit"];
    }
    if (
      intentLower.includes("reset") ||
      intentLower.includes("clear") ||
      intentLower.includes("cancel")
    ) {
      return ["form", "reset"];
    }

    // Fallback - try to infer from context
    if (intentLower.includes("button") || intentLower.includes("click")) {
      return ["form", "submit"];
    }
    if (
      intentLower.includes("input") ||
      intentLower.includes("field") ||
      intentLower.includes("text")
    ) {
      return ["content", "post_create"];
    }

    // Default fallback
    return ["content", "post_create"]; // More useful default than search
  }

  findPatternElements(pattern) {
    const elements = [];

    for (const [elementType, selectors] of Object.entries(pattern)) {
      if (elementType === "confidence") continue;

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && this.isLikelyVisible(element)) {
          const elementId = this.registerElement(element);
          elements.push({
            id: elementId,
            type: elementType,
            selector: selector,
            name: this.getElementName(element),
            confidence: pattern.confidence || 0.8,
            element: element,
          });
          break; // Take first match per element type
        }
      }
    }

    return elements;
  }

  tryUniversalPatterns(intent_hint) {
    const intentLower = intent_hint.toLowerCase();
    let selectors = [];

    // Content creation patterns
    if (
      intentLower.includes("tweet") ||
      intentLower.includes("post") ||
      intentLower.includes("compose") ||
      intentLower.includes("create") ||
      intentLower.includes("write")
    ) {
      selectors = [
        "[data-testid='tweetTextarea_0']", // Twitter first!
        "[contenteditable='true']",
        "textarea[placeholder*='tweet' i]",
        "textarea[placeholder*='post' i]",
        "textarea[placeholder*='what' i]",
        "[data-text='true']",
        "[role='textbox']",
        "textarea:not([style*='display: none'])",
      ];
    }
    // Authentication patterns
    else if (intentLower.includes("login") || intentLower.includes("sign in")) {
      selectors = [
        "[type='email']",
        "[name*='username' i]",
        "[placeholder*='email' i]",
        "[placeholder*='username' i]",
        "input[name*='login' i]",
      ];
    } else if (
      intentLower.includes("signup") ||
      intentLower.includes("register")
    ) {
      selectors = [
        "[href*='signup']",
        ".signup-btn",
        "[aria-label*='register' i]",
        "button[data-testid*='signup' i]",
        "a[href*='register']",
      ];
    }
    // Search patterns
    else if (intentLower.includes("search") || intentLower.includes("find")) {
      selectors = [
        "[data-testid='SearchBox_Search_Input']", // Twitter search first
        "[type='search']",
        "[role='searchbox']",
        "[placeholder*='search' i]",
        "[data-testid*='search' i]",
        "input[name*='search' i]",
      ];
    }
    // Generic fallback - look for interactive elements
    else {
      selectors = [
        "button:not([disabled])",
        "[contenteditable='true']",
        "textarea",
        "[type='submit']",
        "[role='button']",
        "input[type='text']",
      ];
    }

    const elements = [];

    for (const selector of selectors) {
      const foundElements = document.querySelectorAll(selector);
      for (const element of foundElements) {
        if (this.isLikelyVisible(element)) {
          const elementId = this.registerElement(element);
          elements.push({
            id: elementId,
            type: this.inferElementType(element, intent_hint),
            selector: selector,
            name: this.getElementName(element),
            confidence:
              0.5 + this.calculateConfidence(element, intent_hint) * 0.3,
            element: element,
          });
          if (elements.length >= 3) break; // Limit to 3 elements
        }
      }
      if (elements.length >= 3) break;
    }

    return {
      elements,
      confidence:
        elements.length > 0
          ? Math.max(...elements.map((e) => e.confidence))
          : 0,
      method: "universal_pattern",
    };
  }

  async tryPatternDatabase(intentHint) {
    const hostname = window.location.hostname;
    const siteKey = this.detectSite(hostname);

    if (siteKey === "universal") {
      return this.getUniversalPattern(intentHint);
    }

    const siteConfig = PATTERN_DATABASE[siteKey];
    const pattern = siteConfig?.patterns?.[intentHint];

    if (!pattern) {
      throw new Error(`No pattern found for ${intentHint} on ${siteKey}`);
    }

    const elements = [];
    for (const [elementType, selector] of Object.entries(pattern)) {
      if (elementType === "confidence") continue;

      const element = document.querySelector(selector);
      if (element) {
        const elementId = this.registerElement(element);
        elements.push({
          id: elementId,
          type: elementType,
          selector: selector,
          name: this.getElementName(element),
          confidence: pattern.confidence || 0.8,
        });
      }
    }

    return {
      elements,
      confidence: pattern.confidence || 0.8,
      site: siteKey,
    };
  }

  detectSite(hostname) {
    for (const [siteKey, config] of Object.entries(PATTERN_DATABASE)) {
      if (siteKey === "universal") continue;
      if (
        config.domains?.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
        )
      ) {
        return siteKey;
      }
    }
    return "universal";
  }

  getUniversalPattern(intentHint) {
    const universalPatterns = PATTERN_DATABASE.universal;
    const pattern = universalPatterns[intentHint];

    if (!pattern) {
      throw new Error(`No universal pattern for ${intentHint}`);
    }

    const elements = [];
    for (const selector of pattern.selectors) {
      const element = document.querySelector(selector);
      if (element) {
        const elementId = this.registerElement(element);
        elements.push({
          id: elementId,
          type: intentHint,
          selector: selector,
          name: this.getElementName(element),
          confidence: pattern.confidence,
        });
        break; // Take first match for universal patterns
      }
    }

    return {
      elements,
      confidence: pattern.confidence,
      site: "universal",
    };
  }

  async trySemanticAnalysis(intentHint, focusArea) {
    const relevantElements = document.querySelectorAll(`
      button, input, select, textarea, a[href],
      [role="button"], [role="textbox"], [role="searchbox"],
      [aria-label], [data-testid]
    `);

    const elements = Array.from(relevantElements)
      .filter((el) => this.isVisible(el))
      .slice(0, 20)
      .map((element) => {
        const elementId = this.registerElement(element);
        return {
          id: elementId,
          type: this.inferElementType(element, intentHint),
          selector: this.generateSelector(element),
          name: this.getElementName(element),
          confidence: this.calculateConfidence(element, intentHint),
        };
      })
      .filter((el) => el.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence);

    return {
      elements,
      confidence:
        elements.length > 0
          ? Math.max(...elements.map((e) => e.confidence))
          : 0,
    };
  }

  async extractContent({ content_type, max_items = 20, summarize = true }) {
    console.log(`🔍 extractContent called with: content_type=${content_type}, max_items=${max_items}, summarize=${summarize}`);
    const startTime = performance.now();
    const extractors = {
      article: () => this.extractArticleContent(summarize),
      search_results: () => this.extractSearchResults(max_items, summarize),
      posts: () => this.extractPosts(max_items, summarize),
    };

    const extractor = extractors[content_type];
    if (!extractor) {
      throw new Error(`Unknown content type: ${content_type}`);
    }

    const rawContent = extractor();

    if (summarize) {
      // Return summary instead of full content to save tokens
      return {
        content_type,
        summary: this.summarizeContent(rawContent, content_type),
        items_found: Array.isArray(rawContent) ? rawContent.length : 1,
        sample_items: Array.isArray(rawContent)
          ? rawContent.slice(0, 3)
          : [rawContent],
        extraction_method: this.getExtractionMethod(content_type),
        token_estimate: this.estimateContentTokens(rawContent),
        execution_time: Math.round(performance.now() - startTime),
        extracted_at: new Date().toISOString(),
      };
    } else {
      // Legacy full content extraction
      console.log(`🎯 Returning FULL content: ${rawContent?.content?.length || 0} characters`);
      return {
        content: rawContent,
        method: "semantic_extraction",
        content_type: content_type,
        execution_time: Math.round(performance.now() - startTime),
        extracted_at: new Date().toISOString(),
      };
    }
  }

  extractArticleContent(summarize = true) {
    console.log(`📄 extractArticleContent called with summarize=${summarize}`);
    const article = document.querySelector(
      'article, [role="article"], .article-content, main'
    );
    const title = document
      .querySelector("h1, .article-title, .post-title")
      ?.textContent?.trim();
    const content = article?.textContent?.trim() || this.extractMainContent();

    console.log(`📏 Extracted content length: ${content?.length || 0} characters`);
    console.log(`📝 Content preview: ${content?.substring(0, 200)}...`);

    return {
      title,
      content,
      word_count: content?.split(/\s+/).length || 0,
    };
  }

  extractMainContent() {
    // Simple heuristic to find main content
    const candidates = document.querySelectorAll(
      "main, .content, .post-content, .article-body"
    );
    let bestCandidate = null;
    let maxTextLength = 0;

    for (const candidate of candidates) {
      const textLength = candidate.textContent.trim().length;
      if (textLength > maxTextLength) {
        maxTextLength = textLength;
        bestCandidate = candidate;
      }
    }

    return (
      bestCandidate?.textContent?.trim() || document.body.textContent.trim()
    );
  }

  extractSearchResults(max_items = 20, summarize = true) {
    // Common search result patterns
    const selectors = [
      '.search-result, .result-item, [data-testid*="result"]',
      ".g, .result, .search-item", // Google-style
      'li[data-testid="search-result"], .SearchResult', // Twitter/X
      ".Box-row, .issue-list-item", // GitHub
      "article, .post, .entry", // Generic content
    ];

    let results = [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        results = Array.from(elements)
          .slice(0, max_items)
          .map((el, index) => ({
            index: index + 1,
            title: this.extractResultTitle(el, summarize),
            summary: this.extractResultSummary(el, summarize),
            link: this.extractResultLink(el),
            type: this.detectResultType(el),
            score: this.scoreSearchResult(el),
          }));
        break;
      }
    }

    return results;
  }

  extractPosts(max_items = 20, summarize = true) {
    // Social media post patterns
    const selectors = [
      '[data-testid="tweet"], .tweet, .post',
      'article[role="article"]', // Twitter/X posts
      ".timeline-item, .feed-item",
      ".status, .update, .entry",
    ];

    let posts = [];
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        posts = Array.from(elements)
          .slice(0, max_items)
          .map((el, index) => ({
            index: index + 1,
            text: this.extractPostText(el, summarize),
            author: this.extractPostAuthor(el),
            timestamp: this.extractPostTimestamp(el),
            metrics: this.extractPostMetrics(el),
            has_media: this.hasPostMedia(el),
            post_type: this.detectPostType(el),
          }));
        break;
      }
    }

    return posts;
  }

  // Content summarization methods
  summarizeContent(content, content_type) {
    switch (content_type) {
      case "article":
        return this.summarizeArticle(content);
      case "search_results":
        return this.summarizeSearchResults(content);
      case "posts":
        return this.summarizePosts(content);
      default:
        return { summary: "Unknown content type" };
    }
  }

  summarizeArticle(content) {
    return {
      title: content.title || "Untitled",
      word_count: content.word_count || 0,
      reading_time: Math.ceil((content.word_count || 0) / 200),
      has_images: document.querySelectorAll("img").length > 0,
      has_videos:
        document.querySelectorAll(
          'video, iframe[src*="youtube"], iframe[src*="vimeo"]'
        ).length > 0,
      preview:
        content.content?.substring(0, 200) +
        (content.content?.length > 200 ? "..." : ""),
      estimated_tokens: Math.ceil((content.content?.length || 0) / 4),
    };
  }

  summarizeSearchResults(results) {
    const domains = results
      .map((r) => r.link)
      .filter(Boolean)
      .map((url) => {
        try {
          return new URL(url).hostname;
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return {
      total_results: results.length,
      result_types: [...new Set(results.map((r) => r.type))],
      top_domains: this.getTopDomains(domains),
      avg_score:
        results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length,
      has_sponsored: results.some((r) => r.type === "sponsored"),
      quality_score: this.calculateQualityScore(results),
    };
  }

  summarizePosts(posts) {
    const totalTextLength = posts.reduce(
      (sum, p) => sum + (p.text?.length || 0),
      0
    );
    const totalLikes = posts.reduce(
      (sum, p) => sum + (p.metrics?.likes || 0),
      0
    );

    return {
      post_count: posts.length,
      avg_length: Math.round(totalTextLength / posts.length),
      has_media_count: posts.filter((p) => p.has_media).length,
      engagement_total: totalLikes,
      avg_engagement: Math.round(totalLikes / posts.length),
      post_types: [...new Set(posts.map((p) => p.post_type))],
      authors: [...new Set(posts.map((p) => p.author).filter(Boolean))].length,
      estimated_tokens: Math.ceil(totalTextLength / 4),
    };
  }

  // Helper methods for extraction
  extractResultTitle(element, summarize = true) {
    const titleSelectors = [
      'h1, h2, h3, .title, .headline, [data-testid*="title"]',
    ];
    for (const selector of titleSelectors) {
      const title = element.querySelector(selector)?.textContent?.trim();
      if (title) {
        return summarize ? title.substring(0, 100) : title;
      }
    }
    const fallbackTitle = element.textContent?.trim() || "No title";
    return summarize ? fallbackTitle.substring(0, 50) : fallbackTitle;
  }

  extractResultSummary(element, summarize = true) {
    const summarySelectors = [".summary, .description, .snippet, .excerpt"];
    for (const selector of summarySelectors) {
      const summary = element.querySelector(selector)?.textContent?.trim();
      if (summary) {
        return summarize ? summary.substring(0, 200) : summary;
      }
    }
    const fallbackSummary = element.textContent?.trim() || "";
    return summarize ? fallbackSummary.substring(0, 150) : fallbackSummary;
  }

  extractResultLink(element) {
    const link =
      element.querySelector("a[href]")?.href ||
      element.closest("a[href]")?.href ||
      element.getAttribute("href");
    return link || null;
  }

  detectResultType(element) {
    if (
      element.textContent?.toLowerCase().includes("sponsored") ||
      element.querySelector(".ad, .sponsored")
    )
      return "sponsored";
    if (element.querySelector("img, video")) return "media";
    if (element.querySelector(".price, .cost")) return "product";
    return "organic";
  }

  scoreSearchResult(element) {
    let score = 0.5;
    if (element.querySelector("h1, h2, h3")) score += 0.2;
    if (element.querySelector("img")) score += 0.1;
    if (element.textContent?.length > 100) score += 0.1;
    if (element.querySelector("a[href]")) score += 0.1;
    return Math.min(score, 1.0);
  }

  extractPostText(element, summarize = true) {
    const textSelectors = [
      '[data-testid="tweetText"], .tweet-text',
      ".post-content, .entry-content",
      ".status-content, .message-content",
    ];

    for (const selector of textSelectors) {
      const text = element.querySelector(selector)?.textContent?.trim();
      if (text) {
        return summarize ? text.substring(0, 280) : text;
      }
    }

    const fallbackText = element.textContent?.trim() || "";
    return summarize ? fallbackText.substring(0, 280) : fallbackText;
  }

  extractPostAuthor(element) {
    const authorSelectors = [
      '[data-testid="User-Name"], .username',
      ".author, .user-name, .handle",
    ];

    for (const selector of authorSelectors) {
      const author = element.querySelector(selector)?.textContent?.trim();
      if (author) return author.substring(0, 50);
    }
    return "Unknown";
  }

  extractPostTimestamp(element) {
    const timeSelectors = ['time, .timestamp, .date, [data-testid*="time"]'];
    for (const selector of timeSelectors) {
      const time = element.querySelector(selector);
      if (time) {
        return (
          time.getAttribute("datetime") || time.textContent?.trim() || null
        );
      }
    }
    return null;
  }

  extractPostMetrics(element) {
    const metrics = {};
    const likeSelectors = ['[data-testid*="like"], .like-count, .heart-count'];
    const replySelectors = [
      '[data-testid*="reply"], .reply-count, .comment-count',
    ];
    const shareSelectors = [
      '[data-testid*="retweet"], .share-count, .repost-count',
    ];

    for (const selector of likeSelectors) {
      const likes = element
        .querySelector(selector)
        ?.textContent?.match(/\d+/)?.[0];
      if (likes) metrics.likes = parseInt(likes);
    }

    for (const selector of replySelectors) {
      const replies = element
        .querySelector(selector)
        ?.textContent?.match(/\d+/)?.[0];
      if (replies) metrics.replies = parseInt(replies);
    }

    for (const selector of shareSelectors) {
      const shares = element
        .querySelector(selector)
        ?.textContent?.match(/\d+/)?.[0];
      if (shares) metrics.shares = parseInt(shares);
    }

    return metrics;
  }

  hasPostMedia(element) {
    return element.querySelector('img, video, [data-testid*="media"]') !== null;
  }

  detectPostType(element) {
    if (element.querySelector('[data-testid*="retweet"]')) return "repost";
    if (element.querySelector('[data-testid*="reply"]')) return "reply";
    if (element.hasAttribute("data-promoted")) return "promoted";
    return "original";
  }

  getTopDomains(domains, limit = 5) {
    const domainCounts = {};
    domains.forEach((domain) => {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
    });

    return Object.entries(domainCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([domain, count]) => ({ domain, count }));
  }

  calculateQualityScore(results) {
    const avgScore =
      results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length;
    const hasLinks = results.filter((r) => r.link).length / results.length;
    const hasContent =
      results.filter((r) => r.summary?.length > 50).length / results.length;

    return Math.round(
      (avgScore * 0.4 + hasLinks * 0.3 + hasContent * 0.3) * 100
    );
  }

  getExtractionMethod(content_type) {
    const hostname = window.location.hostname;
    if (hostname.includes("twitter") || hostname.includes("x.com"))
      return "twitter_patterns";
    if (hostname.includes("github")) return "github_patterns";
    if (hostname.includes("google")) return "google_patterns";
    return `semantic_${content_type}`;
  }

  estimateContentTokens(content) {
    if (Array.isArray(content)) {
      return content.reduce((sum, item) => {
        return sum + Math.ceil(JSON.stringify(item).length / 4);
      }, 0);
    } else {
      return Math.ceil(JSON.stringify(content).length / 4);
    }
  }

  async clickElement({ element_id, click_type = "left", wait_after = 500 }) {
    const element = this.getElementById(element_id);
    if (!element) {
      throw new Error(`Element not found: ${element_id}`);
    }

    // Scroll element into view
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Click the element
    if (click_type === "right") {
      element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    } else {
      element.click();
    }

    await new Promise((resolve) => setTimeout(resolve, wait_after));

    return {
      success: true,
      element_id,
      click_type,
      element_name: this.getElementName(element),
    };
  }

  async ensureProperFocus(element) {
    // Scroll element into view first
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Simulate proper mouse interaction sequence
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Fire mouse events in sequence
    element.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
      })
    );

    element.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
      })
    );

    element.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: centerX,
        clientY: centerY,
      })
    );

    // Focus and fire focus events
    element.focus();
    element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

    // Wait for React/framework to update
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async clearElementContent(element) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      element.value = "";
      element.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (element.contentEditable === "true") {
      // For contenteditable, simulate selecting all and deleting
      element.focus();
      document.execCommand("selectAll");
      document.execCommand("delete");
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  async fillWithEvents(element, value) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      // Set value and fire comprehensive events
      element.value = value;
      element.dispatchEvent(new Event("beforeinput", { bubbles: true }));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));

      // Fire keyboard events to simulate typing completion
      element.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "End" })
      );
      element.dispatchEvent(
        new KeyboardEvent("keyup", { bubbles: true, key: "End" })
      );
    } else if (element.contentEditable === "true") {
      // For contenteditable elements (like Twitter)
      element.textContent = value;
      element.dispatchEvent(new Event("beforeinput", { bubbles: true }));
      element.dispatchEvent(new Event("input", { bubbles: true }));

      // Trigger composition events for better compatibility
      element.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          data: value,
        })
      );

      // Fire selection change to notify frameworks
      document.dispatchEvent(new Event("selectionchange"));
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  getElementValue(element) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      return element.value;
    } else if (element.contentEditable === "true") {
      return element.textContent || element.innerText || "";
    }
    return "";
  }

  // Element state detection methods
  getElementState(element) {
    const state = {
      disabled: this.isElementDisabled(element),
      visible: this.isLikelyVisible(element),
      clickable: this.isElementClickable(element),
      focusable: this.isElementFocusable(element),
      hasText: this.hasText(element),
      isEmpty: this.isEmpty(element),
    };

    // Overall interaction readiness
    state.interaction_ready =
      state.visible && !state.disabled && (state.clickable || state.focusable);

    return state;
  }

  isElementDisabled(element) {
    // Check disabled attribute
    if (element.disabled === true) return true;
    if (element.getAttribute("disabled") !== null) return true;

    // Check aria-disabled
    if (element.getAttribute("aria-disabled") === "true") return true;

    // Check common disabled classes
    const disabledClasses = [
      "disabled",
      "btn-disabled",
      "button-disabled",
      "inactive",
    ];
    const classList = Array.from(element.classList);
    if (disabledClasses.some((cls) => classList.includes(cls))) return true;

    // Check if parent form/fieldset is disabled
    const parentFieldset = element.closest("fieldset[disabled]");
    if (parentFieldset) return true;

    // Check computed styles for pointer-events: none
    const computedStyle = getComputedStyle(element);
    if (computedStyle.pointerEvents === "none") return true;

    return false;
  }

  isElementClickable(element) {
    const clickableTags = ["BUTTON", "A", "INPUT"];
    const clickableTypes = ["button", "submit", "reset"];
    const clickableRoles = ["button", "link", "menuitem", "tab"];

    // Check tag and type
    if (clickableTags.includes(element.tagName)) return true;
    if (element.type && clickableTypes.includes(element.type)) return true;

    // Check role
    const role = element.getAttribute("role");
    if (role && clickableRoles.includes(role)) return true;

    // Check for click handlers
    if (element.onclick || element.getAttribute("onclick")) return true;

    // Check for common clickable classes
    const clickableClasses = ["btn", "button", "clickable", "link"];
    const classList = Array.from(element.classList);
    if (clickableClasses.some((cls) => classList.includes(cls))) return true;

    return false;
  }

  isElementFocusable(element) {
    const focusableTags = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"];

    // Check if element is naturally focusable
    if (focusableTags.includes(element.tagName)) return true;

    // Check tabindex
    const tabindex = element.getAttribute("tabindex");
    if (tabindex && tabindex !== "-1") return true;

    // Check contenteditable
    if (element.contentEditable === "true") return true;

    // Check role
    const focusableRoles = ["textbox", "searchbox", "button", "link"];
    const role = element.getAttribute("role");
    if (role && focusableRoles.includes(role)) return true;

    return false;
  }

  hasText(element) {
    const text =
      element.textContent ||
      element.value ||
      element.getAttribute("aria-label") ||
      "";
    return text.trim().length > 0;
  }

  isEmpty(element) {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      return !element.value || element.value.trim().length === 0;
    }
    if (element.contentEditable === "true") {
      return !element.textContent || element.textContent.trim().length === 0;
    }
    return false;
  }

  async waitForCondition({ condition_type, selector, text, timeout = 5000 }) {
    const startTime = Date.now();

    const conditions = {
      element_visible: () => {
        const el = document.querySelector(selector);
        return el && el.offsetParent !== null;
      },
      text_present: () => document.body.textContent.includes(text),
    };

    const checkCondition = conditions[condition_type];
    if (!checkCondition) {
      throw new Error(`Unknown condition type: ${condition_type}`);
    }

    while (Date.now() - startTime < timeout) {
      if (checkCondition()) {
        return {
          condition_met: true,
          wait_time: Date.now() - startTime,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for condition: ${condition_type}`);
  }

  // Utility methods
  registerElement(element) {
    const id = `element_${++this.idCounter}`;
    this.elementRegistry.set(id, element);
    return id;
  }

  getElementById(id) {
    // Check quick registry first (for q1, q2, etc.)
    if (id.startsWith("q")) {
      return this.quickRegistry.get(id);
    }
    // Then check main registry (for element_1, element_2, etc.)
    return this.elementRegistry.get(id);
  }

  getElementName(element) {
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent?.trim()?.substring(0, 50) ||
      element.placeholder ||
      element.tagName.toLowerCase()
    );
  }

  isVisible(element) {
    return (
      element.offsetParent !== null &&
      getComputedStyle(element).visibility !== "hidden" &&
      getComputedStyle(element).opacity !== "0"
    );
  }

  generateSelector(element) {
    if (element.id) return `#${element.id}`;
    if (element.getAttribute("data-testid"))
      return `[data-testid="${element.getAttribute("data-testid")}"]`;

    let selector = element.tagName.toLowerCase();
    if (element.className) {
      selector += `.${element.className.split(" ").join(".")}`;
    }
    return selector;
  }

  inferElementType(element, intentHint) {
    const tagName = element.tagName.toLowerCase();
    const role = element.getAttribute("role");
    const type = element.getAttribute("type");

    if (tagName === "input" && type === "search") return "search_input";
    if (tagName === "input") return "input";
    if (tagName === "textarea") return "textarea";
    if (tagName === "button" || role === "button") return "button";
    if (tagName === "a") return "link";

    return "element";
  }

  calculateConfidence(element, intentHint) {
    let confidence = 0.5;

    const text = this.getElementName(element).toLowerCase();
    const hint = intentHint.toLowerCase();

    if (text.includes(hint)) confidence += 0.3;
    if (element.getAttribute("data-testid")) confidence += 0.2;
    if (element.getAttribute("aria-label")) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  formatAnalysisResult(result, method, startTime) {
    return {
      ...result,
      method,
      execution_time: Math.round(performance.now() - startTime),
      analyzed_at: new Date().toISOString(),
    };
  }

  // Two-phase utility methods
  compressElement(element, isQuick = false) {
    const actualElement = element.element || element;
    const state = this.getElementState(actualElement);

    if (isQuick) {
      // Quick phase - minimal data with state
      const quickId = `q${++this.quickIdCounter}`;
      this.quickRegistry.set(quickId, actualElement);

      return {
        id: quickId,
        type: element.type || "element",
        name: element.name?.substring(0, 20) || "unnamed",
        conf: Math.round((element.confidence || 0.5) * 100),
        selector: element.selector || "unknown",
        state: state.disabled ? "disabled" : "enabled",
        clickable: state.clickable,
        ready: state.interaction_ready,
      };
    } else {
      // Detailed phase - compact fingerprint with full state
      return {
        id: element.id,
        fp: this.generateFingerprint(actualElement),
        name: element.name?.substring(0, 30) || "unnamed",
        conf: Math.round((element.confidence || 0.5) * 100),
        meta: {
          ...this.getElementMeta(actualElement),
          state: state,
        },
      };
    }
  }

  generateFingerprint(element) {
    const tag = element.tagName.toLowerCase();
    const primaryClass = this.getPrimaryClass(element);
    const context = this.getContext(element);
    const position = this.getRelativePosition(element);

    return `${tag}${
      primaryClass ? "." + primaryClass : ""
    }@${context}.${position}`;
  }

  getPrimaryClass(element) {
    const importantClasses = [
      "btn",
      "button",
      "link",
      "input",
      "search",
      "submit",
      "primary",
      "secondary",
    ];
    const classList = Array.from(element.classList);
    return (
      classList.find((cls) => importantClasses.includes(cls)) || classList[0]
    );
  }

  getContext(element) {
    const parent =
      element.closest("nav, main, header, footer, form, section, article") ||
      element.parentElement;
    if (!parent) return "body";
    return parent.tagName.toLowerCase();
  }

  getRelativePosition(element) {
    const siblings = Array.from(element.parentElement?.children || []);
    const sameTypeElements = siblings.filter(
      (el) => el.tagName === element.tagName
    );
    return sameTypeElements.indexOf(element) + 1;
  }

  getElementMeta(element) {
    const rect = element.getBoundingClientRect();
    return {
      rect: [
        Math.round(rect.x),
        Math.round(rect.y),
        Math.round(rect.width),
        Math.round(rect.height),
      ],
      visible: this.isLikelyVisible(element),
      form_context: element.closest("form") ? "form" : null,
    };
  }

  detectPageType() {
    const hostname = window.location.hostname;
    const title = document.title.toLowerCase();
    const hasSearch = document.querySelector(
      '[type="search"], [role="searchbox"]'
    );
    const hasLogin = document.querySelector(
      '[type="password"], [name*="login" i]'
    );
    const hasPost = document.querySelector(
      '[contenteditable="true"], textarea[placeholder*="post" i]'
    );

    if (hostname.includes("twitter") || hostname.includes("x.com"))
      return "social_media";
    if (hostname.includes("github")) return "code_repository";
    if (hostname.includes("google")) return "search_engine";
    if (hasPost) return "content_creation";
    if (hasLogin) return "authentication";
    if (hasSearch) return "search_interface";
    if (title.includes("shop") || title.includes("store")) return "ecommerce";

    return "general_website";
  }

  countViewportElements() {
    const elements = document.querySelectorAll(
      "button, input, select, textarea, a[href]"
    );
    const viewportElements = Array.from(elements).filter((el) =>
      this.isLikelyVisible(el)
    );

    return {
      buttons: viewportElements.filter(
        (el) => el.tagName === "BUTTON" || el.getAttribute("role") === "button"
      ).length,
      inputs: viewportElements.filter((el) => el.tagName === "INPUT").length,
      links: viewportElements.filter((el) => el.tagName === "A").length,
      textareas: viewportElements.filter((el) => el.tagName === "TEXTAREA")
        .length,
      selects: viewportElements.filter((el) => el.tagName === "SELECT").length,
    };
  }

  async quickViewportScan(intent_hint, maxResults = 3) {
    const candidates = document.querySelectorAll(
      'button, input, a[href], [role="button"], textarea'
    );
    const visibleElements = Array.from(candidates)
      .filter((el) => this.isLikelyVisible(el))
      .slice(0, 10); // Limit scan to first 10 visible elements

    const scoredElements = visibleElements.map((element) => {
      const confidence = this.calculateConfidence(element, intent_hint);
      return {
        element,
        type: this.inferElementType(element, intent_hint),
        name: this.getElementName(element),
        confidence,
      };
    });

    return scoredElements
      .filter((el) => el.confidence > 0.3)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxResults)
      .map((el) => this.compressElement(el, true));
  }

  scoreIntentMatch(intent_hint, quickMatches) {
    if (quickMatches.length === 0) return "none";
    const avgConfidence =
      quickMatches.reduce((sum, match) => sum + match.conf, 0) /
      quickMatches.length;

    if (avgConfidence >= 80) return "high";
    if (avgConfidence >= 60) return "medium";
    if (avgConfidence >= 40) return "low";
    return "none";
  }

  suggestPhase2Areas(quickMatches, intent_hint) {
    const suggestions = [];
    const elementTypes = [...new Set(quickMatches.map((m) => m.type))];

    if (elementTypes.includes("button")) suggestions.push("buttons");
    if (elementTypes.includes("input") || elementTypes.includes("textarea"))
      suggestions.push("forms");
    if (elementTypes.includes("link")) suggestions.push("navigation");

    // Intent-based suggestions
    if (
      intent_hint.toLowerCase().includes("search") &&
      !suggestions.includes("forms")
    ) {
      suggestions.push("search_elements");
    }

    return suggestions.slice(0, 3);
  }

  estimatePhase2Tokens(quickMatches) {
    // Estimate tokens needed for detailed analysis
    const baseTokens = 50; // Base overhead
    const tokensPerElement = 15; // Detailed element info
    const contextTokens = 20; // Page context

    return baseTokens + quickMatches.length * tokensPerElement + contextTokens;
  }

  async expandQuickMatches(element_ids) {
    const elements = [];
    for (const id of element_ids) {
      const element = this.quickRegistry.get(id);
      if (element) {
        const elementId = this.registerElement(element);
        elements.push({
          id: elementId,
          type: this.inferElementType(element, ""),
          name: this.getElementName(element),
          confidence: 0.8, // Default confidence for expanded elements
          element: element,
        });
      }
    }
    return elements;
  }

  async analyzeFocusAreas(focus_areas, intent_hint) {
    const elements = [];
    const areaSelectors = {
      buttons: 'button, [role="button"], input[type="submit"]',
      forms: 'input, textarea, select, [contenteditable="true"]',
      navigation: 'nav a, .nav-item, [role="navigation"] a',
      search_elements:
        '[type="search"], [role="searchbox"], [placeholder*="search" i]',
    };

    for (const area of focus_areas) {
      const selector = areaSelectors[area];
      if (selector) {
        const areaElements = document.querySelectorAll(selector);
        for (const element of Array.from(areaElements).slice(0, 5)) {
          if (this.isLikelyVisible(element)) {
            const elementId = this.registerElement(element);
            elements.push({
              id: elementId,
              type: this.inferElementType(element, intent_hint),
              name: this.getElementName(element),
              confidence: this.calculateConfidence(element, intent_hint),
              element: element,
            });
          }
        }
      }
    }

    return elements;
  }

  async fullEnhancedAnalysis(intent_hint, max_results) {
    // Enhanced version of semantic analysis with better filtering
    const relevantElements = document.querySelectorAll(`
      button, input, select, textarea, a[href],
      [role="button"], [role="textbox"], [role="searchbox"],
      [aria-label], [data-testid], [contenteditable="true"]
    `);

    const elements = Array.from(relevantElements)
      .filter((el) => this.isLikelyVisible(el))
      .slice(0, 30) // Analyze more elements than before
      .map((element) => {
        const elementId = this.registerElement(element);
        return {
          id: elementId,
          type: this.inferElementType(element, intent_hint),
          selector: this.generateSelector(element),
          name: this.getElementName(element),
          confidence: this.calculateConfidence(element, intent_hint),
          element: element,
        };
      })
      .filter((el) => el.confidence > 0.2) // Lower threshold for detailed analysis
      .sort((a, b) => b.confidence - a.confidence);

    return elements.slice(0, max_results);
  }

  deduplicateElements(elements) {
    const seen = new Set();
    return elements.filter((element) => {
      const key = element.name + element.type;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async enhanceElementMetadata(elements) {
    return elements.map((element) => ({
      ...element,
      meta: this.getElementMeta(element.element),
    }));
  }

  isLikelyVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0 &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      style.display !== "none"
    );
  }

  estimateTokenUsage(result) {
    // Estimate token count based on result size
    const jsonString = JSON.stringify(result);
    return Math.ceil(jsonString.length / 4); // Rough estimate: 4 chars per token
  }
  // Get all links on the page with filtering options
  async getPageLinks(options = {}) {
    const {
      include_internal = true,
      include_external = true,
      domain_filter = null,
      max_results = 100
    } = options;

    const links = Array.from(document.querySelectorAll('a[href]'));
    const currentDomain = this.extractDomain(window.location.href);
    const results = [];

    for (const link of links) {
      if (results.length >= max_results) break;

      const href = link.href;
      const linkDomain = this.extractDomain(href);
      const isInternal = this.isSameDomain(currentDomain, linkDomain);

      // Apply internal/external filter
      if (!include_internal && isInternal) continue;
      if (!include_external && !isInternal) continue;

      // Apply domain filter
      if (domain_filter && !linkDomain.includes(domain_filter)) continue;

      const linkText = link.textContent?.trim() || '';
      const linkTitle = link.title || '';

      results.push({
        url: href,
        text: linkText,
        title: linkTitle,
        type: isInternal ? 'internal' : 'external',
        domain: linkDomain
      });
    }

    return {
      links: results,
      total_found: links.length,
      returned: results.length,
      current_domain: currentDomain
    };
  }

  // Check if two domains are the same (handles subdomains)
  isSameDomain(domain1, domain2) {
    if (!domain1 || !domain2) return false;

    // Remove www. prefix for comparison
    const clean1 = domain1.replace(/^www\./, '');
    const clean2 = domain2.replace(/^www\./, '');

    return clean1 === clean2;
  }

  // Extract domain from URL
  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  // Scroll page with comprehensive options
  async scrollPage(options = {}) {
    const {
      direction = 'down',
      amount = 'medium',
      pixels = null,
      smooth = true,
      element_id = null,
      wait_after = 500
    } = options;

    const startPosition = {
      x: window.scrollX,
      y: window.scrollY
    };

    try {
      // If element_id is provided, scroll to that element
      if (element_id) {
        const element = this.getElementById(element_id);
        if (!element) {
          throw new Error(`Element not found: ${element_id}`);
        }

        element.scrollIntoView({
          behavior: smooth ? 'smooth' : 'instant',
          block: 'center',
          inline: 'center'
        });

        await new Promise(resolve => setTimeout(resolve, wait_after));

        return {
          success: true,
          previous_position: startPosition,
          new_position: { x: window.scrollX, y: window.scrollY },
          method: 'scroll_to_element',
          element_id: element_id,
          element_name: this.getElementName(element)
        };
      }

      // Calculate scroll amount based on amount parameter
      let scrollAmount;
      if (amount === 'custom' && pixels) {
        scrollAmount = pixels;
      } else {
        switch (amount) {
          case 'small':
            scrollAmount = Math.min(200, window.innerHeight * 0.25);
            break;
          case 'medium':
            scrollAmount = Math.min(2000, window.innerHeight * 2.0);
            break;
          case 'large':
            scrollAmount = Math.min(800, window.innerHeight * 0.8);
            break;
          case 'page':
            scrollAmount = window.innerHeight * 0.9; // Slightly less than full page for overlap
            break;
          default:
            scrollAmount = Math.min(2000, window.innerHeight * 2.0);
        }
      }

      // Calculate scroll direction
      let scrollX = 0;
      let scrollY = 0;

      switch (direction) {
        case 'up':
          scrollY = -scrollAmount;
          break;
        case 'down':
          scrollY = scrollAmount;
          break;
        case 'left':
          scrollX = -scrollAmount;
          break;
        case 'right':
          scrollX = scrollAmount;
          break;
        case 'top':
          // Scroll to top of page
          if (smooth) {
            window.scrollTo({ top: 0, left: window.scrollX, behavior: 'smooth' });
          } else {
            window.scrollTo(window.scrollX, 0);
          }
          await new Promise(resolve => setTimeout(resolve, wait_after));
          return {
            success: true,
            previous_position: startPosition,
            new_position: { x: window.scrollX, y: window.scrollY },
            direction: direction,
            method: 'scroll_to_top'
          };
        case 'bottom':
          // Scroll to bottom of page
          const maxY = Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          ) - window.innerHeight;
          if (smooth) {
            window.scrollTo({ top: maxY, left: window.scrollX, behavior: 'smooth' });
          } else {
            window.scrollTo(window.scrollX, maxY);
          }
          await new Promise(resolve => setTimeout(resolve, wait_after));
          return {
            success: true,
            previous_position: startPosition,
            new_position: { x: window.scrollX, y: window.scrollY },
            direction: direction,
            method: 'scroll_to_bottom'
          };
        default:
          throw new Error(`Unknown scroll direction: ${direction}`);
      }

      // Perform the scroll
      if (smooth) {
        window.scrollBy({
          left: scrollX,
          top: scrollY,
          behavior: 'smooth'
        });
      } else {
        window.scrollBy(scrollX, scrollY);
      }

      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, wait_after));

      const finalPosition = {
        x: window.scrollX,
        y: window.scrollY
      };

      const actualScrolled = {
        x: finalPosition.x - startPosition.x,
        y: finalPosition.y - startPosition.y
      };

      return {
        success: true,
        previous_position: startPosition,
        new_position: finalPosition,
        direction: direction,
        amount: amount,
        requested_pixels: scrollAmount,
        actual_scrolled: actualScrolled,
        total_distance: Math.sqrt(actualScrolled.x ** 2 + actualScrolled.y ** 2),
        smooth: smooth,
        wait_after: wait_after
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        previous_position: startPosition,
        new_position: { x: window.scrollX, y: window.scrollY },
        direction: direction,
        amount: amount
      };
    }
  }

  // 🎨 Page Styling System
  async handlePageStyle(data) {
    const { mode, theme, background, text_color, font, font_size, mood, intensity, effect, duration, remember } = data;

    // Remove existing custom styles
    const existingStyle = document.getElementById('opendia-custom-style');
    if (existingStyle) existingStyle.remove();

    let css = '';
    let description = '';

    try {
      switch (mode) {
        case 'preset':
          const themeData = THEME_PRESETS[theme];
          if (!themeData) throw new Error(`Unknown theme: ${theme}`);
          css = themeData.css;
          description = `Applied ${themeData.name} theme`;
          break;

        case 'custom':
          css = this.buildCustomCSS({ background, text_color, font, font_size });
          description = 'Applied custom styling';
          break;

        case 'ai_mood':
          css = this.generateMoodCSS(mood, intensity);
          description = `Applied AI-generated style for mood: "${mood}"`;
          break;

        case 'effect':
          css = this.applyEffect(effect, duration);
          description = `Applied ${effect} effect for ${duration}s`;
          break;

        case 'reset':
          // CSS already removed above
          description = 'Reset page to original styling';
          break;

        default:
          throw new Error(`Unknown styling mode: ${mode}`);
      }

      if (css) {
        const styleElement = document.createElement('style');
        styleElement.id = 'opendia-custom-style';
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
      }

      // Remember preference if requested
      if (remember && mode !== 'reset') {
        const domain = window.location.hostname;
        chrome.storage.local.set({ [`style_${domain}`]: { mode, theme, css } });
      }

      return {
        success: true,
        description,
        applied_css: css.length,
        mode,
        theme: theme || 'custom',
        remember_enabled: remember,
        effect_duration: duration,
        mood,
        intensity
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        mode,
        theme,
        applied_css: 0
      };
    }
  }

  buildCustomCSS({ background, text_color, font, font_size }) {
    let css = '';

    if (background || text_color || font || font_size) {
      css += '* { ';
      if (background) css += `background: ${background} !important; `;
      if (text_color) css += `color: ${text_color} !important; `;
      if (font) css += `font-family: ${font} !important; `;
      if (font_size) css += `font-size: ${font_size} !important; `;
      css += '}';
    }

    return css;
  }

  generateMoodCSS(mood, intensity) {
    const moodMap = {
      'cozy coffee shop': {
        background: '#2c1810',
        text: '#f4e4bc',
        accent: '#d4af37',
        font: 'Georgia, serif'
      },
      'energetic': {
        background: 'linear-gradient(45deg, #ff6b35, #f7931e)',
        text: '#ffffff',
        effects: 'animation: energyPulse 1s infinite;'
      },
      'calm ocean': {
        background: 'linear-gradient(to bottom, #87ceeb, #4682b4)',
        text: '#ffffff',
        effects: 'animation: gentleWave 4s ease-in-out infinite;'
      },
      'dark professional': {
        background: '#1a1a1a',
        text: '#e0e0e0',
        accent: '#0066cc'
      },
      'warm sunset': {
        background: 'linear-gradient(to bottom, #ff7e5f, #feb47b)',
        text: '#ffffff'
      }
    };

    const style = moodMap[mood.toLowerCase()] || moodMap['cozy coffee shop'];
    return this.buildMoodCSS(style, intensity);
  }

  buildMoodCSS(style, intensity) {
    const opacity = intensity === 'subtle' ? '0.3' : intensity === 'medium' ? '0.6' : '0.9';

    let css = `
      body {
        background: ${style.background} !important;
        color: ${style.text} !important;
        ${style.font ? `font-family: ${style.font} !important;` : ''}
      }

      * {
        color: ${style.text} !important;
      }

      a {
        color: ${style.accent || style.text} !important;
      }
    `;

    if (style.effects) {
      css += style.effects;
    }

    // Add animation keyframes if needed
    if (style.effects && style.effects.includes('energyPulse')) {
      css += `
        @keyframes energyPulse {
          0%, 100% { filter: hue-rotate(0deg); }
          50% { filter: hue-rotate(180deg); }
        }
      `;
    }

    if (style.effects && style.effects.includes('gentleWave')) {
      css += `
        @keyframes gentleWave {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `;
    }

    return css;
  }

  applyEffect(effect, duration) {
    const effects = {
      matrix_rain: `
        body::after {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="10" font-size="8" fill="%2300ff00">0</text><text y="20" font-size="8" fill="%2300ff00">1</text><text y="30" font-size="8" fill="%2300ff00">0</text><text y="40" font-size="8" fill="%2300ff00">1</text></svg>');
          animation: matrixFall 2s linear infinite;
          pointer-events: none;
          z-index: 9999;
          opacity: 0.7;
        }
        @keyframes matrixFall {
          from { transform: translateY(-100px); }
          to { transform: translateY(100vh); }
        }
      `,
      floating_particles: `
        body::before {
          content: '✨ 🌟 ⭐ 💫';
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          animation: floatParticles 6s ease-in-out infinite;
          pointer-events: none;
          z-index: 9999;
          font-size: 20px;
        }
        @keyframes floatParticles {
          0%, 100% { transform: translateY(100vh) rotate(0deg); }
          50% { transform: translateY(-100px) rotate(180deg); }
        }
      `,
      cursor_trail: `
        body {
          cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="rgba(255,0,255,0.5)"/></svg>'), auto !important;
        }
      `,
      neon_glow: `
        * {
          text-shadow: 0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff !important;
        }

        a, button {
          box-shadow: 0 0 15px #ff00ff !important;
        }
      `,
      typing_effect: `
        * {
          animation: typewriter 2s steps(40, end) infinite !important;
        }
        @keyframes typewriter {
          from { width: 0; }
          to { width: 100%; }
        }
      `
    };

    const css = effects[effect] || '';

    // Auto-remove effect after duration
    if (duration && duration > 0) {
      setTimeout(() => {
        const effectStyle = document.getElementById('opendia-custom-style');
        if (effectStyle) effectStyle.remove();
      }, duration * 1000);
    }

    return css;
  }

  // 🎯 INTERACTIVE SELECTION TOOL
  async selectElement(data) {
    console.log("🎯 Starting interactive element selection");

    return new Promise((resolve, reject) => {
      this.selectionResolve = resolve;
      this.selectionReject = reject;
      this.enableSelectionMode();

      // Timeout after 60 seconds if no selection
      this.selectionTimeout = setTimeout(() => {
        this.disableSelectionMode();
        reject(new Error("Selection timed out after 60 seconds"));
      }, 60000);
    });
  }

  enableSelectionMode() {
    // Create overlay element if it doesn't exist
    if (!this.selectionOverlay) {
      this.selectionOverlay = document.createElement('div');
      this.selectionOverlay.id = 'opendia-selection-overlay';
      this.selectionOverlay.style.cssText = `
        position: fixed;
        pointer-events: none;
        background: rgba(0, 150, 255, 0.2);
        border: 2px solid #0096ff;
        z-index: 2147483647;
        transition: all 0.1s ease;
        border-radius: 4px;
        box-shadow: 0 0 10px rgba(0, 150, 255, 0.5);
      `;

      this.selectionLabel = document.createElement('div');
      this.selectionLabel.style.cssText = `
        position: absolute;
        top: -28px;
        left: 0;
        background: #0096ff;
        color: white;
        padding: 4px 8px;
        font-family: monospace;
        font-size: 12px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      `;
      this.selectionOverlay.appendChild(this.selectionLabel);
      document.body.appendChild(this.selectionOverlay);
    }

    // Bind handlers
    this.boundHoverHandler = this.handleSelectionHover.bind(this);
    this.boundClickHandler = this.handleSelectionClick.bind(this);
    this.boundEscHandler = this.handleSelectionEsc.bind(this);

    // Add listeners with capture to ensure we get them first
    document.addEventListener('mouseover', this.boundHoverHandler, true);
    document.addEventListener('click', this.boundClickHandler, true);
    document.addEventListener('keydown', this.boundEscHandler, true);

    // Add global cursor style
    this.originalBodyCursor = document.body.style.cursor;
    document.body.style.cursor = 'crosshair';

    console.log("🎯 Selection mode enabled");
  }

  disableSelectionMode() {
    // Remove listeners
    document.removeEventListener('mouseover', this.boundHoverHandler, true);
    document.removeEventListener('click', this.boundClickHandler, true);
    document.removeEventListener('keydown', this.boundEscHandler, true);

    // Remove overlay
    if (this.selectionOverlay) {
      this.selectionOverlay.remove();
      this.selectionOverlay = null;
    }

    // Restore cursor
    document.body.style.cursor = this.originalBodyCursor || '';

    // Clear timeout
    if (this.selectionTimeout) {
      clearTimeout(this.selectionTimeout);
      this.selectionTimeout = null;
    }

    console.log("🎯 Selection mode disabled");
  }

  handleSelectionHover(event) {
    event.stopPropagation();
    const target = event.target;

    // Don't highlight the overlay itself (though pointer-events: none should prevent this)
    if (target === this.selectionOverlay || this.selectionOverlay.contains(target)) return;

    const rect = target.getBoundingClientRect();

    this.selectionOverlay.style.top = rect.top + 'px';
    this.selectionOverlay.style.left = rect.left + 'px';
    this.selectionOverlay.style.width = rect.width + 'px';
    this.selectionOverlay.style.height = rect.height + 'px';

    // Update label
    const tagName = target.tagName.toLowerCase();
    const id = target.id ? '#' + target.id : '';
    const classes = Array.from(target.classList).map(c => '.' + c).join('');
    this.selectionLabel.textContent = `${tagName}${id}${classes}`;
  }

  handleSelectionClick(event) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.target;
    this.disableSelectionMode();

    // Extract info
    const info = {
      tagName: target.tagName.toLowerCase(),
      id: target.id,
      classes: Array.from(target.classList),
      attributes: this.getAttributes(target),
      textContent: target.textContent.trim().substring(0, 500),
      html: this.getTruncatedHTML(target),
      parent: this.getParentInfo(target),
      path: this.getCssPath(target)
    };

    if (this.selectionResolve) {
      this.selectionResolve(info);
      this.selectionResolve = null;
    }
  }

  handleSelectionEsc(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.disableSelectionMode();
      if (this.selectionReject) {
        this.selectionReject(new Error("Selection cancelled by user"));
        this.selectionReject = null;
      }
    }
  }

  getAttributes(element) {
    const attrs = {};
    for (const attr of element.attributes) {
      attrs[attr.name] = attr.value;
    }
    return attrs;
  }

  getTruncatedHTML(element) {
    // Clone to avoid modifying the actual element
    const clone = element.cloneNode(true);

    // Remove scripts and styles to reduce noise
    const scripts = clone.querySelectorAll('script, style');
    scripts.forEach(s => s.remove());

    // Truncate long text content in children
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.length > 100) {
        node.textContent = node.textContent.substring(0, 100) + '...';
      }
    }

    // Truncate SVG content
    const svgs = clone.querySelectorAll('svg');
    svgs.forEach(svg => {
      svg.innerHTML = '<!-- SVG content truncated -->';
    });

    // Get HTML and truncate if still too long
    let html = clone.outerHTML;
    if (html.length > 5000) {
      html = html.substring(0, 5000) + '... <!-- Truncated -->';
    }

    return html;
  }

  getParentInfo(element) {
    const parent = element.parentElement;
    if (!parent) return null;

    return {
      tagName: parent.tagName.toLowerCase(),
      id: parent.id,
      classes: Array.from(parent.classList)
    };
  }

  getCssPath(el) {
    if (!(el instanceof Element)) return;
    const path = [];
    while (el.nodeType === Node.ELEMENT_NODE) {
      let selector = el.nodeName.toLowerCase();
      if (el.id) {
        selector += '#' + el.id;
        path.unshift(selector);
        break;
      } else {
        let sib = el, nth = 1;
        while (sib = sib.previousElementSibling) {
          if (sib.nodeName.toLowerCase() == selector)
            nth++;
        }
        if (nth != 1)
          selector += ":nth-of-type("+nth+")";
      }
      path.unshift(selector);
      el = el.parentNode;
    }
    return path.join(" > ");
  }

  // 🏗️ PAGE STRUCTURE OUTLINE TOOL
  async getPageStructure(data) {
    const options = {
      maxDepth: data.max_depth || 8,
      maxNodes: data.max_nodes || 400,
      maxChildrenPerGroup: data.max_children_per_group || 6,
      examplesPerGroup: data.examples_per_group || 3,
      format: data.format || 'compact', // 'compact' or 'json'
      // Control flags (default to true for comprehensive view)
      include_interactive: data.include_interactive !== false,
      include_structure: data.include_structure !== false,
      include_metadata: data.include_metadata !== false
    };

    console.log("🏗️ Building comprehensive page structure", options);

    // Initialize registry
    if (!window.__opendiaElementRegistry) {
      window.__opendiaElementRegistry = new Map();
    }

    // 1. Extract Page Metadata & Pagination
    const metadata = this.getPageMetadata();

    // 2. Build Comprehensive Tree
    const budget = { remaining: options.maxNodes };
    const viewportArea = window.innerWidth * window.innerHeight || 1;
    const root = document.body || document.documentElement;

    const outline = this.summarizeElement(root, 0, "root", budget, options, viewportArea);

    // 3. Post-process: Identify Groups & Selectors
    const groups = [];
    this.extractGroupsAndSelectors(outline, groups);

    // 4. Assign logical IDs
    this.assignLogicalIds(outline);

    const result = {
      metadata,
      groups,
      outline
    };

    // Return based on format
    if (options.format === 'compact') {
      const text = this.formatAsComprehensiveText(result, options);
      const response = {
        format: 'compact',
        text,
        metadata,
        groupsCount: groups.length
      };
      console.log("🏗️ getPageStructure returning compact:", response);
      return response;
    }

    console.log("🏗️ getPageStructure returning json:", result);
    return {
      format: 'json',
      ...result
    };
  }

  getPageMetadata() {
    const metadata = {
      title: document.title,
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pagination: null
    };

    // Detect page-level pagination
    const nextLink = document.querySelector('a[rel="next"], link[rel="next"]');
    const prevLink = document.querySelector('a[rel="prev"], link[rel="prev"]');

    if (nextLink || prevLink) {
      metadata.pagination = {
        next: nextLink ? (nextLink.href || nextLink.getAttribute('href')) : null,
        prev: prevLink ? (prevLink.href || prevLink.getAttribute('href')) : null
      };
    }

    // Extract OG data
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogTitle) metadata.ogTitle = ogTitle.content;
    if (ogDesc) metadata.ogDescription = ogDesc.content;

    return metadata;
  }

  summarizeElement(el, depth, id, budget, options, viewportArea) {
    if (budget.remaining <= 0) return null;

    // Register element
    window.__opendiaElementRegistry.set(id, el);

    const bbox = this.getBBoxForOutline(el, viewportArea);
    const interactive = this.isInteractiveElementForOutline(el);
    const landmark = this.isLandmarkForOutline(el);
    const role = this.getRoleForOutline(el);
    const textPreview = this.getVisibleTextForOutline(el, 160);
    const label = this.getElementLabelForOutline(el, textPreview);
    const attrs = this.collectUsefulAttributesForOutline(el);

    const baseNode = {
      kind: "node",
      id,
      tag: el.tagName.toLowerCase(),
      role,
      interactive,
      landmark,
      bbox,
      label,
      textPreview,
      attributes: attrs,
      children: []
    };

    budget.remaining -= 1;
    if (budget.remaining <= 0) {
      baseNode.truncated = true;
      return baseNode;
    }

    if (depth >= options.maxDepth && !interactive && !landmark) {
      baseNode.truncated = true;
      return baseNode;
    }

    const children = this.summarizeChildren(el, depth, id, budget, options, viewportArea);
    baseNode.children = children;
    return baseNode;
  }

  summarizeChildren(parent, depth, parentId, budget, options, viewportArea) {
    if (budget.remaining <= 0) return [];

    const rawChildren = Array.from(parent.children);
    const visibleChildren = rawChildren.filter(el => this.isElementVisibleForOutline(el));

    const childrenInfo = visibleChildren.map((el, index) => {
      const bbox = this.getBBoxForOutline(el, viewportArea);
      const interactive = this.isInteractiveElementForOutline(el);
      const landmark = this.isLandmarkForOutline(el);
      const text = this.getVisibleTextForOutline(el, 240);
      const textLen = text.length;
      const areaBucket = this.getAreaBucket(bbox.viewportAreaRatio);
      const score = this.getImportanceScore(bbox, interactive, landmark, textLen);
      return { el, index, bbox, interactive, landmark, textLen, score, areaBucket };
    });

    // Group by structural signature
    const groupsMap = new Map();
    for (const child of childrenInfo) {
      const signature = this.getSignatureForOutline(child.el, child.areaBucket);
      const group = groupsMap.get(signature);
      if (group) {
        group.members.push(child);
      } else {
        groupsMap.set(signature, { signature, members: [child] });
      }
    }

    const groups = Array.from(groupsMap.values());
    groups.sort((a, b) => {
      const aMax = Math.max(...a.members.map(m => m.score));
      const bMax = Math.max(...b.members.map(m => m.score));
      return bMax - aMax;
    });

    const out = [];

    for (let gIndex = 0; gIndex < groups.length; gIndex++) {
      if (budget.remaining <= 0) break;

      const group = groups[gIndex];
      const members = group.members.sort((a, b) => a.index - b.index); // Keep original order

      if (members.length <= options.maxChildrenPerGroup) {
        // Individual nodes
        for (const m of members) {
          if (budget.remaining <= 0) break;
          const childId = this.makeChildIdForOutline(parentId, m.el, m.index);
          const childNode = this.summarizeElement(m.el, depth + 1, childId, budget, options, viewportArea);
          if (childNode) out.push(childNode);
        }
      } else {
        // Repeated Group
        const groupId = `${parentId}/group[${gIndex + 1}]`;
        const examples = [];
        const exampleCount = Math.min(options.examplesPerGroup, members.length);

        // Store group elements in registry
        window.__opendiaElementRegistry.set(groupId, members.map(m => m.el));

        for (let i = 0; i < exampleCount; i++) {
          if (budget.remaining <= 0) break;
          const m = members[i];
          const exId = this.makeChildIdForOutline(parentId, m.el, m.index);
          const exNode = this.summarizeElement(m.el, depth + 1, exId, budget, options, viewportArea);
          if (exNode) examples.push(exNode);
        }

        const groupNode = {
          kind: "repeated_group",
          id: groupId,
          signature: group.signature,
          total: members.length,
          shown: examples.length,
          omitted: members.length - examples.length,
          examples,
          // Contextual info
          containerSelector: this.generateSelector(parent),
          itemSelector: this.generateSelector(members[0].el, parent)
        };

        budget.remaining -= 1;
        out.push(groupNode);
      }
    }

    return out;
  }

  // Generate robust CSS selector
  generateSelector(el, context = null) {
    if (!el) return '';

    // 1. ID
    if (el.id) return `#${el.id}`;

    // 2. Classes
    if (el.className && typeof el.className === 'string') {
      const classes = el.className.split(/\s+/).filter(c => c && !c.match(/^[0-9]/));
      if (classes.length > 0) {
        // Use most specific class combination
        return `.${classes.join('.')}`;
      }
    }

    // 3. Tag + Attributes
    const tag = el.tagName.toLowerCase();
    if (el.getAttribute('name')) return `${tag}[name="${el.getAttribute('name')}"]`;
    if (el.getAttribute('role')) return `${tag}[role="${el.getAttribute('role')}"]`;

    // 4. Tag + Nth-child (if context provided)
    if (context) {
      return tag; // Simple tag if we are looking for children of context
    }

    return tag;
  }

  extractGroupsAndSelectors(node, groups) {
    if (!node) return;

    if (node.kind === 'repeated_group') {
      // Analyze the group items to find common data fields
      const itemSchema = this.analyzeGroupSchema(node.examples[0]);

      groups.push({
        id: node.id,
        count: node.total,
        containerSelector: node.containerSelector,
        itemSelector: node.itemSelector,
        schema: itemSchema
      });
    }

    if (node.children) {
      node.children.forEach(child => this.extractGroupsAndSelectors(child, groups));
    }
    if (node.examples) {
      node.examples.forEach(ex => this.extractGroupsAndSelectors(ex, groups));
    }
  }

  analyzeGroupSchema(exampleNode) {
    const schema = {};

    const traverse = (n, path = '') => {
      if (!n) return;

      // Look for data-rich elements
      if (n.textPreview && n.textPreview.length > 0 && n.textPreview.length < 100) {
        const key = n.attributes?.classes?.[0] || n.tag;
        const selector = this.generateSelector(window.__opendiaElementRegistry.get(n.id));
        schema[path + key] = { selector, example: n.textPreview };
      }

      if (n.tag === 'img' && n.attributes?.src) {
        schema[path + 'image'] = { selector: 'img', attribute: 'src' };
      }

      if (n.tag === 'a' && n.attributes?.href) {
        schema[path + 'link'] = { selector: 'a', attribute: 'href' };
      }

      if (n.children) {
        n.children.forEach(child => traverse(child, path));
      }
    };

    traverse(exampleNode);
    return schema;
  }

  assignLogicalIds(node, prefix = '', counters = {}) {
    if (!node) return;

    // Root node
    if (!prefix) {
      node.logicalId = 'root';
      prefix = 'root';
    } else {
      // Detect node type for appropriate prefix
      const nodeType = this.detectLogicalNodeType(node);

      if (!counters[nodeType]) counters[nodeType] = 0;
      counters[nodeType]++;

      // Generate logical ID
      const typeCode = nodeType[0].toUpperCase();
      node.logicalId = `${prefix === 'root' ? '' : prefix + '.'}${typeCode}${counters[nodeType]}`;
    }

    // Keep original path ID for retrieval
    node.pathId = node.id;

    // Recurse to children
    if (node.kind === 'repeated_group' && node.examples) {
      const childCounters = {};
      node.examples.forEach(example => {
        this.assignLogicalIds(example, node.logicalId, childCounters);
      });
    } else if (node.children) {
      const childCounters = {};
      node.children.forEach(child => {
        this.assignLogicalIds(child, node.logicalId, childCounters);
      });
    }
  }

  detectLogicalNodeType(node) {
    // Detect what kind of element this is for ID assignment
    if (node.kind === 'repeated_group') return 'group';
    if (node.landmark) {
      if (node.tag === 'header') return 'header';
      if (node.tag === 'nav') return 'nav';
      if (node.tag === 'footer') return 'footer';
      return 'section';
    }
    if (node.tag === 'nav') return 'nav';

    const classes = (node.attributes?.classes || []).join(' ');

    // Card/tile detection
    if (/grid|col|card|tile|item/.test(classes)) return 'card';

    // Section detection
    if (/section|container|content/.test(classes)) return 'section';

    // Interactive elements
    if (node.interactive) return 'control';

    // Default to element
    return 'element';
  }

  formatAsComprehensiveText(result, options) {
    const lines = [];
    const { metadata, groups, outline } = result;

    // 1. Metadata Header
    lines.push(`=== PAGE ANALYSIS ===`);
    lines.push(`Title: ${metadata.title}`);
    lines.push(`URL: ${metadata.url}`);
    if (metadata.pagination) {
      lines.push(`Pagination: ${metadata.pagination.next ? '[Next Page Available]' : 'Single Page'}`);
    }
    lines.push('');

    // 2. Identified Groups (High level summary)
    if (groups.length > 0) {
      lines.push(`=== DETECTED REPEATED GROUPS (${groups.length}) ===`);
      groups.forEach((g, i) => {
        lines.push(`[${g.id}] ${g.count} items`);
        lines.push(`  Selector: ${g.containerSelector} > ${g.itemSelector}`);
        lines.push(`  Schema: ${Object.keys(g.schema).slice(0, 5).join(', ')}`);
      });
      lines.push('');
    }

    // 3. Structural Tree (TOON-ish format)
    lines.push(`=== STRUCTURE TREE ===`);
    lines.push(this.formatToonTree(outline));

    return lines.join('\n');
  }

  formatToonTree(node, depth = 0) {
    if (!node) return '';

    // Skip layout noise elements
    if (this.shouldSkipInOutline(node)) return '';

    const indent = '  '.repeat(depth);
    const parts = [];

    // Use logical ID for display (fallback to path ID if not assigned)
    const displayId = node.logicalId || node.id;
    parts.push(displayId);

    // Tag and classes
    let selector = node.tag;
    if (node.attributes?.id) selector += `#${node.attributes.id}`;
    if (node.attributes?.classes?.length) selector += `.${node.attributes.classes.join('.')}`;
    parts.push(selector);

    // Flags
    if (node.interactive) parts.push('🔵');
    if (node.landmark) parts.push('⭐');

    // Content
    if (node.kind === 'repeated_group') {
      parts.push(`[GROUP: ${node.total} items]`);
    } else if (node.label) {
      parts.push(`"${node.label.substring(0, 30)}${node.label.length > 30 ? '...' : ''}"`);
    } else if (node.textPreview) {
      parts.push(`"${node.textPreview.substring(0, 30)}${node.textPreview.length > 30 ? '...' : ''}"`);
    }

    // Attributes
    if (node.attributes?.href) parts.push(`→ ${node.attributes.href}`);
    if (node.attributes?.value) parts.push(`=${node.attributes.value}`);

    const line = `${indent}${parts.join(' ')}`;
    const lines = [line];

    // Children - sort by Y position at top levels
    let children = node.children || [];
    if (node.kind === 'repeated_group') {
      node.examples.forEach((ex, i) => {
        lines.push(`${indent}  Example ${i+1}:`);
        lines.push(this.formatToonTree(ex, depth + 2));
      });
    } else if (children.length > 0) {
      // Sort children by Y position if we're at shallow depth
      if (depth <= 2) {
        children = this.sortByVisualPosition(children);
      }

      children.forEach(child => {
        const childOutput = this.formatToonTree(child, depth + 1);
        if (childOutput) lines.push(childOutput);
      });
    }

    return lines.join('\n');
  }

  shouldSkipInOutline(node) {
    // Skip pure layout elements
    if (node.tag === 'hr') return true;
    if (node.tag === 'br') return true;

    // Skip pure spacing divs
    const classes = (node.attributes?.classes || []).join(' ');
    if (/spacer|separator|divider|break/.test(classes) && !node.interactive) return true;

    // Skip if no text, no interaction, no meaningful children
    if (!node.textPreview &&
        !node.label &&
        !node.interactive &&
        (!node.children || node.children.length === 0)) {
      return true;
    }

    return false;
  }

  sortByVisualPosition(nodes) {
    // Sort by Y coordinate for visual ordering
    return nodes.slice().sort((a, b) => {
      const aY = a.bbox?.y || 0;
      const bY = b.bbox?.y || 0;
      return aY - bY;
    });
  }



  isElementVisibleForOutline(el) {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom < 0 || rect.top > window.innerHeight * 3) return false;
    return true;
  }

  getBBoxForOutline(el, viewportArea) {
    const rect = el.getBoundingClientRect();
    const area = Math.max(0, rect.width * rect.height);
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      area: Math.round(area),
      viewportAreaRatio: viewportArea ? area / viewportArea : 0
    };
  }

  getImportanceScore(bbox, interactive, landmark, textLen) {
    const areaScore = Math.log(1 + bbox.viewportAreaRatio * 1000);
    const interScore = interactive ? 4 : 0;
    const landScore = landmark ? 3 : 0;
    const textScore = Math.log(1 + textLen);
    return 3 * areaScore + interScore + landScore + textScore;
  }

  getAreaBucket(ratio) {
    if (ratio > 0.5) return "XL";
    if (ratio > 0.2) return "L";
    if (ratio > 0.05) return "M";
    if (ratio > 0.01) return "S";
    return "XS";
  }

  isInteractiveElementForOutline(el) {
    const tag = el.tagName.toLowerCase();
    const role = this.getRoleForOutline(el);
    const hasClick = typeof el.onclick === "function";

    if (["a", "button", "input", "select", "textarea", "summary"].includes(tag)) {
      return true;
    }

    if (["button", "link", "checkbox", "radio", "tab", "menuitem", "textbox", "combobox", "slider", "switch"].includes(role)) {
      return true;
    }

    if (el.tabIndex >= 0) return true;
    if (hasClick) return true;

    const style = window.getComputedStyle(el);
    if (style.cursor === "pointer") return true;

    return false;
  }

  isLandmarkForOutline(el) {
    const tag = el.tagName.toLowerCase();
    const role = this.getRoleForOutline(el);

    if (["header", "nav", "main", "aside", "footer"].includes(tag)) {
      return true;
    }

    if (["banner", "navigation", "main", "complementary", "contentinfo", "region"].includes(role)) {
      return true;
    }

    return false;
  }

  getRoleForOutline(el) {
    return el.getAttribute("role") || null;
  }

  getVisibleTextForOutline(el, maxLen) {
    let text = "";
    if (el instanceof HTMLElement) {
      text = el.innerText || "";
    } else {
      text = el.textContent || "";
    }
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.length > maxLen) {
      return normalized.slice(0, maxLen) + "…";
    }
    return normalized;
  }

  getElementLabelForOutline(el, textPreview) {
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();

    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();

    if (el instanceof HTMLImageElement) {
      const alt = el.alt;
      if (alt && alt.trim()) return alt.trim();
    }

    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const placeholder = el.getAttribute("placeholder");
      if (placeholder && placeholder.trim()) return placeholder.trim();
    }

    return textPreview || undefined;
  }

  collectUsefulAttributesForOutline(el) {
    const attrs = {};
    const id = el.getAttribute("id");
    if (id) attrs.id = id;

    if (el.classList && el.classList.length) {
      const classes = Array.from(el.classList).slice(0, 3);
      if (classes.length) attrs.classes = classes;
    }

    if (el instanceof HTMLAnchorElement && el.href) {
      attrs.href = this.simplifyUrlForOutline(el.href);
    }

    if (el instanceof HTMLInputElement) {
      if (el.type) attrs.type = el.type;
      if (el.name) attrs.name = el.name;
    }

    if (el instanceof HTMLButtonElement) {
      if (el.type) attrs.type = el.type;
      if (el.name) attrs.name = el.name;
    }

    return attrs;
  }

  simplifyUrlForOutline(url) {
    try {
      const u = new URL(url, location.href);
      const pathParts = u.pathname.split("/").filter(Boolean);
      let pathSummary = "";
      if (pathParts.length > 2) {
        pathSummary = `/${pathParts[0]}/…/${pathParts[pathParts.length - 1]}`;
      } else if (pathParts.length > 0) {
        pathSummary = `/${pathParts.join("/")}`;
      }
      const queryHint = u.search ? " ?…" : "";
      return `${u.origin}${pathSummary}${queryHint}`;
    } catch {
      if (url.length > 80) return url.slice(0, 80) + "…";
      return url;
    }
  }

  getSignatureForOutline(el, areaBucket) {
    const tag = el.tagName.toLowerCase();
    const role = this.getRoleForOutline(el) || "";
    const classes = el.classList ? Array.from(el.classList).slice(0, 3).sort().join(".") : "";
    const hasImg = !!el.querySelector("img,picture,svg");
    const hasLink = !!el.querySelector("a,button,[role='button']");
    const hasInput = !!el.querySelector("input,select,textarea");
    return [tag, role, classes, areaBucket, hasImg ? "img" : "", hasLink ? "link" : "", hasInput ? "input" : ""].join("|");
  }

  makeChildIdForOutline(parentId, el, index) {
    const tag = el.tagName.toLowerCase();
    const position = index + 1;
    return `${parentId}/${tag}[${position}]`;
  }
}

// Theme Presets Database
const THEME_PRESETS = {
  "dark_hacker": {
    name: "🖤 Dark Hacker",
    css: `
      * {
        background: #0a0a0a !important;
        color: #00ff00 !important;
        font-family: 'Courier New', monospace !important;
      }
      a { color: #00ffff !important; }
      body::before {
        content: ''; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="50" font-size="10" fill="%23003300">01010101</text></svg>');
        opacity: 0.1; pointer-events: none; z-index: -1;
      }
    `
  },
  "retro_80s": {
    name: "📼 Retro 80s",
    css: `
      * {
        background: linear-gradient(45deg, #ff0080, #8000ff) !important;
        color: #ffffff !important;
        font-family: 'Arial Black', sans-serif !important;
        text-shadow: 2px 2px 4px #000000 !important;
      }
      body { animation: retroPulse 2s infinite; }
      @keyframes retroPulse { 0%, 100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(180deg); } }
    `
  },
  "rainbow_party": {
    name: "🌈 Rainbow Party",
    css: `
      body {
        background: linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet) !important;
        background-size: 400% 400% !important;
        animation: rainbowShift 3s ease infinite !important;
      }
      @keyframes rainbowShift {
        0%, 100% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
      }
      * { color: white !important; text-shadow: 1px 1px 2px black !important; }
    `
  },
  "minimalist_zen": {
    name: "🧘 Minimalist Zen",
    css: `
      * {
        background: #f8f8f8 !important;
        color: #333333 !important;
        font-family: 'Georgia', serif !important;
        line-height: 1.6 !important;
      }
      body { max-width: 800px; margin: 0 auto; padding: 20px; }
    `
  },
  "high_contrast": {
    name: "🔍 High Contrast",
    css: `
      * {
        background: #000000 !important;
        color: #ffffff !important;
        font-family: Arial, sans-serif !important;
        font-weight: bold !important;
      }
      a { color: #ffff00 !important; }
    `
  },
  "cyberpunk": {
    name: "🤖 Cyberpunk",
    css: `
      * {
        background: #0d1117 !important;
        color: #ff006e !important;
        font-family: 'Courier New', monospace !important;
      }
      a { color: #00ffff !important; }
      body {
        background-image:
          linear-gradient(90deg, transparent 79px, #abced4 79px, #abced4 81px, transparent 81px),
          linear-gradient(#eee .1em, transparent .1em);
        background-size: 81px 1.2em;
      }
    `
  },
  "pastel_dream": {
    name: "🌸 Pastel Dream",
    css: `
      * {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
        color: #2c3e50 !important;
        font-family: 'Comic Sans MS', cursive !important;
      }
      body { filter: sepia(20%) saturate(80%); }
    `
  },
  "newspaper": {
    name: "📰 Newspaper",
    css: `
      * {
        background: #ffffff !important;
        color: #000000 !important;
        font-family: 'Times New Roman', serif !important;
        line-height: 1.4 !important;
      }
      body {
        column-count: 2;
        column-gap: 2em;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }
    `
  }
};

// Initialize the automation system
const browserAutomation = new BrowserAutomation();

} // End of injection guard

# OpenDia Roadmap

> **Last Updated:** December 26, 2024

This document outlines the planned iterations for improving OpenDia, building on our vision of creating a **human-AI shared context** for browser automation. Each phase builds upon the previous, with clear objectives and success criteria.

---

## Current State Summary

OpenDia is an open-source browser automation framework that uniquely enables AI agents to control a user's real browser session. Unlike headless automation tools (Playwright, Puppeteer), OpenDia:

1. **Operates in the User's Authenticated Context** - Sees exactly what the user sees, including logged-in sessions, personalized content, and A/B test variants.

2. **Bypasses Bot Detection** - Requests originate from a genuine user browser, making them invisible to anti-bot systems.

3. **Supports User Intervention** - The `select_element` tool allows agents to request that users manually select elements, creating a human-in-the-loop feedback mechanism.

4. **Injects Scripts Past CSP** - The Chrome extension can inject scripts into pages that bypass Content Security Policy restrictions, enabling deep introspection via `page_execute_script`.

5. **Provides 19+ Browser Tools** - Comprehensive toolset including page analysis, form filling, tab management, history search, and visual styling.

### Key Unique Features

| Feature | Description | Why It Matters |
|---------|-------------|----------------|
| **Shared Reality** | Agent sees user's exact browser state | No context mismatch, no bot blocks |
| **`select_element` Tool** | Agent requests user to click an element, receives the selector back | Human-in-the-loop learning |
| **CSP Bypass Injection** | Scripts run in MAIN world via extension | Deep page introspection |
| **Background Tab Support** | All tools work on any tab by ID | Multi-tab research workflows |

---

## Phase 1: MCP Server Modernization (Q1 2025)

### Objective
Reduce custom implementation complexity by adopting a standardized MCP framework, making it easier for contributors and enabling a plug-and-play ecosystem.

### Current Pain Points
- Custom 2,700+ line `server.js` handling MCP protocol manually
- Manual SSE/WebSocket/stdio transport management
- No standardized middleware or authentication patterns
- Difficult for external agents to connect remotely

### Planned Improvements

#### 1.1 Migrate to FastMCP or EasyMCP Framework
**Priority:** High | **Effort:** Medium

Evaluate and adopt one of these TypeScript MCP frameworks:

| Framework | Pros | Cons |
|-----------|------|------|
| **FastMCP** | Production-ready, auth built-in, CLI tools, validation (Zod) | More opinionated |
| **EasyMCP** | Express-like simplicity, decorators API, minimal boilerplate | Less mature ecosystem |
| **mcp-use** | Full-featured, UI widgets support, streaming UI | Heavier dependency footprint |

**Recommended:** Start with **FastMCP** for its balance of simplicity, built-in features, and production readiness.

**Migration Steps:**
1. Refactor tool definitions to use FastMCP's declarative format
2. Replace custom transport handling with FastMCP's SSE/stdio support
3. Add Zod schemas for input validation
4. Enable built-in CORS and authentication middleware

#### 1.2 Simplified Remote Connection via Tailscale
**Priority:** High | **Effort:** Low

Enable external agents to connect to OpenDia without complex setup.

**Why Tailscale:**
- Zero-config mesh VPN - agent machines join same tailnet
- No port forwarding, no public exposure
- Automatic NAT traversal and encryption
- Free tier sufficient for most use cases

**Implementation:**
1. Document Tailscale setup in `docs/remote-access.md`
2. Add `tailscale-opendia` connection guide
3. Create optional `--tailscale` flag that outputs tailnet-accessible URL
4. Example: Agent on server connects to `http://user-laptop.tail12345.ts.net:5556/sse`

**Alternative: ngrok (already supported)**
- Good for quick demos
- Free tier has limitations (changing URLs)
- Already implemented via `--tunnel` flag

#### 1.3 OAuth/Token-Based Authentication
**Priority:** Medium | **Effort:** Medium

Add optional authentication for remote connections:
- JWT token validation for SSE endpoint
- Token generation via CLI command
- Environment variable configuration

### Success Criteria
- [ ] MCP server under 500 lines (vs 2,700 today)
- [ ] External agent can connect via Tailscale in < 5 minutes
- [ ] All existing tools pass tests with new framework
- [ ] Documentation for remote agent setup

---

## Phase 2: Extension Framework Upgrade (Q1-Q2 2025)

### Objective
Migrate the Chrome extension to WXT framework for improved developer experience, cross-browser support, and maintainability.

### Current Pain Points
- Manual build scripts for Chrome/Firefox
- No hot module replacement during development
- Manual Manifest V3/V2 management
- No TypeScript support in extension code

### Planned Improvements

#### 2.1 WXT Migration
**Priority:** High | **Effort:** High

[WXT](https://wxt.dev/) provides:
- Hot reload during development
- TypeScript out of the box
- Auto-imports for browser APIs
- Single codebase → multiple browser targets
- Built-in support for content scripts, background, popup, sidepanel

**Migration Plan:**
1. Initialize WXT project structure
2. Port background script logic
3. Port content scripts (DOM analysis, selection, execution)
4. Port sidepanel UI
5. Configure manifests for Chrome MV3 + Firefox MV2
6. Update build/release workflows

#### 2.2 Enhanced Sidepanel (Companion Interface)
**Priority:** Medium | **Effort:** Medium

Improve the debug sidepanel to become a true "Companion Interface":
- Real-time display of agent's view (page structure)
- Visual highlighting of elements the agent is targeting
- User correction mode for Playbook training
- Status of MCP connection and pending operations

### Success Criteria
- [ ] WXT-based extension builds for Chrome, Firefox, Edge
- [ ] HMR working during development
- [ ] All existing tools functional
- [ ] Sidepanel shows real-time agent context

---

## Phase 3: Comprehensive Test Suite (Q2 2025)

### Objective
Establish robust test coverage to ensure reliability and enable confident refactoring.

### Current Test Coverage
- Integration tests for MCP server connection
- `page_execute_script` CSP tests
- `select_element` E2E tests (Playwright)
- `page_structure` format comparison tests

### Planned Improvements

#### 3.1 Unit Test Coverage
**Priority:** High | **Effort:** Medium

Add Vitest unit tests for:
- `server.js` tool handlers
- Result formatters
- Page analysis algorithms (structure detection, grouping)
- Content script DOM utilities

**Target:** 80%+ coverage on core logic

#### 3.2 E2E Test Expansion
**Priority:** High | **Effort:** High

Expand Playwright E2E tests:
- All 19+ tools tested against real pages
- Anti-detection bypass verification
- Multi-tab workflow tests
- Form filling with various input types
- File upload scenarios

**Test Fixtures:**
- Create HTML test pages for each tool
- Mock server for isolated testing
- Screenshot comparison for visual tools

#### 3.3 Cross-Browser Testing
**Priority:** Medium | **Effort:** Medium

Add Playwright tests running against:
- Chrome (MV3)
- Firefox (MV2)
- Edge (MV3)

Use Playwright's browser contexts to test extension in each environment.

#### 3.4 CI/CD Integration
**Priority:** Medium | **Effort:** Low

- GitHub Actions workflow for test suite
- Build verification for extensions
- Automated release creation
- npm package publishing

### Success Criteria
- [ ] 80%+ unit test coverage on server
- [ ] E2E tests for all major tools
- [ ] Tests run in CI on every PR
- [ ] Cross-browser test matrix passing

---

## Phase 4: Playbook System (Q3 2025)

### Objective
Implement the "Active Learning" workflow where user corrections create reusable extraction rules.

### Concept Overview

**Playbooks** are domain-specific extraction rules:
```yaml
name: "amazon_product_page"
patterns:
  - url_match: "amazon.com/*/dp/*"
    schema:
      - field: "title"
        selector: "#productTitle"
      - field: "price"
        selector: ".a-price-whole"
      - field: "rating"
        selector: "#averageCustomerReviews"
```

### Planned Features

#### 4.1 Playbook Storage
- Local storage in browser extension
- Export/import as JSON/YAML
- Optional cloud sync (user opt-in)

#### 4.2 Automatic Playbook Matching
- Monitor navigation events
- Match URL patterns to stored playbooks
- Auto-extract data when match found
- Display in Companion Interface

#### 4.3 Correction Workflow
1. Agent suggests extraction
2. User clicks "Wrong!" on incorrect element
3. User clicks correct element via `select_element`
4. Playbook updated with correction
5. Future extractions use corrected rule

#### 4.4 Headless Mode Export
- Export playbooks for use in headless automation
- Same rules work in Playwright/Puppeteer
- "Train once, run anywhere" pattern

### Success Criteria
- [ ] Create/edit/delete playbooks via sidepanel
- [ ] Auto-extraction on known pages
- [ ] User correction updates playbooks
- [ ] Playbooks exportable for headless use

---

## Phase 5: Advanced Agent Features (Q4 2025)

### Objective
Enable more sophisticated agent workflows and improve the AI's understanding of page structure.

### Planned Features

#### 5.1 Enhanced `page_structure` Output
- Region-based output format (YAML-like)
- Better card/grid detection
- Improved semantic grouping
- Reduced token usage

#### 5.2 Visual Region Highlighting
When agent requests `page_structure`, optionally overlay visual boxes on the page showing detected regions.

#### 5.3 Multi-Page Workflow Support
- State persistence across tab switches
- Workflow recording and playback
- Session context management

#### 5.4 Screenshot Tool Enhancement
- Annotated screenshots with element labels
- Region-specific screenshots
- Comparison screenshots (before/after action)

### Success Criteria
- [ ] page_structure 50% smaller output
- [ ] Visual debugging mode
- [ ] Workflow recording works across tabs

---

## Long-Term Vision

### Native Desktop Companion App
- Electron-based desktop app
- Direct integration with local AI (Ollama, llama.cpp)
- Visual workflow builder
- Playbook management dashboard

### Supervised Learning Mode
- Record complete browsing sessions
- AI learns user patterns
- Suggest automations proactively

### Browser Extension Marketplace
- Publish to Chrome Web Store
- Firefox Add-ons
- Edge Add-ons

---

## Priority Summary

| Phase | Timeframe | Key Deliverable |
|-------|-----------|-----------------|
| **Phase 1** | Q1 2025 | MCP framework migration + remote access |
| **Phase 2** | Q1-Q2 2025 | WXT extension framework |
| **Phase 3** | Q2 2025 | Comprehensive test suite |
| **Phase 4** | Q3 2025 | Playbook system |
| **Phase 5** | Q4 2025 | Advanced agent features |

---

## Contributing

We welcome contributions! Priority areas:

1. **Test Coverage** - Add tests for existing tools
2. **Documentation** - Improve setup guides
3. **Tool Enhancements** - Improve existing tools
4. **New Tools** - Propose and implement new capabilities
5. **Cross-Browser Fixes** - Firefox and Edge compatibility

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## Related Documentation

- [VISION.md](VISION.md) - Project vision and core concepts
- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [USE_CASES.md](USE_CASES.md) - Workflow examples
- [docs/tools/](docs/tools/) - Tool-specific documentation
- [tests/README.md](tests/README.md) - Testing guide

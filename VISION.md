# OpenDia Project Vision: The Human-AI Shared Context

## The Higher-Level Goal

The ultimate goal of OpenDia is not just "browser automation" or "scraping"—it is to create a **shared reality between the user and the AI Agent**.

Current AI agents operate in a "black box," often using headless browsers in data centers that see a different version of the web than the user (due to geo-blocking, bot detection, or A/B testing). OpenDia bridges this gap by embedding the agent **directly into the user's browser context**.

This "Combined Vision" approach ensures:
1.  **Truth & Confidence**: The agent sees *exactly* what the user sees. If the user is looking at a flight price, the agent extracts *that* price, not a cached or bot-blocked version.
2.  **Implicit Context**: The agent understands the user's intent based on their open tabs, navigation history, and active focus, enabling proactive assistance without explicit prompting.
3.  **Seamless Handoff**: The workflow moves fluidly between **Passive Observation** (agent watching), **Active Assistance** (agent suggesting), and **Full Automation** (agent doing), all within the same session.

## Core Components

### 1. OpenDia Chrome Extension (The "Shared Eye")
This is the critical link that gives the agent "sight" within the user's specific context.
-   **Functionality**: Exposes the *exact* DOM, network state, and visual layout of the user's active session to the MCP server.
-   **Key Advantage**: Bypasses the "Bot Detection" arms race. Since the requests originate from a real, authenticated user session, they are indistinguishable from normal browsing.
-   **Key Feature**: `page_execute_script` allows for deep introspection of the page state that only a real user browser can provide.

### 2. MCP Server (The "Bridge")
The central nervous system that translates the browser's raw state into semantic understanding for the AI.
-   **Current State**: Custom MCP server.
-   **Future State**: Migration to a standard framework (e.g., [mcp-use](https://mcp-use.com/)) to enable a plug-and-play ecosystem of tools.

### 3. Companion Interface (The "Collaborator")
A sidebar or web app that visualizes the "Shared Reality."
-   **Role**: It confirms to the user *what the agent sees*.
-   **Interaction**: If the agent highlights a data point, the user can instantly verify it. This "What You See Is What You Get" (WYSIWYG) interaction builds immense trust in the data extraction process.

## Alternatives Considered: BrowserOS

An alternative approach to browser automation is **BrowserOS**, a custom Chrome browser build with an MCP server directly built-in.

### What is BrowserOS?
BrowserOS is a specialized browser that exposes a robust, mature MCP server for controlling the browser (navigation, clicks, execution, screenshots, etc.). It's a viable, stable option that:
-   **Supports Human-in-the-Loop**: Can be used as your main browser with your Chrome profile imported (all your logins, sessions, etc.)
-   **Mature & Tested**: Well-established with comprehensive tool coverage
-   **"Shared Reality" Compatible**: If used as your main browser, the agent sees exactly what you see

### Why OpenDia Instead?
The critical difference is **extensibility**:

1.  **Cannot Add Custom Tools**: BrowserOS has a fixed set of MCP tools. You cannot extend it with custom capabilities like:
    -   A "Select Element" tool that lets the user click an element on the page and send that selector back to the agent
    -   Custom triggers for "Learn this page" workflows initiated from a sidebar
    -   Domain-specific extraction utilities tailored to your use case
2.  **No Custom MCP Server Extensions**: The embedded MCP server is closed. You can't add new tools or modify existing behavior to fit specialized workflows.
3.  **UI Limitations**: While functional, it doesn't support a customizable sidebar or companion interface for your specific interaction patterns.

**Verdict**: BrowserOS is an excellent, stable choice for **using existing MCP tools** in a human-browser context. OpenDia is necessary when you need **custom tool development** and a **tailored companion interface** for specialized workflows (e.g., supervised learning for data extraction with user corrections).

## Why OpenDia? (The Combined Vision Advantage)

Why not just use standard scraping agents? The power lies in the **Combined Vision** of Human + AI:

1.  **Context Matching (The "It Works on My Machine" Fix)**
    *   **Problem**: A cloud-based agent tries to scrape a site but gets blocked by a CAPTCHA, sees a different regional price, or hits a login wall.
    *   **Solution**: OpenDia piggybacks on the user's *already successful* session. If the user can see it, the agent can see it. No need to solve CAPTCHAs or spoof headers; the access is already authenticated.

2.  **Trust & Verification**
    *   **Problem**: Users hesitate to trust "black box" scrapers for critical data (e.g., financial research, content creation).
    *   **Solution**: Because the agent highlights elements *on the user's screen*, the user has 100% confidence in the source. "I see the price on the screen, I see the agent highlight it, I know the data is correct."

3.  **The "Companion" Workflow**
    *   **Passive Monitoring**: The agent "rides along," maintaining context of the user's journey (e.g., "You've looked at 5 different coffee makers").
    *   **Auto-Extraction**: When a known pattern is spotted, data is extracted silently.
    *   **Active Learning**: When the agent is unsure, it asks the user for a simple "point and click" clarification, which instantly repairs the extraction logic for the future.

## The Companion Workflow

The goal is a seamless, "always-on" assistance model:

1.  **Passive Monitoring**: As the user browses, the extension checks the current URL against its database of known "Playbooks".
2.  **Auto-Extraction**:
    *   **Match Found**: If a playbook exists, the extension *automatically* executes the extraction logic in the background. The structured data is instantly available to the user or downstream apps.
    *   **No Match**: The sidebar indicates "No extraction rules found."
3.  **Active Learning**:
    *   The user clicks "Learn this Page".
    *   The agent analyzes the DOM and suggests data points.
    *   **Correction**: If the agent picks the wrong element (e.g., wrong price), the user clicks the *correct* element. The extension captures this interaction, updates the rule, and saves the new Playbook.

## Challenges & Risks

-   **Security**: Executing arbitrary scripts (`page_execute_script`) is powerful but risky. We must ensure the MCP server is secured and only executes trusted code.
-   **Performance**: The "always-on" content script must be lightweight to avoid slowing down the user's browsing.
-   **DOM Volatility**: Webpages change. Playbooks must be robust (using smart selectors, semantic matching) or easily repairable when they break.
-   **Manifest V3 Constraints**: Migrating to WXT and ensuring full functionality within the stricter MV3 environment (especially regarding remote code execution) will require careful architectural design.

## Technical Roadmap

### 1. Framework Migration (WXT)
-   **Goal**: Migrate the Chrome extension to use **[WXT](https://wxt.dev/)**.
-   **Benefit**:
    -   **Developer Experience**: HMR, TypeScript support, auto-imports.
    -   **Cross-Browser**: Write once, deploy to Chrome, Firefox, Edge.
    -   **MV3/MV2 Support**: Seamlessly target different manifest versions.

### 2. MCP Framework Standardization
-   **Goal**: Move away from the custom MCP server implementation.
-   **Target**: Adopt **[mcp-use](https://github.com/mcp-use/mcp-use)** (or similar) to standardize tool definition, transport layers (SSE/Stdio), and server management.

### 3. Enhanced Tooling
-   Continue expanding the toolset, building upon the capabilities of `page_execute_script` to include more granular DOM interaction and visual analysis tools.

# OpenDia System Architecture

This document outlines the high-level architecture of the OpenDia system, highlighting the components that enable its unique "Companion" and "Human-in-the-Loop" capabilities.

## System Diagram

```mermaid
graph TD
    subgraph "User Browser (Chrome/Edge)"
        Page[Target Webpage]
        
        subgraph "OpenDia Extension"
            CS[Content Script]
            BSW[Background Service Worker]
            Sidebar[Sidebar UI / Companion App]
        end
        
        Page <-->|DOM Access & Events| CS
        CS <-->|Message Passing| BSW
        Sidebar <-->|User Input & Feedback| BSW
    end

    subgraph "MCP Layer"
        MCP[MCP Server]
        Transport[Transport (Stdio / SSE)]
    end

    subgraph "Intelligence Layer"
        Agent[AI Agent / LLM]
    end

    BSW <-->|Native Messaging / WebSocket| MCP
    MCP <-->|Protocol| Agent
    
    %% Unique Interactions
    Sidebar -.->|Element Selection Override| Agent
    Agent -.->|Extraction Request| CS
```

## Core Components

### 1. The Browser Extension (The "Body")
-   **Content Script (CS)**: Injected into the target webpage. It has direct access to the DOM.
    -   *Responsibilities*: Reading HTML, executing `page_execute_script`, highlighting elements, capturing user clicks for selection.
-   **Background Service Worker (BSW)**: The orchestrator within the browser.
    -   *Responsibilities*: Managing connection to the MCP server, maintaining state across tab switches, routing messages between the Sidebar and Content Scripts.
-   **Sidebar UI**: The user interface.
    -   *Responsibilities*: Displaying agent status, showing extracted data for review, providing the "Select Element" tool for corrections.

### 2. The MCP Server (The "Bridge")
-   **Role**: Translates high-level Agent intents (e.g., "Extract Price") into low-level browser commands (e.g., `document.querySelector(...)`).
-   **Transport**:
    -   **Stdio**: For local, headless automation or when running the agent locally.
    -   **SSE (Server-Sent Events)**: For connecting to remote agents or web-based LLM interfaces.

### 3. The AI Agent (The "Brain")
-   **Role**: Decides *what* to do based on the page content and user goal.
-   **Logic**:
    -   Receives HTML snapshot or accessibility tree.
    -   Decides which selectors to use.
    -   Generates JSON output.
    -   *Crucially*: Updates its internal "Playbook" for the site based on user feedback.

## Unique Architectural Features

### A. The "Shared Reality" Engine
Unlike Playwright/Puppeteer, which typically spin up a fresh, isolated browser instance, OpenDia inhabits the **user's existing, authenticated reality**.
-   **Context Parity**: The agent sees exactly what the user sees (same cookies, same session, same A/B test variant).
-   **Zero-Config Access**: No need to manage login scripts or 2FA bypasses. If the user is logged in, the agent is logged in.
-   **Bot-Proof**: Requests originate from a genuine user browser with genuine user interaction patterns, making them invisible to most anti-bot systems.

### B. The "Human-in-the-Loop" Feedback Loop
This is the system's key differentiator.
1.  **Prediction**: Agent guesses the data location (e.g., `#price-123`).
2.  **Visualization**: Extension highlights `#price-123` in the browser.
3.  **Correction**: User sees it's wrong, clicks the *actual* price element (`#real-price`).
4.  **Refinement**: The Sidebar captures the unique selector for `#real-price` and sends it back to the Agent.
5.  **Learning**: The Agent updates the "Playbook" for this domain, ensuring the next extraction is correct.

### C. Hybrid Execution Mode
-   **Supervised Mode**: Running in the user's browser with the Sidebar active. Used for training and ad-hoc tasks.
-   **Headless Mode**: The *exact same* MCP tools and Playbooks can be run in a headless browser container for high-volume, automated scraping, using the rules learned during Supervised Mode.

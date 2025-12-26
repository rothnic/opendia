# OpenDia System Architecture & Interaction Design

OpenDia is a **Shared Reality** framework designed for collaborative, human-in-the-loop browser automation. Unlike traditional automation tools that operate in isolation, OpenDia bridges the gap between local user environments and remote AI intelligence.

## 🏗️ System Topology: The "Bridge" Pattern

The system is architected as a series of nested subsystems that span from remote cloud services to your local device.

```mermaid
graph TD
    %% User Figure
    User([fa:fa-user User])

    %% Cloud Subsystem
    subgraph CloudSubsystem [Cloud: Intelligence, Safety & Memory]
        subgraph AppLayer [Interface]
            WebApp[Next.js Application]
        end

        subgraph IntelligenceLayer [Agents & Guardrails]
            AgentBrain{{AI Agent Logic / LLM}}
            SafetyGuard{{Safety & Policy Guardrails}}
            MonitoringAgents{{Monitoring Agents}}
        end

        subgraph StorageLayer [Data Storage]
            ContextStore[(Contextual Store)]
            DomainStore[(Domain Store)]
            SessionStore[(Session Store)]
        end

        subgraph CloudTools [Cloud Tools]
            ExternalTools[Ext. APIs & Data Mgmt]
        end

        WebApp <--> AgentBrain
        WebApp <--> MonitoringAgents
        MonitoringAgents <--> AgentBrain
        AgentBrain --> SafetyGuard
        SafetyGuard <--> ExternalTools
        SafetyGuard <--> StorageLayer
        AgentBrain -.-> ContextStore
    end

    %% Network Hub
    Tunnel[Public SSE Tunnel]

    %% Local Machine Subsystem
    subgraph LocalMachine [User's Local Machine]
        MCP[OpenDia MCP Server Hub]
        
        subgraph Browsers [Browser Context]
            subgraph ExtensionSubsystem [OpenDia Extension Subsystem]
                BG[Background Orchestrator]
                Notify[Notification Manager]
                
                subgraph ToolExecution [Browser Tool Suite]
                    CS_Select[select_element]
                    CS_Structure[page_structure]
                    CS_Script[execute_script]
                    CS_Upload[file_upload]
                end
                
                Sidebar[Sidebar UI]
            end
            
            WebPage[Target Websites]
        end
        
        LocalCLI{{Local CLI Agent}}
    end

    %% Human Interactions
    User -- "Manage Tasks & Feedback" --> WebApp
    User -- "Manual Override / Correction" --> Sidebar
    User -. "System Alerts" .- Notify

    %% Communication Flow
    SafetyGuard -- "Approved Tool Call" --> WebApp
    WebApp -- "Forward" --> Tunnel
    Tunnel -- "Deliver" --> MCP
    MCP -- "WS Bridge" --> BG
    BG <--> ToolExecution
    BG --> Notify
    ToolExecution -- "DOM Access" --> WebPage
    LocalCLI -- "Stdio" --> MCP

    %% Feedback & Learning
    Sidebar -- "Correction Data" --> BG
    BG --> MCP
    MCP --> Tunnel
    Tunnel --> WebApp
    WebApp -- "New Training Examples" --> ContextStore

    %% Styling
    classDef agent fill:#b2dfdb,stroke:#00695c,stroke-width:2px;
    classDef tool fill:#e1f5fe,stroke:#01579b,stroke-width:1px;
    classDef storage fill:#fff9c4,stroke:#fbc02d,stroke-width:1px;
    classDef infra fill:#f5f5f5,stroke:#333,stroke-width:1px;
    classDef safety fill:#ffccbc,stroke:#d84315,stroke-width:2px;

    class AgentBrain,MonitoringAgents,LocalCLI agent;
    class WebApp,MCP,BG,CS_Select,CS_Structure,CS_Script,CS_Upload,Sidebar,ExternalTools,Tunnel,Notify tool;
    class ContextStore,DomainStore,SessionStore storage;
    class WebPage,LocalMachine,CloudSubsystem,Browsers,ExtensionSubsystem infra;
    class SafetyGuard safety;
    style User fill:#333,color:#fff
```

---

## 🎭 Core Scenario: A Human-Agent Session

To understand the architecture, consider this end-to-end workflow:

### 1. The Setup (Local)
The user boots their machine and starts the **OpenDia MCP Server** as a singleton service. This server acts as the local air-traffic controller, waiting for instructions. At the same time, the **Browser Extension** establishes a persistent WebSocket connection to this local server.

### 2. The Instruction (Cloud)
The user visits a **Next.js Web Application** where a specialized AI Agent lives. The user asks: *"Research these companies on LinkedIn and export their current headcounts."*

### 3. The Instruction Chain
*   **The Brain**: The Agent (in the Cloud) decides to use the `page_navigate` tool.
*   **The Delivery**: The Next.js app sends this command through an **SSE (Server-Sent Events) Tunnel** directly to the user's **Local MCP Server**.
*   **The Bridge**: The MCP Server routes this to the **Extension Background Script**.

### 4. Smart Execution (The Library)
Rather than writing raw JavaScript for every click, the Extension utilizes a **Script Execution Engine** with two layers:
*   **Pre-injected Utilities**: A "Standard Library" of optimized functions for form-filling, robust clicking (bypassing CSP), and pattern recognition.
*   **Dynamic Scripts**: Bespoke code generated by the Agent for unique, one-off page analysis.

### 5. Human-in-the-Loop (Shared Reality)
If the Agent encounters a LinkedIn bot-check or an ambiguous "Headcount" label, it invokes `select_element`. 
*   **The UI**: A prompt appears in the user's browser via a **Content Script overlay**.
*   **The Input**: The user hovers over the correct element and clicks. 
*   **The Loop**: The result is sent back up the chain to the Cloud Agent, which now has the high-fidelity metadata (CSS selector, HTML snippet) to continue the task autonomously.

---

## 🧩 Architectural Components

### 1. The Extension Subsystem (The "Hands & Eyes")
-   **Content Scripts (CS)**: Injected into web pages to actually touch the DOM. They provide the visual pulse cursors and toast notifications during selection.
-   **Background Script (BG)**: The "Orchestrator." It maintains the connection to the MCP server and manages the lifecycle of the Sidebar and Content Scripts.
-   **Sidebar/Popup UI**: The "Cockpit." Allows the human to see what the agent is doing, review extracted data, or manually override the agent's actions (**Run Task**, **Perform Adhoc Task**, **Save Task for Later**).

### 2. The Local MCP Server (The "Bridge")
-   **Role**: A stateless, singleton broker that translates agent intents into browser commands.
-   **Connectivity**: Allows multiple agents (Cloud-based, CLI, or IDE) to share the same browser context simultaneously.

### 3. The Cloud Infrastructure (The "Brain & Memory")
-   **Intelligence Layer**:
    -   **AI Agent (LLM)**: Core reasoning engine that decides which tools to invoke based on user goals.
    -   **Monitoring Agents**: Specialized observers that track recurring tasks, identify bottlenecks, and deploy optimized browser utilities.
-   **Advanced Tooling**: The Agent can query **External APIs** and perform complex **Data Management** across your domain datasets.
-   **Backend Storage**:
    -   **Contextual Store**: Captures "Learnings" and past experiences to refine future reasoning.
    -   **Domain Store**: Holds structured domain objects extracted from the web to guide future tasks.
    -   **Session Store**: Manages transient state and agent memory for active workflows.

---

## 🔒 Security & Context
OpenDia's primary architectural advantage is **Context Parity**. Because the automation runs in your real browser:
*   **Authentication**: It uses your existing cookies and sessions. No 2FA scripts required.
*   **Integrity**: Actions are indistinguishable from human activity because they originate from a genuine browser environment with real fingerprints and history.
